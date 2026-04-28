import * as crypto from 'crypto';
import type { IDistributedLockService, DistributedLockError } from '../../domain/ports/IDistributedLockService';
import { failure, success, type Result } from '../../domain/shared/Result';

export interface IRedisLockClient {
  set(key: string, value: string, mode: 'PX', ttlMs: number, flag: 'NX'): Promise<'OK' | null>;
  eval(script: string, keysCount: number, key: string, value: string): Promise<number>;
}

export class RedlockService implements IDistributedLockService {
  constructor(private readonly redis: IRedisLockClient) {}

  async withLock<T>(
    lockName: string,
    ttlMs: number,
    operation: () => Promise<T>
  ): Promise<Result<T, DistributedLockError>> {
    const token = crypto.randomUUID();
    const acquired = await this.redis.set(lockName, token, 'PX', ttlMs, 'NX');

    if (acquired !== 'OK') {
      return failure({
        code: 'LOCK_NOT_ACQUIRED',
        message: `Failed to acquire distributed lock: ${lockName}`,
        retryable: true,
      });
    }

    try {
      const output = await operation();
      // Only release lock on successful completion to prevent race conditions
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockName,
        token
      );
      return success(output);
    } catch (error) {
      // Keep lock held on failure to prevent race conditions during rollback/cleanup
      // Lock will expire naturally after TTL, giving time for cleanup
      return failure({
        code: 'LOCK_EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown lock-protected execution failure.',
        retryable: true,
      });
    }
  }
}
