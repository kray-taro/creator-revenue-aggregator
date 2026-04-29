import type { IngestionOrchestrator } from '@application/services';
import type { IngestionJobRequest, IDistributedLockService } from '@domain/ports';

export type IngestionJobPayload = IngestionJobRequest;

/**
 * Minimal job shape compatible with BullMQ worker processor signature.
 */
export interface QueueJob<TPayload> {
  readonly id?: string;
  readonly data: TPayload;
}

export interface IWorkerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Thin wrapper/controller for ingestion queue processing.
 * Business decisions (terminal vs retry) are delegated to the orchestrator.
 *
 * Implements per-client-platform lock granularity to prevent concurrent
 * processing of the same client-platform combination, which could cause:
 * - Database deadlocks from concurrent writes
 * - Duplicate transaction detection race conditions
 * - Audit log corruption from overlapping entries
 */
export class IngestionWorker {
  constructor(
    private readonly orchestrator: IngestionOrchestrator,
    private readonly lockService: IDistributedLockService,
    private readonly logger: IWorkerLogger,
    private readonly config: { workerLockTtlMs: number }
  ) {}

  async process(job: QueueJob<IngestionJobPayload>): Promise<void> {
    const { clientId, platformName } = job.data;

    /**
     * Per-client-platform lock strategy:
     * - Lock name: `ingestion-lock:${clientId}:${platformName}`
     * - Prevents concurrent ingestion for same client-platform pair
     * - Allows parallel processing of different platforms for same client
     * - Allows parallel processing of same platform for different clients
     *
     * TTL: Configured via workerLockTtlMs (default: 300000ms = 5 minutes)
     * - Sufficient for typical ingestion operations (fetch + validate + persist)
     * - Lock auto-extends every 1/3 of TTL to prevent expiry during long operations
     * - If lock cannot be acquired, job will be retried by BullMQ
     */
    const lockName = `ingestion-lock:${clientId}:${platformName}`;
    const lockResult = await this.lockService.withLock(
      lockName,
      this.config.workerLockTtlMs,
      async () => {
        return await this.orchestrator.run(clientId, platformName);
      }
    );

    // Handle lock acquisition failure
    if (!lockResult.ok) {
      if (lockResult.error.code === 'LOCK_NOT_ACQUIRED') {
        this.logger.warn('Failed to acquire ingestion lock; job will be retried.', {
          jobId: job.id,
          clientId,
          platformName,
          lockName,
        });
        throw new Error(`Lock not acquired for ${lockName}`);
      }

      if (lockResult.error.code === 'LOCK_EXTENSION_FAILED') {
        this.logger.warn('Lock extension failed but operation completed.', {
          jobId: job.id,
          clientId,
          platformName,
          lockName,
          warning: 'Exclusivity may have been lost during operation',
        });
        // Continue processing - operation completed despite extension failure
      } else {
        this.logger.error('Lock execution failed.', {
          jobId: job.id,
          clientId,
          platformName,
          error: lockResult.error,
        });
        throw new Error(lockResult.error.message);
      }
    }

    const result = lockResult.value;

    if (result.ok) {
      this.logger.info('Ingestion job completed.', {
        jobId: job.id,
        clientId,
        platformName,
        report: result.value,
      });
      return;
    }

    if (!result.error.shouldRetry) {
      this.logger.warn('Ingestion job finished without retry (orchestrator-marked terminal).', {
        jobId: job.id,
        clientId,
        platformName,
        error: result.error,
        platformState: result.error.redTabSuggested ? 'RED' : 'UNKNOWN',
      });
      return;
    }

    this.logger.error('Ingestion job failed; throwing for BullMQ retry/backoff.', {
      jobId: job.id,
      clientId,
      platformName,
      error: result.error,
    });

    throw new Error(result.error.message);
  }
}
