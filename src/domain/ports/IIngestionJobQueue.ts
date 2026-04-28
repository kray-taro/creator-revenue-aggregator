import type { PlatformName } from '../entities/ITransaction';
import type { Result } from '../shared/Result';

export interface IngestionJobRequest {
  readonly clientId: string;
  readonly platformName: PlatformName;
}

export interface IngestionQueueError {
  readonly code: 'QUEUE_UNAVAILABLE' | 'QUEUE_REJECTED' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

export interface IIngestionJobQueue {
  enqueue(job: IngestionJobRequest): Promise<Result<{ jobId: string }, IngestionQueueError>>;
}
