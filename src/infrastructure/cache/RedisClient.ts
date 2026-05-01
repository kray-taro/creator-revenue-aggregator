import Redis, { type RedisOptions } from 'ioredis';
import type { Logger } from '@composition/Logger';

export type RedisPurpose = 'shared' | 'bclient' | 'subscriber' | 'redlock';

export interface RedisConnectionFactoryOptions {
  readonly url: string;
  readonly logger: Logger;
  /**
   * Constructor override for tests. Defaults to `new Redis(url, options)`.
   */
  readonly clientFactory?: (url: string, options: RedisOptions) => Redis;
}

/**
 * Centralised ioredis client factory.
 *
 * Purpose matters because BullMQ, Redlock, the OAuth state store, and the
 * `RedlockService` have incompatible expectations:
 *
 *  - **bclient**: BullMQ workers use blocking BRPOPLPUSH; the client must have
 *    `maxRetriesPerRequest: null` and `enableReadyCheck: false`. Sharing this
 *    connection with non-blocking callers would starve them.
 *  - **redlock**: must fail fast instead of buffering while disconnected.
 *    `enableOfflineQueue: false` ensures a lock attempt errors immediately
 *    if Redis is unreachable, rather than silently waiting.
 *  - **subscriber**: same connection rules as bclient (BullMQ QueueEvents).
 *  - **shared**: general-purpose client for Queue producer + OAuth state store.
 *
 * Every client gets an `error` listener at construction so transient network
 * hiccups don't crash the process.
 */
export class RedisConnectionFactory {
  private readonly url: string;
  private readonly logger: Logger;
  private readonly clientFactory: (url: string, options: RedisOptions) => Redis;
  private readonly clients: Array<{ purpose: RedisPurpose; client: Redis }> = [];

  constructor(options: RedisConnectionFactoryOptions) {
    this.url = options.url;
    this.logger = options.logger;
    this.clientFactory =
      options.clientFactory ?? ((u, o) => new Redis(u, o));
  }

  create(purpose: RedisPurpose): Redis {
    const options = this.optionsFor(purpose);
    const client = this.clientFactory(this.url, options);

    client.on('error', (err: Error) => {
      this.logger.error('ioredis error event.', {
        purpose,
        error: err.message,
      });
    });

    this.clients.push({ purpose, client });
    return client;
  }

  /**
   * Quits all tracked clients. Safe to call multiple times; the second call
   * sees an empty list.
   */
  async closeAll(): Promise<void> {
    const toClose = this.clients.splice(0);
    await Promise.all(
      toClose.map(async ({ purpose, client }) => {
        try {
          await client.quit();
        } catch (err) {
          this.logger.warn('ioredis quit() failed.', {
            purpose,
            error: err instanceof Error ? err.message : String(err),
          });
          // Force-disconnect on quit failure so shutdown doesn't hang.
          client.disconnect();
        }
      })
    );
  }

  /** Exposed for tests. */
  optionsFor(purpose: RedisPurpose): RedisOptions {
    const base: RedisOptions = {
      retryStrategy: (times: number) => Math.min(30_000, 500 * 2 ** Math.min(times, 6)),
      reconnectOnError: () => true,
      lazyConnect: false,
    };

    switch (purpose) {
      case 'bclient':
      case 'subscriber':
        // BullMQ mandates these.
        return {
          ...base,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        };
      case 'redlock':
        return {
          ...base,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          commandTimeout: 2_000,
        };
      case 'shared':
      default:
        return {
          ...base,
          maxRetriesPerRequest: 3,
        };
    }
  }
}
