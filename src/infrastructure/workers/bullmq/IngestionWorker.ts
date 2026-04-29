import type { IngestionOrchestrator } from '@application/services';
import type { IngestionJobRequest } from '@domain/ports';

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
 */
export class IngestionWorker {
  constructor(
    private readonly orchestrator: IngestionOrchestrator,
    private readonly logger: IWorkerLogger
  ) {}

  async process(job: QueueJob<IngestionJobPayload>): Promise<void> {
    const { clientId, platformName } = job.data;

    const result = await this.orchestrator.run(clientId, platformName);

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
