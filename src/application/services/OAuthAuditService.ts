import type { IAuditLogger, AuditLoggerError, OAuthErrorCode } from '@domain/ports';
import type { PlatformName } from '@domain/entities';
import type { Result } from '@domain/shared';

/**
 * OAuth-specific audit logging service.
 * Wraps IAuditLogger with strongly-typed OAuth event methods.
 * Follows the IngestionAuditService decorator pattern.
 */
export class OAuthAuditService implements IAuditLogger {
  constructor(private readonly auditLogger: IAuditLogger) {}

  log(
    clientId: string,
    action: string,
    status: 'success' | 'failure',
    metadata: Record<string, unknown>
  ): Promise<Result<boolean, AuditLoggerError>> {
    return this.auditLogger.log(clientId, action, status, metadata);
  }

  sanitize(data: Record<string, unknown>): Record<string, unknown> {
    return this.auditLogger.sanitize(data);
  }

  async logConnectionInitiated(
    bookkeeperId: string,
    clientId: string,
    platform: PlatformName
  ): Promise<void> {
    await this.auditLogger.log(clientId, 'OAUTH_CONNECTION_INITIATED', 'success', {
      bookkeeperId,
      platform,
    });
  }

  async logTokenExchangeSuccess(
    clientId: string,
    platform: PlatformName,
    expiresAt: string
  ): Promise<void> {
    await this.auditLogger.log(clientId, 'OAUTH_TOKEN_EXCHANGE', 'success', {
      platform,
      expiresAt,
    });
  }

  async logTokenExchangeFailure(
    clientId: string,
    platform: PlatformName,
    errorCode: OAuthErrorCode
  ): Promise<void> {
    await this.auditLogger.log(clientId, 'OAUTH_TOKEN_EXCHANGE', 'failure', {
      platform,
      errorCode,
    });
  }

  async logTokenRefreshSuccess(connectionId: string, newExpiresAt: string): Promise<void> {
    await this.auditLogger.log(connectionId, 'OAUTH_TOKEN_REFRESH', 'success', {
      connectionId,
      newExpiresAt,
    });
  }

  async logTokenRefreshFailure(connectionId: string, errorCode: OAuthErrorCode): Promise<void> {
    await this.auditLogger.log(connectionId, 'OAUTH_TOKEN_REFRESH', 'failure', {
      connectionId,
      errorCode,
    });
  }

  async logDisconnection(
    bookkeeperId: string,
    connectionId: string,
    reason: string
  ): Promise<void> {
    await this.auditLogger.log(connectionId, 'OAUTH_DISCONNECTION', 'success', {
      bookkeeperId,
      connectionId,
      reason,
    });
  }
}
