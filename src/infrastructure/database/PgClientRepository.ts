import type {
  IClientRepository,
  ClientRepositoryError,
  CreateClientInput,
  UpdateClientInput
} from '@domain/ports';
import type { IClient, AccountingMode } from '@domain/entities';
import { failure, success, type Result } from '@domain/shared';
import type { IPgClient } from './PgTransactionRepository';

interface ClientRow {
  id: string;
  bookkeeper_id: string;
  name: string;
  email: string;
  accounting_mode: AccountingMode;
  qb_company_id: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

/**
 * PostgreSQL implementation of IClientRepository.
 * Follows PgPlatformConnectionRepository patterns:
 * - Constructor takes IPgClient (testable without real PG connection)
 * - Parameterized SQL (no string interpolation)
 * - Snake_case → camelCase mapping via toEntity()
 * - Private toError() for consistent error normalization
 */
export class PgClientRepository implements IClientRepository {
  constructor(private readonly pgClient: IPgClient) {}

  async findById(id: string): Promise<Result<IClient, ClientRepositoryError>> {
    const sql = `
      SELECT id, bookkeeper_id, name, email, accounting_mode, qb_company_id, created_at, updated_at
      FROM clients
      WHERE id = $1
      LIMIT 1;
    `;

    try {
      const result = await this.pgClient.query<ClientRow>(sql, [id]);
      const row = result.rows[0];
      if (!row) {
        return failure({ code: 'NOT_FOUND', message: `Client not found: ${id}`, retryable: false });
      }
      return success(this.toEntity(row));
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  async findByBookkeeperId(bookkeeperId: string): Promise<Result<IClient[], ClientRepositoryError>> {
    const sql = `
      SELECT id, bookkeeper_id, name, email, accounting_mode, qb_company_id, created_at, updated_at
      FROM clients
      WHERE bookkeeper_id = $1
      ORDER BY name ASC;
    `;

    try {
      const result = await this.pgClient.query<ClientRow>(sql, [bookkeeperId]);
      return success(result.rows.map(row => this.toEntity(row)));
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  async create(input: CreateClientInput): Promise<Result<IClient, ClientRepositoryError>> {
    const sql = `
      INSERT INTO clients (id, bookkeeper_id, name, email, accounting_mode, qb_company_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id, bookkeeper_id, name, email, accounting_mode, qb_company_id, created_at, updated_at;
    `;

    try {
      const result = await this.pgClient.query<ClientRow>(sql, [
        input.id,
        input.bookkeeperId,
        input.name,
        input.email,
        input.accountingMode,
        input.qbCompanyId ?? null,
      ]);
      const row = result.rows[0];
      if (!row) {
        return failure({ code: 'DB_ERROR', message: 'Insert returned no row.', retryable: false });
      }
      return success(this.toEntity(row));
    } catch (error) {
      if (this.isDuplicateEmailError(error)) {
        return failure({
          code: 'DUPLICATE_EMAIL',
          message: `A client with email ${input.email} already exists.`,
          retryable: false,
        });
      }
      return failure(this.toError(error));
    }
  }

  async update(id: string, input: UpdateClientInput): Promise<Result<IClient, ClientRepositoryError>> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];
    let paramIdx = 2;

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      params.push(input.name);
    }
    if (input.email !== undefined) {
      setClauses.push(`email = $${paramIdx++}`);
      params.push(input.email);
    }
    if (input.accountingMode !== undefined) {
      setClauses.push(`accounting_mode = $${paramIdx++}`);
      params.push(input.accountingMode);
    }
    if (input.qbCompanyId !== undefined) {
      setClauses.push(`qb_company_id = $${paramIdx++}`);
      params.push(input.qbCompanyId);
    }

    const sql = `
      UPDATE clients
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING id, bookkeeper_id, name, email, accounting_mode, qb_company_id, created_at, updated_at;
    `;

    try {
      const result = await this.pgClient.query<ClientRow>(sql, params);
      const row = result.rows[0];
      if (!row) {
        return failure({ code: 'NOT_FOUND', message: `Client not found: ${id}`, retryable: false });
      }
      return success(this.toEntity(row));
    } catch (error) {
      if (this.isDuplicateEmailError(error)) {
        return failure({
          code: 'DUPLICATE_EMAIL',
          message: `Email already in use: ${input.email ?? ''}`,
          retryable: false,
        });
      }
      return failure(this.toError(error));
    }
  }

  private toEntity(row: ClientRow): IClient {
    return {
      id: row.id,
      bookkeeperId: row.bookkeeper_id,
      name: row.name,
      email: row.email,
      accountingMode: row.accounting_mode,
      qbCompanyId: row.qb_company_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private isDuplicateEmailError(error: unknown): boolean {
    return error instanceof Error &&
      error.message.includes('duplicate key') &&
      error.message.includes('email');
  }

  private toError(error: unknown): ClientRepositoryError {
    if (error instanceof Error) {
      return { code: 'DB_ERROR', message: error.message, retryable: true };
    }
    return { code: 'UNKNOWN', message: 'Unknown client repository error.', retryable: true };
  }
}
