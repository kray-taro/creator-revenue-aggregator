import * as crypto from 'crypto';
import type { IDistributedLockService, DistributedLockError } from '@domain/ports';
import { failure, success, type Result } from '@domain/shared';

export interface IRedisLockClient {
  set(key: string, value: string, mode: 'PX', ttlMs: number, flag: 'NX'): Promise<'OK' | null>;
  eval(script: string, keysCount: number, key: string, value: string): Promise<number>;
}

export class RedlockService implements IDistributedLockService {
  constructor(private readonly redis: IRedisLockClient) {}

  async withLock<T>(
    lockName: string,
    ttlMs: number,
    operation: () => Promise<T>,
    extensionIntervalMs?: number
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

    // Calculate extension interval (default: 1/3 of TTL to ensure 3 extensions before expiry)
    const interval = extensionIntervalMs ?? Math.floor(ttlMs / 3);
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let extensionFailed = false;

    // Start heartbeat to extend lock periodically
    heartbeatTimer = setInterval(async () => {
      try {
        // Extend lock by resetting TTL if we still own it
        const extended = await this.redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
          1,
          lockName,
          token,
          String(ttlMs)
        );
        
        if (extended === 0) {
          extensionFailed = true;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      } catch (error) {
        // Log extension failure but don't interrupt operation
        extensionFailed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }
    }, interval);

    try {
      const output = await operation();
      
      // Clear heartbeat timer
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      
      // Only release lock on successful completion to prevent race conditions
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockName,
        token
      );
      
      // Warn if extension failed during operation
      if (extensionFailed) {
        return failure({
          code: 'LOCK_EXTENSION_FAILED',
          message: `Lock extension failed during operation. Operation completed but exclusivity may have been lost: ${lockName}`,
          retryable: false,
        });
      }
      
      return success(output);
    } catch (error) {
      // Clear heartbeat timer on error
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      
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
