import type { ITransaction } from '@domain/entities';
import type { RepositoryError, IAuditLogger, PlatformAdapterErrorCode, AuditLoggerError} from '@domain/ports';
import type { ValidationError } from '@domain/services';
import type { Result } from '@domain/shared';

/**
 * Handles audit logging for ingestion operations
 */
export class IngestionAuditService implements IAuditLogger {
  constructor(private readonly auditLogger: IAuditLogger) {}

  // Implement IAuditLogger interface by delegating to the wrapped logger
  async log(
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

  async logAdapterFetchFailure(
    clientId: string,
    platformName: string,
    errorCode: PlatformAdapterErrorCode,
    errorMessage: string,
    retryable: boolean,
    isTerminal: boolean
  ): Promise<void> {
    await this.auditLogger.log(clientId, 'INGESTION_ADAPTER_FETCH', 'failure', {
      platformName,
      errorCode,
      errorMessage,
      retryable,
      circuitBreaker: isTerminal,
      redTabSuggested: true,
    });
  }

  async logValidationFailure(
    clientId: string,
    platformName: string,
    transaction: ITransaction,
    validationError: ValidationError
  ): Promise<void> {
    await this.auditLogger.log(clientId, 'INGESTION_TRANSACTION_VALIDATE', 'failure', {
      platformName,
      transactionId: transaction.id,
      platformTransactionId: transaction.platformTransactionId,
      errorCode: validationError.code,
      errorMessage: validationError.message,
      validationField: validationError.field,
      redTabStatus: 'error',
    });
  }

  async logPersistenceFailure(
    clientId: string,
    platformName: string,
    transaction: ITransaction,
    error: RepositoryError,
    statusAttempted: string
  ): Promise<void> {
    await this.auditLogger.log(clientId, 'INGESTION_TRANSACTION_SAVE', 'failure', {
      platformName,
      transactionId: transaction.id,
      platformTransactionId: transaction.platformTransactionId,
      statusAttempted,
      errorCode: error.code,
      errorMessage: error.message,
      retryable: error.retryable,
    });
  }
}


