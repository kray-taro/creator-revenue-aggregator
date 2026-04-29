import type { IAuditLogger, AuditLoggerError } from '../../domain/ports/IAuditLogger';
import { SENSITIVE_FIELDS } from '../../domain/ports/IAuditLogger';
import { failure, success, type Result } from '../../domain/shared/Result';

export class ConsoleAuditLogger implements IAuditLogger {
  /**
   * Sanitizes sensitive data before logging.
   * Redacts or masks sensitive fields to prevent exposure of PII,
   * financial amounts, or platform-specific identifiers.
   */
  sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_FIELDS.includes(key as any)) {
        // Redact sensitive fields
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  async log(
    clientId: string,
    action: string,
    status: 'success' | 'failure',
    metadata: Record<string, unknown>
  ): Promise<Result<boolean, AuditLoggerError>> {
    try {
      // Sanitize metadata before logging
      const sanitizedMetadata = this.sanitize(metadata);

      // KISS implementation for Phase 1 scaffolding.
      // Can be replaced by DB/SIEM-backed logger behind the same port.
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          clientId,
          action,
          status,
          metadata: sanitizedMetadata,
        })
      );

      return success(true);
    } catch (error) {
      if (error instanceof Error) {
        return failure({
          code: 'AUDIT_LOG_FAILURE',
          message: error.message,
          retryable: false,
        });
      }

      return failure({
        code: 'UNKNOWN',
        message: 'Unknown audit logging failure.',
        retryable: false,
      });
    }
  }
}
