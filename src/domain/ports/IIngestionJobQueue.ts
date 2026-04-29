import type { PlatformName } from '../entities/ITransaction';
import type { Result } from '../shared/Result';

export interface IngestionJobRequest {
  readonly clientId: string;
  readonly platformName: PlatformName;
  readonly fromDate: string; // ISO 8601 date string (YYYY-MM-DD)
  readonly toDate: string;   // ISO 8601 date string (YYYY-MM-DD)
  readonly jobId?: string;   // Optional idempotency key for deduplication
}

export interface IngestionQueueError {
  readonly code: 'QUEUE_UNAVAILABLE' | 'QUEUE_REJECTED' | 'DUPLICATE_JOB' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

export interface IIngestionJobQueue {
  enqueue(job: IngestionJobRequest): Promise<Result<{ jobId: string }, IngestionQueueError>>;
}
