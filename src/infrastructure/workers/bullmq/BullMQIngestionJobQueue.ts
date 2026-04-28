import type { IIngestionJobQueue, IngestionJobRequest, IngestionQueueError } from '../../../domain/ports/IIngestionJobQueue';
import { failure, success, type Result } from '../../../domain/shared/Result';

interface QueueAddResult {
  id?: string;
}

export interface IBullQueueClient {
  add(name: string, data: IngestionJobRequest, options?: Record<string, unknown>): Promise<QueueAddResult>;
}

export class BullMQIngestionJobQueue implements IIngestionJobQueue {
  constructor(private readonly queue: IBullQueueClient) {}

  async enqueue(job: IngestionJobRequest): Promise<Result<{ jobId: string }, IngestionQueueError>> {
    try {
      const queueJob = await this.queue.add('ingestion-job', job, {
        attempts: 4,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      });

      return success({ jobId: queueJob.id ?? 'unknown-job-id' });
    } catch (error) {
      if (error instanceof Error) {
        return failure({
          code: 'QUEUE_UNAVAILABLE',
          message: error.message,
          retryable: true,
        });
      }

      return failure({
        code: 'UNKNOWN',
        message: 'Unknown queue dispatch error.',
        retryable: true,
      });
    }
  }
}
