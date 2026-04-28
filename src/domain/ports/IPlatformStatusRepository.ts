import type { PlatformName } from '../entities/ITransaction';
import type { Result } from '../shared/Result';

export type PlatformHealthStatus = 'GREEN' | 'YELLOW' | 'RED';

export interface PlatformStatusRecord {
  readonly clientId: string;
  readonly platform: PlatformName;
  readonly status: PlatformHealthStatus;
  readonly lastError?: string;
  readonly updatedAt: string;
}

export interface PlatformStatusRepositoryError {
  readonly code: 'DB_ERROR' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

export interface IPlatformStatusRepository {
  updateStatus(
    clientId: string,
    platform: PlatformName,
    status: PlatformHealthStatus,
    lastError?: string
  ): Promise<Result<PlatformStatusRecord, PlatformStatusRepositoryError>>;
}
