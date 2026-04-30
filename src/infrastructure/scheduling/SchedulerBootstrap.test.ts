import { SchedulerBootstrap } from './SchedulerBootstrap';
import { success, failure } from '@domain/shared';
import type { IConfig } from '@domain/ports';
import type { ISchedulerPort, RepeatableJobConfig, SchedulerError } from './ISchedulerPort';

const silentLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

function makeConfig(overrides: Partial<IConfig> = {}): IConfig {
  return {
    nodeEnv: 'test',
    port: 3000,
    databaseUrl: 'postgresql://test',
    redisUrl: 'redis://test',
    jwtSecret: 'test-secret',
    jwtExpiresIn: '1h',
    encryptionKey: 'test-key-32-bytes-long-exactly',
    awsRegion: 'us-east-1',
    s3BucketName: 'test-bucket',
    processRole: 'all',
    dbPoolMax: 10,
    dbPoolIdleTimeoutMs: 30000,
    dbSsl: false,
    workerConcurrency: 4,
    schedulerEnabled: true,
    ingestionQueueName: 'ingestion',
    maintenanceQueueName: 'maintenance',
    nightlyIngestionCron: '0 2 * * *',
    tokenHealthCron: '0 6 * * *',
    shutdownTimeoutMs: 15000,
    ...overrides,
  } as IConfig;
}

function makeScheduler(shouldSucceed = true): jest.Mocked<ISchedulerPort> {
  return {
    registerRepeatable: jest.fn().mockResolvedValue(
      shouldSucceed
        ? success(true)
        : failure({
            code: 'REGISTRATION_FAILED',
            message: 'redis down',
            retryable: true,
          } as SchedulerError)
    ),
    removeAll: jest.fn().mockResolvedValue(success(true)),
  };
}

describe('SchedulerBootstrap', () => {
  describe('register', () => {
    it('registers nightly-ingestion-fanout with correct cron and queue', async () => {
      const scheduler = makeScheduler();
      const config = makeConfig({
        nightlyIngestionCron: '0 2 * * *',
        maintenanceQueueName: 'maintenance',
      });
      const bootstrap = new SchedulerBootstrap(scheduler, config, silentLogger());

      await bootstrap.register();

      expect(scheduler.registerRepeatable).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'nightly-ingestion-fanout',
          cron: '0 2 * * *',
          tz: 'UTC',
          queueName: 'maintenance',
        })
      );
    });

    it('registers token-health-check with correct cron and queue', async () => {
      const scheduler = makeScheduler();
      const config = makeConfig({
        tokenHealthCron: '0 6 * * *',
        maintenanceQueueName: 'maintenance',
      });
      const bootstrap = new SchedulerBootstrap(scheduler, config, silentLogger());

      await bootstrap.register();

      expect(scheduler.registerRepeatable).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'token-health-check',
          cron: '0 6 * * *',
          tz: 'UTC',
          queueName: 'maintenance',
        })
      );
    });

    it('includes triggeredAt timestamp in payload', async () => {
      const scheduler = makeScheduler();
      const config = makeConfig();
      const bootstrap = new SchedulerBootstrap(scheduler, config, silentLogger());

      await bootstrap.register();

      const calls = (scheduler.registerRepeatable as jest.Mock).mock.calls;
      for (const call of calls) {
        const jobConfig = call[0] as RepeatableJobConfig;
        expect(jobConfig.payload).toHaveProperty('triggeredAt');
        expect(typeof jobConfig.payload.triggeredAt).toBe('string');
      }
    });

    it('returns success when both jobs register successfully', async () => {
      const scheduler = makeScheduler(true);
      const config = makeConfig();
      const bootstrap = new SchedulerBootstrap(scheduler, config, silentLogger());

      const result = await bootstrap.register();

      expect(result.ok).toBe(true);
      expect(scheduler.registerRepeatable).toHaveBeenCalledTimes(2);
    });

    it('returns REGISTRATION_FAILED when nightly ingestion registration fails', async () => {
      const scheduler = makeScheduler(false);
      const config = makeConfig();
      const bootstrap = new SchedulerBootstrap(scheduler, config, silentLogger());

      const result = await bootstrap.register();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('REGISTRATION_FAILED');
      expect(result.error.retryable).toBe(true);
    });

    it('skips registration when schedulerEnabled is false', async () => {
      const scheduler = makeScheduler();
      const config = makeConfig({ schedulerEnabled: false });
      const bootstrap = new SchedulerBootstrap(scheduler, config, silentLogger());

      const result = await bootstrap.register();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('SCHEDULER_DISABLED');
      expect(scheduler.registerRepeatable).not.toHaveBeenCalled();
    });

    it('is idempotent (re-registration updates schedule)', async () => {
      const scheduler = makeScheduler();
      const config = makeConfig();
      const bootstrap = new SchedulerBootstrap(scheduler, config, silentLogger());

      await bootstrap.register();
      await bootstrap.register();

      // Should be called 4 times total (2 jobs × 2 calls).
      expect(scheduler.registerRepeatable).toHaveBeenCalledTimes(4);
    });
  });

  describe('unregister', () => {
    it('removes all repeatable jobs', async () => {
      const scheduler = makeScheduler();
      const config = makeConfig();
      const bootstrap = new SchedulerBootstrap(scheduler, config, silentLogger());

      const result = await bootstrap.unregister();

      expect(result.ok).toBe(true);
      expect(scheduler.removeAll).toHaveBeenCalled();
    });

    it('skips unregistration when schedulerEnabled is false', async () => {
      const scheduler = makeScheduler();
      const config = makeConfig({ schedulerEnabled: false });
      const bootstrap = new SchedulerBootstrap(scheduler, config, silentLogger());

      const result = await bootstrap.unregister();

      expect(result.ok).toBe(true);
      expect(scheduler.removeAll).not.toHaveBeenCalled();
    });

    it('returns REGISTRATION_FAILED when removal fails', async () => {
      const scheduler = makeScheduler();
      (scheduler.removeAll as jest.Mock).mockResolvedValue(
        failure({
          code: 'REMOVAL_FAILED',
          message: 'redis down',
          retryable: true,
        } as SchedulerError)
      );
      const config = makeConfig();
      const bootstrap = new SchedulerBootstrap(scheduler, config, silentLogger());

      const result = await bootstrap.unregister();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('REGISTRATION_FAILED');
    });
  });

  describe('logging', () => {
    it('logs successful registration with cron details', async () => {
      const logger = silentLogger();
      const scheduler = makeScheduler();
      const config = makeConfig({
        nightlyIngestionCron: '0 2 * * *',
        tokenHealthCron: '0 6 * * *',
      });
      const bootstrap = new SchedulerBootstrap(scheduler, config, logger);

      await bootstrap.register();

      expect(logger.info).toHaveBeenCalledWith(
        'Repeatable jobs registered successfully.',
        expect.objectContaining({
          nightlyIngestionCron: '0 2 * * *',
          tokenHealthCron: '0 6 * * *',
        })
      );
    });

    it('logs when scheduler is disabled', async () => {
      const logger = silentLogger();
      const scheduler = makeScheduler();
      const config = makeConfig({ schedulerEnabled: false });
      const bootstrap = new SchedulerBootstrap(scheduler, config, logger);

      await bootstrap.register();

      expect(logger.info).toHaveBeenCalledWith(
        'Scheduler disabled by config; skipping registration.'
      );
    });

    it('logs registration failures', async () => {
      const logger = silentLogger();
      const scheduler = makeScheduler(false);
      const config = makeConfig();
      const bootstrap = new SchedulerBootstrap(scheduler, config, logger);

      await bootstrap.register();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to register nightly ingestion fanout.',
        expect.any(Object)
      );
    });
  });
});

