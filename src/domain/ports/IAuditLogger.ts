import type { Result } from '../shared/Result';

export interface AuditLogEntry {
  readonly clientId: string;
  readonly action: string;
  readonly status: 'success' | 'failure';
  readonly metadata: Record<string, unknown>;
}

export interface AuditLoggerError {
  readonly code: 'AUDIT_LOG_FAILURE' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

export interface IAuditLogger {
  log(
    clientId: string,
    action: string,
    status: 'success' | 'failure',
    metadata: Record<string, unknown>
  ): Promise<Result<boolean, AuditLoggerError>>;
}
