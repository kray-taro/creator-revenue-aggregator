import type { PlatformName } from '../entities/ITransaction';
import type { Result } from '../shared/Result';

export interface PlatformConnection {
  readonly id: string;
  readonly clientId: string;
  readonly platform: PlatformName;
  readonly status: 'active' | 'inactive' | 'expired' | 'error';
  readonly expiresAt?: string;
}

export interface PlatformTokenBundle {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface PlatformConnectionRepositoryError {
  readonly code: 'NOT_FOUND' | 'DB_ERROR' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

export interface IPlatformConnectionRepository {
  findActiveByClientId(clientId: string): Promise<Result<PlatformConnection[], PlatformConnectionRepositoryError>>;
  saveTokens(connectionId: string, tokens: PlatformTokenBundle): Promise<Result<boolean, PlatformConnectionRepositoryError>>;
  getTokens(connectionId: string): Promise<Result<PlatformTokenBundle, PlatformConnectionRepositoryError>>;
}
