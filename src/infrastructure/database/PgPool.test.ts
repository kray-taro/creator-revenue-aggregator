import { PgPool } from './PgPool';
import { Logger } from '@composition/Logger';

/**
 * Lightweight `pg.Pool` stub compatible with the subset of the API PgPool uses.
 */
class FakePool {
  handlers: Record<string, Array<(arg: unknown) => void>> = {};
  queries: Array<{ sql: string; params: unknown[] | undefined }> = [];
  endCalls = 0;
  queryImpl: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> =
    async () => ({ rows: [{ '?column?': 1 }], rowCount: 1 });

  on(event: string, handler: (arg: unknown) => void): this {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }

  async query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
    this.queries.push({ sql, params });
    return this.queryImpl(sql, params);
  }

  async end(): Promise<void> {
    this.endCalls++;
  }

  emit(event: string, arg: unknown): void {
    (this.handlers[event] ?? []).forEach((h) => h(arg));
  }
}

const silentLogger = () => new Logger({ level: 'error', sink: () => {} });

describe('PgPool', () => {
  const makePool = (fake: FakePool) =>
    new PgPool({
      connectionString: 'postgresql://u:p@localhost:5432/db',
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: false,
      logger: silentLogger(),
      poolFactory: () => fake as unknown as never,
    });

  it('registers an error handler on the underlying pool at construction', () => {
    const fake = new FakePool();
    makePool(fake);
    expect(fake.handlers.error).toBeDefined();
    expect(fake.handlers.error!.length).toBeGreaterThanOrEqual(1);
    // Does not throw when the pool emits an error.
    expect(() => fake.emit('error', new Error('socket drop'))).not.toThrow();
  });

  it('delegates query() to pg.Pool and normalizes rowCount', async () => {
    const fake = new FakePool();
    fake.queryImpl = async () => ({ rows: [{ id: 'abc' }], rowCount: 1 });
    const pool = makePool(fake);

    const result = await pool.query<{ id: string }>('SELECT 1 WHERE id = $1', ['abc']);

    expect(result.rows).toEqual([{ id: 'abc' }]);
    expect(result.rowCount).toBe(1);
    expect(fake.queries).toEqual([{ sql: 'SELECT 1 WHERE id = $1', params: ['abc'] }]);
  });

  it('healthCheck() rejects on timeout', async () => {
    const fake = new FakePool();
    fake.queryImpl = () => new Promise(() => { /* never resolves */ });
    const pool = makePool(fake);

    await expect(pool.healthCheck(50)).rejects.toThrow(/timed out/);
  });

  it('healthCheck() resolves on a responsive pool', async () => {
    const fake = new FakePool();
    const pool = makePool(fake);
    await expect(pool.healthCheck(500)).resolves.toBeUndefined();
  });

  it('close() is idempotent', async () => {
    const fake = new FakePool();
    const pool = makePool(fake);

    await Promise.all([pool.close(), pool.close(), pool.close()]);

    expect(fake.endCalls).toBe(1);
  });

  it('close() swallows pool.end() errors and still resolves', async () => {
    const fake = new FakePool();
    fake.end = async () => { throw new Error('end failed'); };
    const pool = makePool(fake);

    await expect(pool.close()).resolves.toBeUndefined();
  });
});
