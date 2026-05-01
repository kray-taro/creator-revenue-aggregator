import * as crypto from 'crypto';
import { failure, success, type Result } from '@domain/shared';
import type {
  IBookkeeperRepository,
  IAuthService,
  AuthTokenPair,
  IAuditLogger,
  CreateBookkeeperInput
} from '@domain/ports';
import type { IBookkeeper } from '@domain/entities';
import type { PasswordService } from '@infrastructure/auth/PasswordService';

export interface RegisterInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface AuthenticationResult {
  readonly bookkeeper: IBookkeeper;
  readonly tokens: AuthTokenPair;
}

export interface AuthenticationError {
  readonly code:
    | 'INVALID_CREDENTIALS'
    | 'DUPLICATE_EMAIL'
    | 'BOOKKEEPER_NOT_FOUND'
    | 'TOKEN_ERROR'
    | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Bookkeeper authentication use-case service.
 *
 * PRD Security requirements implemented:
 * - JWT access tokens: 15-min expiry
 * - Refresh token rotation on every use (prevents stolen-token reuse)
 * - Timing-safe password verification (prevents timing attacks)
 * - No plaintext passwords ever logged or stored on domain entities
 *
 * Race condition: duplicate email guarded at DB level (UNIQUE constraint).
 * Concurrent login attempts are stateless (JWT) — no race risk.
 */
export class AuthenticationService {
  constructor(
    private readonly bookkeeperRepository: IBookkeeperRepository,
    private readonly passwordService: PasswordService,
    private readonly authService: IAuthService,
    private readonly auditLogger: IAuditLogger
  ) {}

  async register(input: RegisterInput): Promise<Result<AuthenticationResult, AuthenticationError>> {
    const existingResult = await this.bookkeeperRepository.findByEmail(input.email);
    if (!existingResult.ok) {
      return failure({ code: 'UNKNOWN', message: existingResult.error.message, retryable: true });
    }

    if (existingResult.value !== null) {
      return failure({
        code: 'DUPLICATE_EMAIL',
        message: `An account with email ${input.email} already exists.`,
        retryable: false,
      });
    }

    const passwordHash = await this.passwordService.hash(input.password);

    const createInput: CreateBookkeeperInput = {
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      passwordHash,
    };

    const createResult = await this.bookkeeperRepository.create(createInput);
    if (!createResult.ok) {
      if (createResult.error.code === 'DUPLICATE_EMAIL') {
        return failure({
          code: 'DUPLICATE_EMAIL',
          message: createResult.error.message,
          retryable: false,
        });
      }
      return failure({ code: 'UNKNOWN', message: createResult.error.message, retryable: true });
    }

    const bookkeeper = createResult.value;
    const tokenResult = await this.authService.generateTokenPair(bookkeeper.id, bookkeeper.email);

    if (!tokenResult.ok) {
      return failure({ code: 'TOKEN_ERROR', message: tokenResult.error.message, retryable: false });
    }

    await this.auditLogger.log(bookkeeper.id, 'BOOKKEEPER_REGISTERED', 'success', {
      email: bookkeeper.email,
    });

    return success({ bookkeeper, tokens: tokenResult.value });
  }

  async login(input: LoginInput): Promise<Result<AuthenticationResult, AuthenticationError>> {
    const bookkeeperResult = await this.bookkeeperRepository.findByEmail(input.email);
    if (!bookkeeperResult.ok) {
      return failure({ code: 'UNKNOWN', message: bookkeeperResult.error.message, retryable: true });
    }

    if (bookkeeperResult.value === null) {
      // Return generic error — do not reveal whether email exists (prevents enumeration)
      return failure({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
        retryable: false,
      });
    }

    const bookkeeper = bookkeeperResult.value;

    // Fetch hash separately (not on entity to prevent accidental leakage)
    const hashResult = await (this.bookkeeperRepository as import('@infrastructure/database/PgBookkeeperRepository').PgBookkeeperRepository).findPasswordHash(bookkeeper.id);
    if (!hashResult.ok) {
      return failure({ code: 'UNKNOWN', message: hashResult.error.message, retryable: true });
    }

    const passwordValid = await this.passwordService.verify(input.password, hashResult.value);
    if (!passwordValid) {
      await this.auditLogger.log(bookkeeper.id, 'BOOKKEEPER_LOGIN_FAILED', 'failure', {
        reason: 'invalid_password',
      });
      return failure({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
        retryable: false,
      });
    }

    const tokenResult = await this.authService.generateTokenPair(bookkeeper.id, bookkeeper.email);
    if (!tokenResult.ok) {
      return failure({ code: 'TOKEN_ERROR', message: tokenResult.error.message, retryable: false });
    }

    await this.auditLogger.log(bookkeeper.id, 'BOOKKEEPER_LOGIN', 'success', {
      email: bookkeeper.email,
    });

    return success({ bookkeeper, tokens: tokenResult.value });
  }

  async refreshSession(
    refreshToken: string
  ): Promise<Result<AuthTokenPair, AuthenticationError>> {
    const result = await this.authService.refreshTokenPair(refreshToken);
    if (!result.ok) {
      return failure({
        code: result.error.code === 'REFRESH_TOKEN_REVOKED' ? 'INVALID_CREDENTIALS' : 'TOKEN_ERROR',
        message: result.error.message,
        retryable: result.error.retryable,
      });
    }
    return success(result.value);
  }

  async logout(refreshToken: string): Promise<Result<boolean, AuthenticationError>> {
    const result = await this.authService.revokeRefreshToken(refreshToken);
    if (!result.ok) {
      return failure({ code: 'TOKEN_ERROR', message: result.error.message, retryable: true });
    }
    return success(true);
  }
}
