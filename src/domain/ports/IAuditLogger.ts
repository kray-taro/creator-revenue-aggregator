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

/**
 * Sensitive fields that should be redacted or masked in audit logs.
 * These fields may contain PII, financial data, or platform-specific identifiers.
 */
export const SENSITIVE_FIELDS = [
  'grossRevenue',
  'platformFee',
  'netPayout',
  'description',
  'platformId',
  'platformTransactionId',
  'qbAccountId',
  'qbEntryId',
  'receiptSnapshotUrl',
] as const;

export interface IAuditLogger {
  log(
    clientId: string,
    action: string,
    status: 'success' | 'failure',
    metadata: Record<string, unknown>
  ): Promise<Result<boolean, AuditLoggerError>>;

  /**
   * Sanitizes sensitive data before logging.
   * Redacts or masks sensitive fields to prevent exposure of PII,
   * financial amounts, or platform-specific identifiers.
   */
  sanitize(data: Record<string, unknown>): Record<string, unknown>;
}
