import type { Job } from 'bullmq';
import type { Result } from '@domain/shared';
import { failure, success } from '@domain/shared';
import type {
  NightlyIngestionDispatcher,
  TokenHealthMonitor,
} from '@application/services';

export interface MaintenanceWorkerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface MaintenanceJobPayload {
  readonly triggeredAt?: string;
  readonly clientIdFilter?: string;
}

export interface MaintenanceWorkerError {
  readonly code: 'UNKNOWN_JOB' | 'DISPATCHER_FAILED' | 'MONITOR_FAILED';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * BullMQ processor for the `maintenance` queue.
 *
 * Routes jobs by `job.name` to the appropriate application service:
 *  - `nightly-ingestion-fanout` → NightlyIngestionDispatcher
 *  - `token-health-check` → TokenHealthMonitor
 *
 * Unknown job names are rejected with a non-retryable error.
 */
export class MaintenanceWorker {
  constructor(
    private readonly dispatcher: NightlyIngestionDispatcher,
    private readonly healthMonitor: TokenHealthMonitor,
    private readonly logger: MaintenanceWorkerLogger
  ) {}

  async process(
    job: Job<MaintenanceJobPayload>
  ): Promise<Result<unknown, MaintenanceWorkerError>> {
    this.logger.info('MaintenanceWorker: processing job.', {
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
    });

    switch (job.name) {
      case 'nightly-ingestion-fanout':
        return this.handleNightlyIngestionFanout(job);

      case 'token-health-check':
        return this.handleTokenHealthCheck(job);

      default:
        this.logger.error('MaintenanceWorker: unknown job name.', {
          jobId: job.id,
          jobName: job.name,
        });
        return failure({
          code: 'UNKNOWN_JOB',
          message: `Unknown maintenance job: ${job.name}`,
          retryable: false,
        });
    }
  }

  private async handleNightlyIngestionFanout(
    job: Job<MaintenanceJobPayload>
  ): Promise<Result<unknown, MaintenanceWorkerError>> {
    const result = await this.dispatcher.run(job.data.clientIdFilter);

    if (!result.ok) {
      this.logger.error('MaintenanceWorker: nightly ingestion fanout failed.', {
        jobId: job.id,
        error: result.error,
      });
      return failure({
        code: 'DISPATCHER_FAILED',
        message: result.error.message,
        retryable: result.error.retryable,
      });
    }

    this.logger.info('MaintenanceWorker: nightly ingestion fanout complete.', {
      jobId: job.id,
      report: result.value,
    });

    return success(result.value);
  }

  private async handleTokenHealthCheck(
    job: Job<MaintenanceJobPayload>
  ): Promise<Result<unknown, MaintenanceWorkerError>> {
    const result = await this.healthMonitor.run();

    if (!result.ok) {
      this.logger.error('MaintenanceWorker: token health check failed.', {
        jobId: job.id,
        error: result.error,
      });
      return failure({
        code: 'MONITOR_FAILED',
        message: result.error.message,
        retryable: result.error.retryable,
      });
    }

    this.logger.info('MaintenanceWorker: token health check complete.', {
      jobId: job.id,
      report: result.value,
    });

    return success(result.value);
  }
}

