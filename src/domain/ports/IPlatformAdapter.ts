import type { ITransaction, PlatformName } from '../entities/ITransaction';
import type { Result } from '../shared/Result';

/**
 * Port for platform ingestion adapters.
 * Application services depend on this interface (DIP), while
 * concrete API implementations live in infrastructure.
 */
export interface IPlatformAdapter {
  readonly platform: PlatformName;

  /**
   * Pulls and transforms source transactions into CRS transactions.
   */
  fetchData(input: FetchPlatformDataInput): Promise<Result<ITransaction[], PlatformAdapterError>>;
}

export interface FetchPlatformDataInput {
  readonly clientId: string;
  readonly fromDate: string; // YYYY-MM-DD
  readonly toDate: string; // YYYY-MM-DD
  readonly connectionId: string;
  readonly platformUserId?: string;
}

export type PlatformAdapterErrorCode =
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'AUTH_EXPIRED'
  | 'RATE_LIMITED'
  | 'RATE_LIMIT'
  | 'NETWORK_ERROR'
  | 'INVALID_SOURCE_PAYLOAD'
  | 'VALIDATION_FAILED'
  | 'UNKNOWN';

export interface PlatformAdapterError {
  readonly code: PlatformAdapterErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Record<string, string | number | boolean>;
}
