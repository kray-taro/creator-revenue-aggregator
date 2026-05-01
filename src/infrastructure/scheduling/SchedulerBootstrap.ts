import type { IConfig } from '@domain/ports';
import type { ISchedulerPort } from './ISchedulerPort';
import { success, failure, type Result } from '@domain/shared';

export interface SchedulerBootstrapLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface SchedulerBootstrapError {
  readonly code: 'SCHEDULER_DISABLED' | 'REGISTRATION_FAILED';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Registers the Phase-1 repeatable jobs:
 *  1. Nightly ingestion fan-out (US-102)
 *  2. Daily token health check (US-901 plumbing)
 *
 * Respects `SCHEDULER_ENABLED` config flag so local dev / test runs can
 * disable without code change.
 */
export class SchedulerBootstrap {
  constructor(
    private readonly scheduler: ISchedulerPort,
    private readonly config: IConfig,
    private readonly logger: SchedulerBootstrapLogger
  ) {}

  async register(): Promise<Result<boolean, SchedulerBootstrapError>> {
    if (!this.config.schedulerEnabled) {
      this.logger.info('Scheduler disabled by config; skipping registration.');
      return failure({
        code: 'SCHEDULER_DISABLED',
        message: 'Scheduler is disabled.',
        retryable: false,
      });
    }

    this.logger.info('Registering repeatable jobs...');

    // 1. Nightly ingestion fan-out
    const nightlyResult = await this.scheduler.registerRepeatable({
      name: 'nightly-ingestion-fanout',
      cron: this.config.nightlyIngestionCron,
      tz: 'UTC',
      payload: { triggeredAt: new Date().toISOString() },
      queueName: this.config.maintenanceQueueName,
    });

    if (!nightlyResult.ok) {
      this.logger.error('Failed to register nightly ingestion fanout.', {
        error: nightlyResult.error,
      });
      return failure({
        code: 'REGISTRATION_FAILED',
        message: nightlyResult.error.message,
        retryable: nightlyResult.error.retryable,
      });
    }

    // 2. Daily token health check
    const healthResult = await this.scheduler.registerRepeatable({
      name: 'token-health-check',
      cron: this.config.tokenHealthCron,
      tz: 'UTC',
      payload: { triggeredAt: new Date().toISOString() },
      queueName: this.config.maintenanceQueueName,
    });

    if (!healthResult.ok) {
      this.logger.error('Failed to register token health check.', {
        error: healthResult.error,
      });
      return failure({
        code: 'REGISTRATION_FAILED',
        message: healthResult.error.message,
        retryable: healthResult.error.retryable,
      });
    }

    this.logger.info('Repeatable jobs registered successfully.', {
      nightlyIngestionCron: this.config.nightlyIngestionCron,
      tokenHealthCron: this.config.tokenHealthCron,
      maintenanceQueue: this.config.maintenanceQueueName,
    });

    return success(true);
  }

  async unregister(): Promise<Result<boolean, SchedulerBootstrapError>> {
    if (!this.config.schedulerEnabled) {
      this.logger.info('Scheduler disabled; skipping unregistration.');
      return success(true);
    }

    this.logger.info('Unregistering repeatable jobs...');

    const result = await this.scheduler.removeAll();
    if (!result.ok) {
      this.logger.error('Failed to unregister repeatable jobs.', {
        error: result.error,
      });
      return failure({
        code: 'REGISTRATION_FAILED',
        message: result.error.message,
        retryable: result.error.retryable,
      });
    }

    this.logger.info('Repeatable jobs unregistered successfully.');
    return success(true);
  }
}

