import { success, failure, type Result } from '@domain/shared';
import type {
  IAuditLogger,
  INotificationService,
  IPlatformConnectionRepository,
  IPlatformStatusRepository,
  TokenExpiryBucket,
} from '@domain/ports';
import type Redis from 'ioredis';

export interface TokenHealthMonitorLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface TokenHealthMonitorReport {
  readonly totalExpiring: number;
  readonly notificationsSent: number;
  readonly notificationsSkipped: number;
  readonly statusUpdates: number;
  readonly failures: number;
  readonly bucketCounts: {
    readonly bucket30: number;
    readonly bucket14: number;
    readonly bucket7: number;
    readonly bucket0: number;
  };
}

export interface TokenHealthMonitorError {
  readonly code: 'REPO_FAILURE' | 'UNEXPECTED';
  readonly message: string;
  readonly retryable: boolean;
}

export interface TokenHealthMonitorOptions {
  /**
   * How many days ahead to scan for expiring tokens.
   */
  readonly scanWindowDays?: number;
  /**
   * TTL for Redis idempotency keys (prevents duplicate notifications).
   */
  readonly idempotencyTtlSeconds?: number;
  /**
   * Injected clock for deterministic testing.
   */
  readonly clock?: () => Date;
}

const DEFAULT_SCAN_WINDOW_DAYS = 30;
const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 30 * 24 * 3600; // 30 days

/**
 * Daily OAuth token health monitor (US-901 plumbing).
 *
 * Scans for connections expiring within 30 days, buckets them into
 * {30, 14, 7, 0} day thresholds, and fires exactly one notification per
 * (connection, bucket) pair using Redis-backed idempotency keys.
 *
 * When a token reaches bucket 0 (expired), also sets the platform status
 * to RED so the UI surfaces the error state.
 */
export class TokenHealthMonitor {
  private readonly scanWindowDays: number;
  private readonly idempotencyTtlSeconds: number;
  private readonly clock: () => Date;

  constructor(
    private readonly connectionRepo: IPlatformConnectionRepository,
    private readonly statusRepo: IPlatformStatusRepository,
    private readonly notificationService: INotificationService,
    private readonly redis: Redis,
    private readonly auditLogger: IAuditLogger,
    private readonly logger: TokenHealthMonitorLogger,
    options: TokenHealthMonitorOptions = {}
  ) {
    this.scanWindowDays = options.scanWindowDays ?? DEFAULT_SCAN_WINDOW_DAYS;
    this.idempotencyTtlSeconds = options.idempotencyTtlSeconds ?? DEFAULT_IDEMPOTENCY_TTL_SECONDS;
    this.clock = options.clock ?? (() => new Date());
  }

  async run(): Promise<Result<TokenHealthMonitorReport, TokenHealthMonitorError>> {
    const connectionsResult = await this.connectionRepo.findExpiringConnections(this.scanWindowDays);
    if (!connectionsResult.ok) {
      this.logger.error('Token health monitor: findExpiringConnections failed.', {
        error: connectionsResult.error,
      });
      return failure({
        code: 'REPO_FAILURE',
        message: connectionsResult.error.message,
        retryable: connectionsResult.error.retryable,
      });
    }

    const connections = connectionsResult.value;
    const now = this.clock();

    let notificationsSent = 0;
    let notificationsSkipped = 0;
    let statusUpdates = 0;
    let failures = 0;
    const bucketCounts = { bucket30: 0, bucket14: 0, bucket7: 0, bucket0: 0 };

    const BATCH_SIZE = 50;
    for (let i = 0; i < connections.length; i += BATCH_SIZE) {
      const batch = connections.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (conn) => {
          if (!conn.expiresAt) {
            return;
          }

          const daysRemaining = this.computeDaysRemaining(conn.expiresAt, now);
          const bucket = this.assignBucket(daysRemaining);

          if (bucket === null) {
            return;
          }

          this.incrementBucketCount(bucketCounts, bucket);

          const idempotencyKey = this.buildIdempotencyKey(conn.id, bucket);
          const alreadyNotified = await this.checkIdempotency(idempotencyKey);

          if (alreadyNotified) {
            notificationsSkipped += 1;
            return;
          }

          // Send notification.
          const notifyResult = await this.notificationService.notifyTokenExpiring({
            clientId: conn.clientId,
            connectionId: conn.id,
            platform: conn.platform,
            daysRemaining,
            bucket,
            expiresAt: conn.expiresAt,
          });

          if (!notifyResult.ok) {
            this.logger.warn('Token health monitor: notification failed.', {
              connectionId: conn.id,
              platform: conn.platform,
              bucket,
              error: notifyResult.error,
            });
            failures += 1;
            return;
          }

          notificationsSent += 1;

          // Mark as notified.
          await this.setIdempotency(idempotencyKey);

          // If bucket is 0 (expired), update platform status to RED.
          if (bucket === 0) {
            const statusResult = await this.statusRepo.updateStatus(
              conn.clientId,
              conn.platform,
              'RED',
              `OAuth token expired at ${conn.expiresAt}`
            );

            if (statusResult.ok) {
              statusUpdates += 1;
            } else {
              this.logger.warn('Token health monitor: status update failed.', {
                connectionId: conn.id,
                platform: conn.platform,
                error: statusResult.error,
              });
              failures += 1;
            }
          }
        })
      );
    }

    const report: TokenHealthMonitorReport = {
      totalExpiring: connections.length,
      notificationsSent,
      notificationsSkipped,
      statusUpdates,
      failures,
      bucketCounts,
    };

    await this.auditLogger.log(
      '__system__',
      'oauth_token_health_check',
      failures === 0 ? 'success' : 'failure',
      report as unknown as Record<string, unknown>
    );

    this.logger.info('Token health monitor complete.', report as unknown as Record<string, unknown>);
    return success(report);
  }

  private computeDaysRemaining(expiresAt: string, now: Date): number {
    const expiryDate = new Date(expiresAt);
    
    // Use UTC midnights to avoid DST calculation errors
    const utcExpiry = Date.UTC(expiryDate.getUTCFullYear(), expiryDate.getUTCMonth(), expiryDate.getUTCDate());
    const utcNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    
    const diffMs = utcExpiry - utcNow;
    return Math.floor(diffMs / (24 * 3600 * 1000));
  }

  /**
   * Assigns a bucket based on days remaining. Returns null if the connection
   * doesn't cross any bucket threshold (e.g., 25 days remaining doesn't match
   * any of {30, 14, 7, 0}).
   *
   * Bucket logic:
   *  - bucket 0: daysRemaining <= 0 (expired or expiring today)
   *  - bucket 7: 1 <= daysRemaining <= 7
   *  - bucket 14: 8 <= daysRemaining <= 14
   *  - bucket 30: 15 <= daysRemaining <= 30
   */
  private assignBucket(daysRemaining: number): TokenExpiryBucket | null {
    if (daysRemaining <= 0) return 0;
    if (daysRemaining <= 7) return 7;
    if (daysRemaining <= 14) return 14;
    if (daysRemaining <= 30) return 30;
    return null;
  }

  private incrementBucketCount(
    counts: TokenHealthMonitorReport['bucketCounts'],
    bucket: TokenExpiryBucket
  ): void {
    switch (bucket) {
      case 30:
        (counts as { bucket30: number }).bucket30 += 1;
        break;
      case 14:
        (counts as { bucket14: number }).bucket14 += 1;
        break;
      case 7:
        (counts as { bucket7: number }).bucket7 += 1;
        break;
      case 0:
        (counts as { bucket0: number }).bucket0 += 1;
        break;
    }
  }

  private buildIdempotencyKey(connectionId: string, bucket: TokenExpiryBucket): string {
    return `oauth:health:notified:${connectionId}:${bucket}`;
  }

  private async checkIdempotency(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (err) {
      this.logger.warn('Token health monitor: Redis idempotency check failed.', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail closed: if Redis is down, we skip sending the notification
      // to avoid risking duplicate spam to thousands of clients.
      return true;
    }
  }

  private async setIdempotency(key: string): Promise<void> {
    try {
      await this.redis.setex(key, this.idempotencyTtlSeconds, '1');
    } catch (err) {
      this.logger.warn('Token health monitor: Redis idempotency set failed.', {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal: the notification was sent; if we can't mark it, we risk
      // a duplicate on the next run, but that's better than silently failing.
    }
  }
}

