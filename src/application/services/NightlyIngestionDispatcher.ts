import { failure, success, type Result } from '@domain/shared';
import type {
  IAuditLogger,
  IDistributedLockService,
  IIngestionJobQueue,
  IPlatformConnectionRepository,
  IngestionJobRequest,
  PlatformConnection,
} from '@domain/ports';

export interface NightlyIngestionDispatcherLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface NightlyIngestionDispatchReport {
  readonly totalConnections: number;
  readonly enqueued: number;
  readonly duplicates: number;
  readonly failures: number;
  readonly failureDetails: ReadonlyArray<{
    readonly clientId: string;
    readonly platform: string;
    readonly code: string;
    readonly message: string;
  }>;
}

export interface NightlyIngestionDispatcherError {
  readonly code: 'LOCK_NOT_ACQUIRED' | 'REPO_FAILURE' | 'UNEXPECTED';
  readonly message: string;
  readonly retryable: boolean;
}

export interface NightlyIngestionDispatcherOptions {
  /**
   * How many days of history to pull on a nightly run. Phase-1 default
   * matches the incremental window expected by adapters.
   */
  readonly lookbackDays?: number;
  /**
   * TTL for the single-dispatcher distributed lock. Long enough to cover
   * fan-out to thousands of connections but well short of the next cron tick.
   */
  readonly lockTtlMs?: number;
  /**
   * Lock name (override for tests).
   */
  readonly lockName?: string;
  /**
   * Injected clock for deterministic `jobId` generation.
   */
  readonly clock?: () => Date;
}

const DEFAULT_LOOKBACK_DAYS = 3;
const DEFAULT_LOCK_TTL_MS = 5 * 60_000; // 5 minutes
const DEFAULT_LOCK_NAME = 'nightly-ingestion-fanout';

/**
 * Fans out the nightly ingestion jobs (US-102).
 *
 * - Wrapped in a distributed lock so multiple scheduler replicas don't
 *   double-dispatch the same schedule.
 * - Each job carries a deterministic `jobId` of the form
 *   `ingestion:{clientId}:{platform}:{YYYY-MM-DD}` (UTC). BullMQ rejects
 *   duplicate jobIds, so accidental double-fans are counted as
 *   `duplicates` rather than double-ingesting.
 * - Partial failure is tolerated: one connection's enqueue error doesn't
 *   abort the remaining fan-out.
 */
export class NightlyIngestionDispatcher {
  private readonly lookbackDays: number;
  private readonly lockTtlMs: number;
  private readonly lockName: string;
  private readonly clock: () => Date;

  constructor(
    private readonly connectionRepo: IPlatformConnectionRepository,
    private readonly queue: IIngestionJobQueue,
    private readonly lockService: IDistributedLockService,
    private readonly auditLogger: IAuditLogger,
    private readonly logger: NightlyIngestionDispatcherLogger,
    options: NightlyIngestionDispatcherOptions = {}
  ) {
    this.lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    this.lockTtlMs = options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
    this.lockName = options.lockName ?? DEFAULT_LOCK_NAME;
    this.clock = options.clock ?? (() => new Date());
  }

  async run(
    clientIdFilter?: string
  ): Promise<Result<NightlyIngestionDispatchReport, NightlyIngestionDispatcherError>> {
    const lockResult = await this.lockService.withLock(
      this.lockName,
      this.lockTtlMs,
      () => this.executeFanOut(clientIdFilter)
    );

    if (!lockResult.ok) {
      if (lockResult.error.code === 'LOCK_NOT_ACQUIRED') {
        this.logger.warn('Nightly dispatch skipped; another replica holds the lock.', {
          lockName: this.lockName,
        });
        return failure({
          code: 'LOCK_NOT_ACQUIRED',
          message: 'Another dispatcher is running.',
          retryable: false,
        });
      }
      return failure({
        code: 'UNEXPECTED',
        message: lockResult.error.message,
        retryable: lockResult.error.retryable,
      });
    }

    return lockResult.value;
  }

  private async executeFanOut(
    clientIdFilter?: string
  ): Promise<Result<NightlyIngestionDispatchReport, NightlyIngestionDispatcherError>> {
    const connectionsResult = await this.connectionRepo.findAllActive(clientIdFilter);
    if (!connectionsResult.ok) {
      this.logger.error('Nightly dispatch: findAllActive failed.', {
        error: connectionsResult.error,
      });
      return failure({
        code: 'REPO_FAILURE',
        message: connectionsResult.error.message,
        retryable: connectionsResult.error.retryable,
      });
    }

    const connections = connectionsResult.value;
    const { fromDate, toDate, dateKey } = this.computeWindow();

    let enqueued = 0;
    let duplicates = 0;
    const failures: Array<{ clientId: string; platform: string; code: string; message: string }> = [];

    const BATCH_SIZE = 50;
    for (let i = 0; i < connections.length; i += BATCH_SIZE) {
      const batch = connections.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (conn) => {
          const job = this.buildJob(conn, dateKey, fromDate, toDate);
          const result = await this.queue.enqueue(job);

          if (result.ok) {
            enqueued += 1;
            return;
          }

          if (result.error.code === 'DUPLICATE_JOB') {
            duplicates += 1;
            return;
          }

          failures.push({
            clientId: conn.clientId,
            platform: conn.platform,
            code: result.error.code,
            message: result.error.message,
          });
          this.logger.warn('Nightly dispatch: enqueue failed for connection.', {
            clientId: conn.clientId,
            platform: conn.platform,
            error: result.error,
          });
        })
      );
    }

    const report: NightlyIngestionDispatchReport = {
      totalConnections: connections.length,
      enqueued,
      duplicates,
      failures: failures.length,
      failureDetails: failures,
    };

    // Audit once per run with aggregate counters. The clientId field in the
    // audit log is intentionally a synthetic "__system__" to signal a
    // cross-tenant maintenance action.
    await this.auditLogger.log(
      '__system__',
      'nightly_ingestion_fanout',
      report.failures === 0 ? 'success' : 'failure',
      { ...report, dateKey, clientIdFilter: clientIdFilter ?? null }
    );

    this.logger.info('Nightly dispatch complete.', report as unknown as Record<string, unknown>);
    return success(report);
  }

  private buildJob(
    conn: PlatformConnection,
    dateKey: string,
    fromDate: string,
    toDate: string
  ): IngestionJobRequest {
    return {
      clientId: conn.clientId,
      platformName: conn.platform,
      fromDate,
      toDate,
      jobId: `ingestion:${conn.clientId}:${conn.platform}:${dateKey}`,
    };
  }

  private computeWindow(): { fromDate: string; toDate: string; dateKey: string } {
    const now = this.clock();
    const toDate = this.isoDate(now);
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - this.lookbackDays);
    const fromDate = this.isoDate(from);
    return { fromDate, toDate, dateKey: toDate };
  }

  private isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
