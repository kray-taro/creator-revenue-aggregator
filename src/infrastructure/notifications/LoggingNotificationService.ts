import { success, type Result } from '@domain/shared';
import type {
  IAuditLogger,
  INotificationService,
  NotificationServiceError,
  TokenExpiryNotification,
} from '@domain/ports';
import type { Logger } from '@composition/Logger';

/**
 * Sprint 2 stub. Logs the token-expiry warning and writes an audit record.
 *
 * Sprint 12 replaces this with an SES/SendGrid-backed adapter that also
 * delivers the Auth Proxy Portal deep link. The `INotificationService`
 * interface is deliberately stable so that change is drop-in.
 */
export class LoggingNotificationService implements INotificationService {
  constructor(
    private readonly logger: Logger,
    private readonly auditLogger: IAuditLogger
  ) {}

  async notifyTokenExpiring(
    n: TokenExpiryNotification
  ): Promise<Result<boolean, NotificationServiceError>> {
    const level = n.bucket === 0 ? 'error' : n.bucket === 7 ? 'warn' : 'info';

    const message = n.bucket === 0
      ? `OAuth token expired for ${n.platform}.`
      : `OAuth token for ${n.platform} expires in ${n.daysRemaining} day(s).`;

    this.logger[level](message, {
      clientId: n.clientId,
      connectionId: n.connectionId,
      platform: n.platform,
      daysRemaining: n.daysRemaining,
      bucket: n.bucket,
      expiresAt: n.expiresAt,
      deliveryPending: true,
    });

    await this.auditLogger.log(
      n.clientId,
      'oauth_token_expiry_notification',
      'success',
      {
        connectionId: n.connectionId,
        platform: n.platform,
        bucket: n.bucket,
        daysRemaining: n.daysRemaining,
        expiresAt: n.expiresAt,
        channel: 'stub',
      }
    );

    return success(true);
  }
}
