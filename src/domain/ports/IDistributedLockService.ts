import type { Result } from '../shared/Result';

export interface DistributedLockError {
  readonly code: 'LOCK_NOT_ACQUIRED' | 'LOCK_EXECUTION_FAILED' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

export interface IDistributedLockService {
  withLock<T>(
    lockName: string,
    ttlMs: number,
    operation: () => Promise<T>
  ): Promise<Result<T, DistributedLockError>>;
}
