import { NightlyIngestionDispatcher } from './NightlyIngestionDispatcher';
import { success, failure, type Result } from '@domain/shared';
import type {
  IAuditLogger,
  IDistributedLockService,
  IIngestionJobQueue,
  IPlatformConnectionRepository,
  IngestionJobRequest,
  PlatformConnection,
  IngestionQueueError,
  DistributedLockError,
} from '@domain/ports';

type QueueMock = jest.Mocked<IIngestionJobQueue>;

const silentLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

function makeLockService(passThrough = true): jest.Mocked<IDistributedLockService> {
  return {
    withLock: jest.fn(async (_name, _ttl, op) => {
      if (!passThrough) {
        return failure({
          code: 'LOCK_NOT_ACQUIRED',
          message: 'busy',
          retryable: true,
        } as DistributedLockError);
      }
      const value = await op();
      return success(value) as Result<unknown, DistributedLockError>;
    }) as jest.Mocked<IDistributedLockService>['withLock'],
  };
}

function makeAudit(): jest.Mocked<IAuditLogger> {
  return {
    log: jest.fn().mockResolvedValue(success(true)),
    sanitize: jest.fn((x) => x),
  };
}

function makeQueue(): QueueMock {
  return { enqueue: jest.fn() } as unknown as QueueMock;
}

function makeConnRepo(
  connections: PlatformConnection[]
): jest.Mocked<IPlatformConnectionRepository> {
  return {
    findById: jest.fn(),
    findActiveByClientId: jest.fn(),
    saveTokens: jest.fn(),
    getTokens: jest.fn(),
    createConnection: jest.fn(),
    updateStatus: jest.fn(),
    findByClientAndPlatform: jest.fn(),
    findExpiringConnections: jest.fn(),
    findAllActive: jest.fn().mockResolvedValue(success(connections)),
  } as unknown as jest.Mocked<IPlatformConnectionRepository>;
}

const conn = (id: string, clientId: string, platform: PlatformConnection['platform']): PlatformConnection => ({
  id,
  clientId,
  platform,
  status: 'active',
});

const FIXED_NOW = new Date('2026-05-15T02:30:00Z');

describe('NightlyIngestionDispatcher', () => {
  it('fans out one job per active connection with a deterministic jobId', async () => {
    const connections = [
      conn('c1', 'client-1', 'youtube'),
      conn('c2', 'client-1', 'stripe'),
      conn('c3', 'client-2', 'gumroad'),
    ];
    const queue = makeQueue();
    (queue.enqueue as jest.Mock).mockImplementation(async (job: IngestionJobRequest) =>
      success({ jobId: job.jobId ?? 'x' })
    );
    const repo = makeConnRepo(connections);
    const dispatcher = new NightlyIngestionDispatcher(
      repo,
      queue,
      makeLockService(),
      makeAudit(),
      silentLogger(),
      { clock: () => FIXED_NOW }
    );

    const result = await dispatcher.run();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.enqueued).toBe(3);
    expect(result.value.duplicates).toBe(0);
    expect(result.value.failures).toBe(0);

    const jobIds = (queue.enqueue as jest.Mock).mock.calls.map((c) => (c[0] as IngestionJobRequest).jobId);
    expect(jobIds).toEqual([
      'ingestion:client-1:youtube:2026-05-15',
      'ingestion:client-1:stripe:2026-05-15',
      'ingestion:client-2:gumroad:2026-05-15',
    ]);
  });

  it('counts DUPLICATE_JOB errors separately from failures', async () => {
    const connections = [conn('c1', 'cl', 'youtube'), conn('c2', 'cl', 'stripe')];
    const queue = makeQueue();
    (queue.enqueue as jest.Mock)
      .mockResolvedValueOnce(success({ jobId: '1' }))
      .mockResolvedValueOnce(failure({
        code: 'DUPLICATE_JOB',
        message: 'dup',
        retryable: false,
      } as IngestionQueueError));

    const dispatcher = new NightlyIngestionDispatcher(
      makeConnRepo(connections),
      queue,
      makeLockService(),
      makeAudit(),
      silentLogger(),
      { clock: () => FIXED_NOW }
    );

    const result = await dispatcher.run();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.enqueued).toBe(1);
    expect(result.value.duplicates).toBe(1);
    expect(result.value.failures).toBe(0);
  });

  it('continues fan-out despite partial enqueue failures', async () => {
    const connections = [
      conn('c1', 'cl', 'youtube'),
      conn('c2', 'cl', 'stripe'),
      conn('c3', 'cl', 'gumroad'),
    ];
    const queue = makeQueue();
    (queue.enqueue as jest.Mock)
      .mockResolvedValueOnce(success({ jobId: '1' }))
      .mockResolvedValueOnce(failure({
        code: 'QUEUE_UNAVAILABLE',
        message: 'redis down',
        retryable: true,
      } as IngestionQueueError))
      .mockResolvedValueOnce(success({ jobId: '3' }));

    const audit = makeAudit();
    const dispatcher = new NightlyIngestionDispatcher(
      makeConnRepo(connections),
      queue,
      makeLockService(),
      audit,
      silentLogger(),
      { clock: () => FIXED_NOW }
    );

    const result = await dispatcher.run();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.enqueued).toBe(2);
    expect(result.value.failures).toBe(1);
    expect(result.value.failureDetails[0]!.code).toBe('QUEUE_UNAVAILABLE');
    // Aggregate audit called once with status 'failure' since there were errors.
    expect(audit.log).toHaveBeenCalledWith(
      '__system__',
      'nightly_ingestion_fanout',
      'failure',
      expect.objectContaining({ enqueued: 2, failures: 1 })
    );
  });

  it('returns LOCK_NOT_ACQUIRED without touching the repo when lock is held', async () => {
    const repo = makeConnRepo([]);
    const dispatcher = new NightlyIngestionDispatcher(
      repo,
      makeQueue(),
      makeLockService(false),
      makeAudit(),
      silentLogger(),
      { clock: () => FIXED_NOW }
    );

    const result = await dispatcher.run();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('LOCK_NOT_ACQUIRED');
    expect(repo.findAllActive).not.toHaveBeenCalled();
  });

  it('passes clientIdFilter through to the repository for manual re-runs', async () => {
    const repo = makeConnRepo([]);
    const dispatcher = new NightlyIngestionDispatcher(
      repo,
      makeQueue(),
      makeLockService(),
      makeAudit(),
      silentLogger(),
      { clock: () => FIXED_NOW }
    );

    await dispatcher.run('client-42');

    expect(repo.findAllActive).toHaveBeenCalledWith('client-42');
  });
});
