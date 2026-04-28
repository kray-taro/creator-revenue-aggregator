import type { ITransaction } from '@domain/entities';
import type { RepositoryError, IAuditLogger, PlatformAdapterErrorCode} from '@domain/ports';
import type { ValidationError } from '@domain/services';

/**
 * Handles audit logging for ingestion operations
 */
export class IngestionAuditService {
  constructor(private readonly auditLogger: IAuditLogger) {}

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


