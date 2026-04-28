import type { IAuditLogger, AuditLoggerError } from '../../domain/ports/IAuditLogger';
import { failure, success, type Result } from '../../domain/shared/Result';

export class ConsoleAuditLogger implements IAuditLogger {
  async log(
    clientId: string,
    action: string,
    status: 'success' | 'failure',
    metadata: Record<string, unknown>
  ): Promise<Result<boolean, AuditLoggerError>> {
    try {
      // KISS implementation for Phase 1 scaffolding.
      // Can be replaced by DB/SIEM-backed logger behind the same port.
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          clientId,
          action,
          status,
          metadata,
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
