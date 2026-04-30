import { MaintenanceWorker } from './MaintenanceWorker';
import { success, failure } from '@domain/shared';
import type { Job } from 'bullmq';
import type {
  NightlyIngestionDispatcher,
  TokenHealthMonitor,
} from '@application/services';

const silentLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

function makeDispatcher(shouldSucceed = true): jest.Mocked<NightlyIngestionDispatcher> {
  return {
    run: jest.fn().mockResolvedValue(
      shouldSucceed
        ? success({
            totalConnections: 10,
            enqueued: 10,
            duplicates: 0,
            failures: 0,
            failureDetails: [],
          })
        : failure({
            code: 'REPO_FAILURE',
            message: 'db down',
            retryable: true,
          })
    ),
  } as unknown as jest.Mocked<NightlyIngestionDispatcher>;
}

function makeHealthMonitor(shouldSucceed = true): jest.Mocked<TokenHealthMonitor> {
  return {
    run: jest.fn().mockResolvedValue(
      shouldSucceed
        ? success({
            totalExpiring: 5,
            notificationsSent: 5,
            notificationsSkipped: 0,
            statusUpdates: 1,
            failures: 0,
            bucketCounts: { bucket30: 2, bucket14: 1, bucket7: 1, bucket0: 1 },
          })
        : failure({
            code: 'REPO_FAILURE',
            message: 'db down',
            retryable: true,
          })
    ),
  } as unknown as jest.Mocked<TokenHealthMonitor>;
}

function makeJob(name: string, data: Record<string, unknown> = {}): Job {
  return {
    id: 'job-123',
    name,
    data,
    attemptsMade: 0,
  } as Job;
}

describe('MaintenanceWorker', () => {
  describe('job routing', () => {
    it('routes nightly-ingestion-fanout to NightlyIngestionDispatcher', async () => {
      const dispatcher = makeDispatcher();
      const worker = new MaintenanceWorker(
        dispatcher,
        makeHealthMonitor(),
        silentLogger()
      );

      const job = makeJob('nightly-ingestion-fanout');
      const result = await worker.process(job);

      expect(result.ok).toBe(true);
      expect(dispatcher.run).toHaveBeenCalledWith(undefined);
    });

    it('routes token-health-check to TokenHealthMonitor', async () => {
      const healthMonitor = makeHealthMonitor();
      const worker = new MaintenanceWorker(
        makeDispatcher(),
        healthMonitor,
        silentLogger()
      );

      const job = makeJob('token-health-check');
      const result = await worker.process(job);

      expect(result.ok).toBe(true);
      expect(healthMonitor.run).toHaveBeenCalled();
    });

    it('rejects unknown job names with non-retryable error', async () => {
      const worker = new MaintenanceWorker(
        makeDispatcher(),
        makeHealthMonitor(),
        silentLogger()
      );

      const job = makeJob('unknown-job-name');
      const result = await worker.process(job);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('UNKNOWN_JOB');
      expect(result.error.retryable).toBe(false);
    });
  });

  describe('nightly-ingestion-fanout', () => {
    it('passes clientIdFilter from job data to dispatcher', async () => {
      const dispatcher = makeDispatcher();
      const worker = new MaintenanceWorker(
        dispatcher,
        makeHealthMonitor(),
        silentLogger()
      );

      const job = makeJob('nightly-ingestion-fanout', { clientIdFilter: 'client-42' });
      await worker.process(job);

      expect(dispatcher.run).toHaveBeenCalledWith('client-42');
    });

    it('returns success when dispatcher succeeds', async () => {
      const dispatcher = makeDispatcher(true);
      const worker = new MaintenanceWorker(
        dispatcher,
        makeHealthMonitor(),
        silentLogger()
      );

      const job = makeJob('nightly-ingestion-fanout');
      const result = await worker.process(job);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveProperty('totalConnections', 10);
    });

    it('returns DISPATCHER_FAILED when dispatcher fails', async () => {
      const dispatcher = makeDispatcher(false);
      const worker = new MaintenanceWorker(
        dispatcher,
        makeHealthMonitor(),
        silentLogger()
      );

      const job = makeJob('nightly-ingestion-fanout');
      const result = await worker.process(job);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('DISPATCHER_FAILED');
      expect(result.error.retryable).toBe(true);
    });
  });

  describe('token-health-check', () => {
    it('returns success when health monitor succeeds', async () => {
      const healthMonitor = makeHealthMonitor(true);
      const worker = new MaintenanceWorker(
        makeDispatcher(),
        healthMonitor,
        silentLogger()
      );

      const job = makeJob('token-health-check');
      const result = await worker.process(job);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveProperty('totalExpiring', 5);
    });

    it('returns MONITOR_FAILED when health monitor fails', async () => {
      const healthMonitor = makeHealthMonitor(false);
      const worker = new MaintenanceWorker(
        makeDispatcher(),
        healthMonitor,
        silentLogger()
      );

      const job = makeJob('token-health-check');
      const result = await worker.process(job);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('MONITOR_FAILED');
      expect(result.error.retryable).toBe(true);
    });
  });

  describe('logging', () => {
    it('logs job start with metadata', async () => {
      const logger = silentLogger();
      const worker = new MaintenanceWorker(
        makeDispatcher(),
        makeHealthMonitor(),
        logger
      );

      const job = makeJob('nightly-ingestion-fanout');
      await worker.process(job);

      expect(logger.info).toHaveBeenCalledWith(
        'MaintenanceWorker: processing job.',
        expect.objectContaining({
          jobId: 'job-123',
          jobName: 'nightly-ingestion-fanout',
        })
      );
    });

    it('logs completion with report', async () => {
      const logger = silentLogger();
      const worker = new MaintenanceWorker(
        makeDispatcher(),
        makeHealthMonitor(),
        logger
      );

      const job = makeJob('nightly-ingestion-fanout');
      await worker.process(job);

      expect(logger.info).toHaveBeenCalledWith(
        'MaintenanceWorker: nightly ingestion fanout complete.',
        expect.objectContaining({
          jobId: 'job-123',
          report: expect.any(Object),
        })
      );
    });

    it('logs errors with context', async () => {
      const logger = silentLogger();
      const worker = new MaintenanceWorker(
        makeDispatcher(false),
        makeHealthMonitor(),
        logger
      );

      const job = makeJob('nightly-ingestion-fanout');
      await worker.process(job);

      expect(logger.error).toHaveBeenCalledWith(
        'MaintenanceWorker: nightly ingestion fanout failed.',
        expect.objectContaining({
          jobId: 'job-123',
          error: expect.any(Object),
        })
      );
    });
  });
});

