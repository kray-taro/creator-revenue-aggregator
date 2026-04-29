import type { 
  IIngestionJobQueue, 
  IngestionJobRequest, 
  IngestionQueueError 
} from '@domain/ports';
import { failure, success, type Result } from '@domain/shared';

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
      // Use jobId as BullMQ's jobId for idempotency
      // If a job with the same jobId already exists, BullMQ will reject it
      const options: Record<string, unknown> = {
        attempts: 4,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      };

      // Add jobId for idempotency if provided
      if (job.jobId) {
        options.jobId = job.jobId;
      }

      const queueJob = await this.queue.add('ingestion-job', job, options);

      return success({ jobId: queueJob.id ?? job.jobId ?? 'unknown-job-id' });
    } catch (error) {
      if (error instanceof Error) {
        // Check if error is due to duplicate job ID
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          return failure({
            code: 'DUPLICATE_JOB',
            message: `Job with ID ${job.jobId} already exists in queue`,
            retryable: false,
          });
        }

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
