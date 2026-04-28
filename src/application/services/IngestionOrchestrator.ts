import { PlatformAdapterFactory } from '../factories/PlatformAdapterFactory';
import type { ITransaction, PlatformName } from '../../domain/entities/ITransaction';
import type { ITransactionRepository } from '../../domain/ports/ITransactionRepository';
import type { IPlatformStatusRepository } from '../../domain/ports/IPlatformStatusRepository';
import type { IAuditLogger } from '../../domain/ports/IAuditLogger';
import { validateTransaction, type ValidationError } from '../../domain/services/TransactionValidator';
import { failure, success, type Result } from '../../domain/shared/Result';
import type { PlatformAdapterErrorCode } from '../../domain/ports/IPlatformAdapter';

export interface ILogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface IngestionRunReport {
  readonly clientId: string;
  readonly platformName: string;
  readonly fetched: number;
  readonly saved: number;
  readonly redTabMarked: number;
  readonly failures: ReadonlyArray<IngestionRecordFailure>;
}

export interface IngestionRecordFailure {
  readonly transactionId: string;
  readonly reason: 'VALIDATION_FAILURE' | 'PERSISTENCE_FAILURE';
  readonly details: string;
}

export interface IngestionOrchestratorError {
  readonly code: 'ADAPTER_FAILURE' | 'TERMINAL_ADAPTER_FAILURE' | 'UNEXPECTED';
  readonly message: string;
  readonly retryable: boolean;
  readonly shouldRetry: boolean;
  readonly redTabSuggested: boolean;
}

const TERMINAL_ADAPTER_ERROR_CODES: ReadonlySet<PlatformAdapterErrorCode> = new Set([
  'RATE_LIMIT',
  'RATE_LIMITED',
  'AUTH_EXPIRED',
  'TOKEN_EXPIRED',
  'UNAUTHORIZED',
]);

const KNOWN_PLATFORMS: ReadonlySet<PlatformName> = new Set([
  'youtube',
  'patreon',
  'gumroad',
  'substack',
  'shopify',
  'stripe',
]);

export class IngestionOrchestrator {
  constructor(
    private readonly transactionRepository: ITransactionRepository,
    private readonly platformStatusRepository: IPlatformStatusRepository,
    private readonly auditLogger: IAuditLogger,
    private readonly logger: ILogger
  ) {}


  async run(clientId: string, platformName: string): Promise<Result<IngestionRunReport, IngestionOrchestratorError>> {
    return this.ingest(clientId, platformName);
  }

  async ingest(clientId: string, platformName: string): Promise<Result<IngestionRunReport, IngestionOrchestratorError>> {
    const adapter = PlatformAdapterFactory.create(platformName);

    const today = new Date().toISOString().slice(0, 10);
    const adapterResult = await adapter.fetchData({
      clientId,
      fromDate: today,
      toDate: today,
      connectionId: `${clientId}:${platformName}`,
    });

    if (!adapterResult.ok) {
      const isTerminal = TERMINAL_ADAPTER_ERROR_CODES.has(adapterResult.error.code);
      this.logger.error('Ingestion adapter failure.', {
        clientId,
        platformName,
        error: adapterResult.error,
        circuitBreaker: isTerminal ? 'EARLY_EXIT_TRIGGERED' : 'STANDARD_FAILURE_EXIT',
      });

      await this.auditLogger.log(clientId, 'INGESTION_ADAPTER_FETCH', 'failure', {
        platformName,
        errorCode: adapterResult.error.code,
        errorMessage: adapterResult.error.message,
        retryable: adapterResult.error.retryable,
        circuitBreaker: isTerminal,
        redTabSuggested: true,
      });

      if (isTerminal) {
        const platform = this.toKnownPlatform(platformName);
        if (platform) {
          await this.platformStatusRepository.updateStatus(
            clientId,
            platform,
            'RED',
            adapterResult.error.message
          );
        }
      }

      return failure({
        code: isTerminal ? 'TERMINAL_ADAPTER_FAILURE' : 'ADAPTER_FAILURE',
        message: adapterResult.error.message,
        retryable: adapterResult.error.retryable,
        shouldRetry: !isTerminal,
        redTabSuggested: true,
      });
    }

    const failures: IngestionRecordFailure[] = [];
    let saved = 0;
    let redTabMarked = 0;

    for (const record of adapterResult.value) {
      const prepared: ITransaction = {
        ...record,
        clientId,
      };

      const validationResult = validateTransaction(prepared);

      if (!validationResult.ok) {
        const validationError = validationResult.error;
        this.logValidationFailure(clientId, platformName, prepared, validationError);

        await this.auditLogger.log(clientId, 'INGESTION_TRANSACTION_VALIDATE', 'failure', {
          platformName,
          transactionId: prepared.id,
          platformTransactionId: prepared.platformTransactionId,
          errorCode: validationError.code,
          errorMessage: validationError.message,
          validationField: validationError.field,
          redTabStatus: 'error',
        });

        const redTabTransaction: ITransaction = {
          ...prepared,
          status: 'error',
          updatedAt: new Date().toISOString(),
        };

        const saveErrorResult = await this.transactionRepository.save(redTabTransaction);

        if (!saveErrorResult.ok) {
          await this.auditLogger.log(clientId, 'INGESTION_TRANSACTION_SAVE', 'failure', {
            platformName,
            transactionId: prepared.id,
            platformTransactionId: prepared.platformTransactionId,
            statusAttempted: 'error',
            errorCode: saveErrorResult.error.code,
            errorMessage: saveErrorResult.error.message,
            retryable: saveErrorResult.error.retryable,
          });

          failures.push({
            transactionId: prepared.id,
            reason: 'PERSISTENCE_FAILURE',
            details: saveErrorResult.error.message,
          });
          continue;
        }

        redTabMarked += 1;
        failures.push({
          transactionId: prepared.id,
          reason: 'VALIDATION_FAILURE',
          details: validationError.message,
        });
        continue;
      }

      const savedResult = await this.transactionRepository.save(prepared);
      if (!savedResult.ok) {
        await this.auditLogger.log(clientId, 'INGESTION_TRANSACTION_SAVE', 'failure', {
          platformName,
          transactionId: prepared.id,
          platformTransactionId: prepared.platformTransactionId,
          statusAttempted: prepared.status,
          errorCode: savedResult.error.code,
          errorMessage: savedResult.error.message,
          retryable: savedResult.error.retryable,
        });

        failures.push({
          transactionId: prepared.id,
          reason: 'PERSISTENCE_FAILURE',
          details: savedResult.error.message,
        });
        continue;
      }

      saved += 1;
    }

    return success({
      clientId,
      platformName,
      fetched: adapterResult.value.length,
      saved,
      redTabMarked,
      failures,
    });
  }

  private toKnownPlatform(platformName: string): PlatformName | null {
    const normalized = platformName.toLowerCase() as PlatformName;
    return KNOWN_PLATFORMS.has(normalized) ? normalized : null;
  }

  private logValidationFailure(
    clientId: string,
    platformName: string,
    transaction: ITransaction,
    validationError: ValidationError
  ): void {
    this.logger.warn('Validation Failure', {
      clientId,
      platformName,
      transactionId: transaction.id,
      platformTransactionId: transaction.platformTransactionId,
      validationError,
      redTabStatus: 'error',
    });
  }
}
