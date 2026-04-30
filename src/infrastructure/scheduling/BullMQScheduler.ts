import type { Queue } from 'bullmq';
import { success, failure, type Result } from '@domain/shared';
import type {
  ISchedulerPort,
  RepeatableJobConfig,
  SchedulerError,
} from './ISchedulerPort';

export interface BullMQSchedulerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * BullMQ-backed scheduler using repeatable jobs.
 *
 * Each repeatable job is registered with a deterministic `jobId` derived from
 * its name, ensuring idempotent re-registration (BullMQ updates the schedule
 * if the jobId already exists).
 */
export class BullMQScheduler implements ISchedulerPort {
  private readonly queues: Map<string, Queue> = new Map();

  constructor(
    private readonly queueFactory: (queueName: string) => Queue,
    private readonly logger: BullMQSchedulerLogger
  ) {}

  async registerRepeatable(
    config: RepeatableJobConfig
  ): Promise<Result<boolean, SchedulerError>> {
    try {
      const queue = this.getOrCreateQueue(config.queueName);
      const jobId = this.buildJobId(config.name);

      await queue.add(config.name, config.payload, {
        repeat: {
          pattern: config.cron,
          tz: config.tz ?? 'UTC',
        },
        jobId,
      });

      this.logger.info('Repeatable job registered.', {
        jobName: config.name,
        queueName: config.queueName,
        cron: config.cron,
        tz: config.tz ?? 'UTC',
        jobId,
      });

      return success(true);
    } catch (err) {
      this.logger.error('Failed to register repeatable job.', {
        jobName: config.name,
        queueName: config.queueName,
        error: err instanceof Error ? err.message : String(err),
      });
      return failure({
        code: 'REGISTRATION_FAILED',
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      });
    }
  }

  async removeAll(): Promise<Result<boolean, SchedulerError>> {
    try {
      for (const [queueName, queue] of this.queues.entries()) {
        const repeatableJobs = await queue.getRepeatableJobs();
        for (const job of repeatableJobs) {
          await queue.removeRepeatableByKey(job.key);
          this.logger.info('Repeatable job removed.', {
            queueName,
            jobName: job.name,
            key: job.key,
          });
        }
      }
      return success(true);
    } catch (err) {
      this.logger.error('Failed to remove repeatable jobs.', {
        error: err instanceof Error ? err.message : String(err),
      });
      return failure({
        code: 'REMOVAL_FAILED',
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      });
    }
  }

  private getOrCreateQueue(queueName: string): Queue {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = this.queueFactory(queueName);
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  /**
   * Builds a deterministic jobId from the job name. This ensures that
   * re-registering the same job updates the schedule rather than creating
   * a duplicate.
   */
  private buildJobId(jobName: string): string {
    return `repeatable:${jobName}`;
  }
}

