import type Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { RedisConnectionFactory } from './RedisClient';
import { Logger } from '@composition/Logger';

class FakeRedis {
  handlers: Record<string, Array<(arg: unknown) => void>> = {};
  quitCalls = 0;
  disconnectCalls = 0;
  quitImpl: () => Promise<'OK'> = async () => 'OK';

  on(event: string, handler: (arg: unknown) => void): this {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }

  async quit(): Promise<'OK'> {
    this.quitCalls++;
    return this.quitImpl();
  }

  disconnect(): void {
    this.disconnectCalls++;
  }

  emit(event: string, arg: unknown): void {
    (this.handlers[event] ?? []).forEach((h) => h(arg));
  }
}

const silentLogger = () => new Logger({ level: 'error', sink: () => {} });

describe('RedisConnectionFactory', () => {
  const makeFactory = () => {
    const created: Array<{ url: string; options: RedisOptions; fake: FakeRedis }> = [];
    const factory = new RedisConnectionFactory({
      url: 'redis://localhost:6379',
      logger: silentLogger(),
      clientFactory: (url, options) => {
        const fake = new FakeRedis();
        created.push({ url, options, fake });
        return fake as unknown as Redis;
      },
    });
    return { factory, created };
  };

  describe('optionsFor', () => {
    const factory = new RedisConnectionFactory({
      url: 'redis://localhost:6379',
      logger: silentLogger(),
      clientFactory: () => new FakeRedis() as unknown as Redis,
    });

    it('applies BullMQ-mandated options to bclient', () => {
      const opts = factory.optionsFor('bclient');
      expect(opts.maxRetriesPerRequest).toBeNull();
      expect(opts.enableReadyCheck).toBe(false);
    });

    it('applies BullMQ-mandated options to subscriber', () => {
      const opts = factory.optionsFor('subscriber');
      expect(opts.maxRetriesPerRequest).toBeNull();
      expect(opts.enableReadyCheck).toBe(false);
    });

    it('fails fast for redlock purpose', () => {
      const opts = factory.optionsFor('redlock');
      expect(opts.enableOfflineQueue).toBe(false);
      expect(opts.maxRetriesPerRequest).toBe(1);
      expect(opts.commandTimeout).toBe(2000);
    });

    it('sets retries for shared purpose', () => {
      const opts = factory.optionsFor('shared');
      expect(opts.maxRetriesPerRequest).toBe(3);
    });

    it('includes a retry strategy with exponential backoff cap', () => {
      const opts = factory.optionsFor('shared');
      expect(typeof opts.retryStrategy).toBe('function');
      const rs = opts.retryStrategy as (n: number) => number;
      expect(rs(1)).toBeLessThanOrEqual(30_000);
      expect(rs(100)).toBe(30_000);
    });
  });

  describe('create', () => {
    it('registers an error listener on every client', () => {
      const { factory, created } = makeFactory();
      factory.create('shared');
      expect(created[0]!.fake.handlers.error).toBeDefined();
      expect(() => created[0]!.fake.emit('error', new Error('x'))).not.toThrow();
    });

    it('passes purpose-appropriate options to the ioredis constructor', () => {
      const { factory, created } = makeFactory();
      factory.create('bclient');
      expect(created[0]!.options.maxRetriesPerRequest).toBeNull();
      expect(created[0]!.options.enableReadyCheck).toBe(false);
    });
  });

  describe('closeAll', () => {
    it('quits every created client', async () => {
      const { factory, created } = makeFactory();
      factory.create('shared');
      factory.create('bclient');
      factory.create('redlock');

      await factory.closeAll();

      expect(created.map((c) => c.fake.quitCalls)).toEqual([1, 1, 1]);
    });

    it('force-disconnects if quit() throws', async () => {
      const { factory, created } = makeFactory();
      factory.create('shared');
      created[0]!.fake.quitImpl = async () => { throw new Error('quit failed'); };

      await factory.closeAll();

      expect(created[0]!.fake.disconnectCalls).toBe(1);
    });

    it('is a no-op on second call', async () => {
      const { factory, created } = makeFactory();
      factory.create('shared');
      await factory.closeAll();
      await factory.closeAll();
      expect(created[0]!.fake.quitCalls).toBe(1);
    });
  });
});
