import type { Result } from '@domain/shared';

export interface RepeatableJobConfig {
  /**
   * Unique job name (e.g., 'nightly-ingestion-fanout').
   */
  readonly name: string;
  /**
   * Cron expression (e.g., '0 2 * * *' for 2 AM daily).
   */
  readonly cron: string;
  /**
   * Timezone for cron evaluation (default: 'UTC').
   */
  readonly tz?: string;
  /**
   * Job payload.
   */
  readonly payload: Record<string, unknown>;
  /**
   * Target queue name.
   */
  readonly queueName: string;
}

export interface SchedulerError {
  readonly code: 'REGISTRATION_FAILED' | 'REMOVAL_FAILED' | 'QUEUE_UNAVAILABLE';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Port for registering and managing repeatable (scheduled) jobs.
 *
 * Implementations must ensure idempotency: re-registering the same job
 * (by name) should update the schedule, not create duplicates.
 */
export interface ISchedulerPort {
  /**
   * Registers a repeatable job. If a job with the same name already exists,
   * it is updated with the new schedule and payload.
   */
  registerRepeatable(
    config: RepeatableJobConfig
  ): Promise<Result<boolean, SchedulerError>>;

  /**
   * Removes all registered repeatable jobs. Idempotent.
   */
  removeAll(): Promise<Result<boolean, SchedulerError>>;
}

