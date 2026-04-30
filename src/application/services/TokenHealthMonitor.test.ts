import { TokenHealthMonitor } from './TokenHealthMonitor';
import { success, failure } from '@domain/shared';
import type {
  IAuditLogger,
  INotificationService,
  IPlatformConnectionRepository,
  IPlatformStatusRepository,
  PlatformConnection,
  NotificationServiceError,
} from '@domain/ports';
import type Redis from 'ioredis';

const silentLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

function makeAudit(): jest.Mocked<IAuditLogger> {
  return {
    log: jest.fn().mockResolvedValue(success(true)),
    sanitize: jest.fn((x) => x),
  };
}

function makeNotificationService(
  shouldSucceed = true
): jest.Mocked<INotificationService> {
  return {
    notifyTokenExpiring: jest.fn().mockResolvedValue(
      shouldSucceed
        ? success(true)
        : failure({
            code: 'DELIVERY_FAILED',
            message: 'smtp down',
            retryable: true,
          } as NotificationServiceError)
    ),
  };
}

function makeStatusRepo(): jest.Mocked<IPlatformStatusRepository> {
  return {
    updateStatus: jest.fn().mockResolvedValue(
      success({
        clientId: 'c1',
        platform: 'youtube',
        status: 'RED',
        updatedAt: '2026-05-15T00:00:00Z',
      })
    ),
  };
}

function makeRedis(): jest.Mocked<Redis> {
  return {
    exists: jest.fn().mockResolvedValue(0),
    setex: jest.fn().mockResolvedValue('OK'),
  } as unknown as jest.Mocked<Redis>;
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
    findAllActive: jest.fn(),
    findExpiringConnections: jest.fn().mockResolvedValue(success(connections)),
  } as unknown as jest.Mocked<IPlatformConnectionRepository>;
}

const conn = (
  id: string,
  clientId: string,
  platform: PlatformConnection['platform'],
  expiresAt: string
): PlatformConnection => ({
  id,
  clientId,
  platform,
  status: 'active',
  expiresAt,
});

const FIXED_NOW = new Date('2026-05-15T12:00:00Z');

describe('TokenHealthMonitor', () => {
  describe('bucket assignment', () => {
    it('assigns bucket 0 for expired tokens (daysRemaining <= 0)', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-14T00:00:00Z'), // expired yesterday
        conn('c2', 'client-1', 'stripe', '2026-05-15T00:00:00Z'), // expires today
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const statusRepo = makeStatusRepo();
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        statusRepo,
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.bucketCounts.bucket0).toBe(2);
      expect(result.value.notificationsSent).toBe(2);
      // Both expired connections should trigger status updates.
      expect(statusRepo.updateStatus).toHaveBeenCalledTimes(2);
      expect(statusRepo.updateStatus).toHaveBeenCalledWith(
        'client-1',
        'youtube',
        'RED',
        expect.stringContaining('expired')
      );
    });

    it('assigns bucket 7 for tokens expiring in 1-7 days', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-16T12:00:00Z'), // 1 day
        conn('c2', 'client-1', 'stripe', '2026-05-22T12:00:00Z'), // 7 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.bucketCounts.bucket7).toBe(2);
      expect(result.value.notificationsSent).toBe(2);
    });

    it('assigns bucket 14 for tokens expiring in 8-14 days', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-23T12:00:00Z'), // 8 days
        conn('c2', 'client-1', 'stripe', '2026-05-29T12:00:00Z'), // 14 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.bucketCounts.bucket14).toBe(2);
    });

    it('assigns bucket 30 for tokens expiring in 15-30 days', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-30T12:00:00Z'), // 15 days
        conn('c2', 'client-1', 'stripe', '2026-06-14T12:00:00Z'), // 30 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.bucketCounts.bucket30).toBe(2);
    });

    it('skips connections outside bucket thresholds (>30 days)', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-06-20T12:00:00Z'), // 36 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.notificationsSent).toBe(0);
      expect(notificationService.notifyTokenExpiring).not.toHaveBeenCalled();
    });

    it('skips connections without expiresAt', async () => {
      const connections = [
        { ...conn('c1', 'client-1', 'youtube', ''), expiresAt: undefined },
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.notificationsSent).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('skips notification if Redis idempotency key exists', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-22T12:00:00Z'), // 7 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();
      (redis.exists as jest.Mock).mockResolvedValue(1); // Key exists

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.notificationsSkipped).toBe(1);
      expect(result.value.notificationsSent).toBe(0);
      expect(notificationService.notifyTokenExpiring).not.toHaveBeenCalled();
    });

    it('sets idempotency key after successful notification', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-22T12:00:00Z'), // 7 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW, idempotencyTtlSeconds: 172800 }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(redis.setex).toHaveBeenCalledWith(
        'oauth:health:notified:c1:7',
        172800,
        '1'
      );
    });

    it('proceeds with notification if Redis idempotency check fails (fail-open)', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-22T12:00:00Z'), // 7 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();
      (redis.exists as jest.Mock).mockRejectedValue(new Error('redis down'));

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Should proceed despite Redis failure.
      expect(result.value.notificationsSent).toBe(1);
    });

    it('continues despite Redis setex failure (non-fatal)', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-22T12:00:00Z'), // 7 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();
      (redis.setex as jest.Mock).mockRejectedValue(new Error('redis down'));

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Notification was sent; setex failure is logged but not fatal.
      expect(result.value.notificationsSent).toBe(1);
    });
  });

  describe('notification delivery', () => {
    it('calls notificationService with correct payload', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-22T12:00:00Z'), // 7 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      await monitor.run();

      expect(notificationService.notifyTokenExpiring).toHaveBeenCalledWith({
        clientId: 'client-1',
        connectionId: 'c1',
        platform: 'youtube',
        daysRemaining: 7,
        bucket: 7,
        expiresAt: '2026-05-22T12:00:00Z',
      });
    });

    it('counts notification failures separately', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-22T12:00:00Z'), // 7 days
        conn('c2', 'client-1', 'stripe', '2026-05-23T12:00:00Z'), // 8 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService(false); // Fails
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.failures).toBe(2);
      expect(result.value.notificationsSent).toBe(0);
    });
  });

  describe('status updates', () => {
    it('updates platform status to RED when bucket is 0', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-14T00:00:00Z'), // expired
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const statusRepo = makeStatusRepo();
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        statusRepo,
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.statusUpdates).toBe(1);
      expect(statusRepo.updateStatus).toHaveBeenCalledWith(
        'client-1',
        'youtube',
        'RED',
        expect.stringContaining('expired')
      );
    });

    it('does not update status for non-expired buckets', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-22T12:00:00Z'), // 7 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const statusRepo = makeStatusRepo();
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        statusRepo,
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.statusUpdates).toBe(0);
      expect(statusRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('counts status update failures', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-14T00:00:00Z'), // expired
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const statusRepo = makeStatusRepo();
      (statusRepo.updateStatus as jest.Mock).mockResolvedValue(
        failure({
          code: 'DB_ERROR',
          message: 'db down',
          retryable: true,
        })
      );
      const redis = makeRedis();

      const monitor = new TokenHealthMonitor(
        repo,
        statusRepo,
        notificationService,
        redis,
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.failures).toBe(1);
      expect(result.value.statusUpdates).toBe(0);
    });
  });

  describe('audit logging', () => {
    it('logs aggregate report with __system__ clientId', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-22T12:00:00Z'), // 7 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService();
      const redis = makeRedis();
      const audit = makeAudit();

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        audit,
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      await monitor.run();

      expect(audit.log).toHaveBeenCalledWith(
        '__system__',
        'oauth_token_health_check',
        'success',
        expect.objectContaining({
          totalExpiring: 1,
          notificationsSent: 1,
        })
      );
    });

    it('logs status=failure when there are failures', async () => {
      const connections = [
        conn('c1', 'client-1', 'youtube', '2026-05-22T12:00:00Z'), // 7 days
      ];
      const repo = makeConnRepo(connections);
      const notificationService = makeNotificationService(false); // Fails
      const redis = makeRedis();
      const audit = makeAudit();

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        notificationService,
        redis,
        audit,
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      await monitor.run();

      expect(audit.log).toHaveBeenCalledWith(
        '__system__',
        'oauth_token_health_check',
        'failure',
        expect.objectContaining({ failures: 1 })
      );
    });
  });

  describe('error handling', () => {
    it('returns REPO_FAILURE when findExpiringConnections fails', async () => {
      const repo = makeConnRepo([]);
      (repo.findExpiringConnections as jest.Mock).mockResolvedValue(
        failure({
          code: 'DB_ERROR',
          message: 'db down',
          retryable: true,
        })
      );

      const monitor = new TokenHealthMonitor(
        repo,
        makeStatusRepo(),
        makeNotificationService(),
        makeRedis(),
        makeAudit(),
        silentLogger(),
        { clock: () => FIXED_NOW }
      );

      const result = await monitor.run();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('REPO_FAILURE');
      expect(result.error.retryable).toBe(true);
    });
  });
});

