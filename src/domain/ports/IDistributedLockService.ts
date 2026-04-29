import type { Result } from '../shared/Result';

export interface DistributedLockError {
  readonly code: 'LOCK_NOT_ACQUIRED' | 'LOCK_EXECUTION_FAILED' | 'LOCK_EXTENSION_FAILED' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

export interface IDistributedLockService {
  /**
   * Executes an operation while holding a distributed lock with automatic extension.
   * The lock will be automatically extended every extensionIntervalMs to prevent expiry
   * during long-running operations.
   *
   * @param lockName - Unique identifier for the lock
   * @param ttlMs - Initial time-to-live for the lock in milliseconds
   * @param operation - Async operation to execute while holding the lock
   * @param extensionIntervalMs - Optional interval for automatic lock extension (default: ttlMs / 3)
   */
  withLock<T>(
    lockName: string,
    ttlMs: number,
    operation: () => Promise<T>,
    extensionIntervalMs?: number
  ): Promise<Result<T, DistributedLockError>>;
}
