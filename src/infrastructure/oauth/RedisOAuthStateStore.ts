import { failure, success } from '@domain/shared';
import type { IOAuthStateStore, OAuthStateError, OAuthStateMetadata } from '@domain/ports';
import type { Result } from '@domain/shared';

export interface IRedisStateClient {
  set(key: string, value: string, mode: 'EX', ttlSeconds: number, flag: 'NX'): Promise<'OK' | null>;
  eval(script: string, keysCount: number, ...args: string[]): Promise<string | null>;
}

const STATE_KEY_PREFIX = 'oauth:state:';

/**
 * Redis-backed OAuth CSRF state store.
 *
 * Race condition prevention: `validateAndConsumeState` uses a Lua script to
 * atomically GET the value and DEL the key in a single Redis operation.
 * This guarantees that a state can only be consumed once, even under concurrent
 * callback requests (e.g., user double-clicks the authorize button).
 */
export class RedisOAuthStateStore implements IOAuthStateStore {
  constructor(private readonly redis: IRedisStateClient) {}

  async storeState(
    state: string,
    metadata: OAuthStateMetadata,
    expiresInMs: number
  ): Promise<Result<boolean, OAuthStateError>> {
    const key = `${STATE_KEY_PREFIX}${state}`;
    const ttlSeconds = Math.ceil(expiresInMs / 1000);
    const value = JSON.stringify(metadata);

    try {
      const result = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX');
      if (result !== 'OK') {
        return failure({
          code: 'STORE_ERROR',
          message: `State key already exists or Redis rejected the write: ${state}`,
          retryable: false,
        });
      }
      return success(true);
    } catch (error) {
      return failure({
        code: 'STORE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to store OAuth state.',
        retryable: true,
      });
    }
  }

  async validateAndConsumeState(
    state: string
  ): Promise<Result<OAuthStateMetadata, OAuthStateError>> {
    const key = `${STATE_KEY_PREFIX}${state}`;

    // Lua script: atomically GET value and DEL key in a single round-trip.
    // Returns the stored value or nil if the key does not exist.
    const luaScript = `
      local val = redis.call('GET', KEYS[1])
      if val then
        redis.call('DEL', KEYS[1])
        return val
      end
      return nil
    `;

    try {
      const raw = await this.redis.eval(luaScript, 1, key);

      if (raw === null) {
        return failure({
          code: 'STATE_NOT_FOUND',
          message: 'OAuth state not found or already consumed. Possible replay attack or expired state.',
          retryable: false,
        });
      }

      const metadata = JSON.parse(raw) as OAuthStateMetadata;
      return success(metadata);
    } catch (error) {
      return failure({
        code: 'STORE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to consume OAuth state.',
        retryable: true,
      });
    }
  }
}
