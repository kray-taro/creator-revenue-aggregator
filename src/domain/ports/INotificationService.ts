import type { PlatformName } from '../entities/ITransaction';
import type { Result } from '../shared/Result';

/**
 * Token-expiry bucket. 0 means already expired.
 *
 * The daily health monitor fires exactly one notification per
 * (connection, bucket) pair by crossing the boundary (30 → 14 → 7 → 0).
 */
export type TokenExpiryBucket = 30 | 14 | 7 | 0;

export interface TokenExpiryNotification {
  readonly clientId: string;
  readonly connectionId: string;
  readonly platform: PlatformName;
  readonly daysRemaining: number;
  readonly bucket: TokenExpiryBucket;
  readonly expiresAt: string;
}

export interface NotificationServiceError {
  readonly code: 'DELIVERY_FAILED' | 'RATE_LIMITED' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Minimal notification port — Sprint 2 ships with a logging stub; the
 * SES/SendGrid/email adapter lands in Sprint 12 behind the same interface.
 */
export interface INotificationService {
  notifyTokenExpiring(
    notification: TokenExpiryNotification
  ): Promise<Result<boolean, NotificationServiceError>>;
}
