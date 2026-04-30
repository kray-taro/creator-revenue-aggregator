import { Pool, type PoolConfig, type QueryResult as PgQueryResult } from 'pg';
import type { IPgClient } from './PgTransactionRepository';
import type { Logger } from '@composition/Logger';

export interface PgPoolOptions {
  readonly connectionString: string;
  readonly max: number;
  readonly idleTimeoutMillis: number;
  readonly ssl: boolean;
  readonly logger: Logger;
  /**
   * Optional pool factory override for tests. Defaults to `new Pool(cfg)`.
   */
  readonly poolFactory?: (cfg: PoolConfig) => Pool;
}

interface QueryResultRow {
  [key: string]: unknown;
}

interface QueryResult<T extends QueryResultRow> {
  readonly rows: T[];
  readonly rowCount?: number;
}

/**
 * Thin wrapper over `pg.Pool` that:
 *  - implements the existing `IPgClient` contract used by every Pg* repository,
 *  - registers an `error` handler at construction so idle-socket drops don't
 *    crash the Node process,
 *  - exposes `healthCheck()` for fail-fast boot probing,
 *  - closes idempotently via `close()`.
 */
export class PgPool implements IPgClient {
  private readonly pool: Pool;
  private readonly logger: Logger;
  private closePromise: Promise<void> | null = null;

  constructor(options: PgPoolOptions) {
    this.logger = options.logger;

    const cfg: PoolConfig = {
      connectionString: options.connectionString,
      max: options.max,
      idleTimeoutMillis: options.idleTimeoutMillis,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    };

    const factory = options.poolFactory ?? ((c) => new Pool(c));
    this.pool = factory(cfg);

    // Critical: without this, pg throws on idle-socket errors and crashes the
    // process with an unhandled exception.
    this.pool.on('error', (err: Error) => {
      this.logger.error('pg.Pool emitted error event.', {
        error: err.message,
      });
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<QueryResult<T>> {
    const result = (await this.pool.query(
      sql,
      params ? Array.from(params) : undefined
    )) as PgQueryResult<T>;
    return { rows: result.rows, rowCount: result.rowCount ?? undefined };
  }

  /**
   * Fail-fast health probe used at boot. Throws on error so `buildContainer`
   * aborts startup rather than silently running without a database.
   */
  async healthCheck(timeoutMs = 2_000): Promise<void> {
    await this.withTimeout(
      this.pool.query('SELECT 1'),
      timeoutMs,
      'pg.healthCheck'
    );
  }

  /**
   * Idempotent graceful close. Subsequent calls await the first one.
   */
  async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }
    this.closePromise = this.pool.end().catch((err: unknown) => {
      this.logger.error('pg.Pool.end() failed.', {
        error: err instanceof Error ? err.message : String(err),
      });
    }) as Promise<void>;
    return this.closePromise;
  }

  private async withTimeout<T>(p: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
