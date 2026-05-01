import * as crypto from 'crypto';
import { failure, success, type Result } from '@domain/shared';
import type { IClientRepository, IAuditLogger, CreateClientInput } from '@domain/ports';
import type { IClient, AccountingMode } from '@domain/entities';

export interface InviteClientInput {
  readonly bookkeeperId: string;
  readonly clientName: string;
  readonly clientEmail: string;
  readonly accountingMode?: AccountingMode;
}

export interface InviteClientResult {
  readonly client: IClient;
  readonly inviteToken: string;
  readonly inviteUrl: string;
}

export interface ClientOnboardingError {
  readonly code: 'DUPLICATE_EMAIL' | 'BOOKKEEPER_NOT_FOUND' | 'DB_ERROR' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Handles the "Add Client" onboarding workflow (US-101).
 *
 * Email dispatch is intentionally deferred (Sprint 12 — SendGrid integration).
 * The invite URL is returned to the API caller for manual sharing during beta.
 *
 * Race condition: duplicate email is guarded by a UNIQUE constraint on
 * clients.email at the DB level; the repository maps this to DUPLICATE_EMAIL.
 */
export class ClientOnboardingService {
  constructor(
    private readonly clientRepository: IClientRepository,
    private readonly auditLogger: IAuditLogger,
    private readonly oauthRedirectBaseUrl: string
  ) {}

  async inviteClient(
    input: InviteClientInput
  ): Promise<Result<InviteClientResult, ClientOnboardingError>> {
    const clientId = crypto.randomUUID();
    const inviteToken = crypto.randomBytes(32).toString('hex'); // 256-bit token

    const createInput: CreateClientInput = {
      id: clientId,
      bookkeeperId: input.bookkeeperId,
      name: input.clientName,
      email: input.clientEmail,
      accountingMode: input.accountingMode ?? 'accrual',
    };

    const createResult = await this.clientRepository.create(createInput);

    if (!createResult.ok) {
      if (createResult.error.code === 'DUPLICATE_EMAIL') {
        return failure({
          code: 'DUPLICATE_EMAIL',
          message: `A client with email ${input.clientEmail} already exists.`,
          retryable: false,
        });
      }
      return failure({
        code: 'DB_ERROR',
        message: createResult.error.message,
        retryable: createResult.error.retryable,
      });
    }

    const client = createResult.value;
    const inviteUrl = `${this.oauthRedirectBaseUrl}/invite/${inviteToken}`;

    await this.auditLogger.log(client.id, 'CLIENT_INVITE_CREATED', 'success', {
      bookkeeperId: input.bookkeeperId,
      clientEmail: input.clientEmail,
      accountingMode: createInput.accountingMode,
    });

    return success({ client, inviteToken, inviteUrl });
  }

  async getClientsByBookkeeper(
    bookkeeperId: string
  ): Promise<Result<IClient[], ClientOnboardingError>> {
    const result = await this.clientRepository.findByBookkeeperId(bookkeeperId);
    if (!result.ok) {
      return failure({
        code: 'DB_ERROR',
        message: result.error.message,
        retryable: result.error.retryable,
      });
    }
    return success(result.value);
  }
}
