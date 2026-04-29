import { PlatformAdapterFactory } from '../factories/PlatformAdapterFactory';
import type { ITransaction } from '@domain/entities';
import { validateTransaction, type ValidationError } from '@domain/services';
import { success, type Result } from '@domain/shared';
import type { RepositoryError } from '@domain/ports';
import { TransactionPersistenceService } from './TransactionPersistenceService';
import { IngestionErrorHandler } from './IngestionErrorHandler';
import { IngestionAuditService } from './IngestionAuditService';
import { OrchestratorErrorHandler } from './OrchestratorErrorHandler';

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_BATCH_DELAY_MS = 100; // Rate limiting delay between batches

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

interface BatchProcessingResult {
  saved: number;
  redTabMarked: number;
  failures: IngestionRecordFailure[];
}

export interface IngestionOrchestratorError {
  readonly code: 'ADAPTER_FAILURE' | 'TERMINAL_ADAPTER_FAILURE' | 'UNEXPECTED';
  readonly message: string;
  readonly retryable: boolean;
  readonly shouldRetry: boolean;
  readonly redTabSuggested: boolean;
}

/**
 * Orchestrates the ingestion process by coordinating between adapters and services.
 * Follows GRASP Controller pattern - delegates responsibilities to specialized services.
 */
export class IngestionOrchestrator {
  private readonly persistenceService: TransactionPersistenceService;
  private readonly errorHandler: IngestionErrorHandler;
  private readonly auditService: IngestionAuditService;
  private readonly orchestratorErrorHandler: OrchestratorErrorHandler;
  private readonly batchSize: number;
  private readonly batchDelayMs: number;

  constructor(
    persistenceService: TransactionPersistenceService,
    errorHandler: IngestionErrorHandler,
    auditService: IngestionAuditService,
    private readonly logger: ILogger,
    batchSize: number = DEFAULT_BATCH_SIZE,
    batchDelayMs: number = DEFAULT_BATCH_DELAY_MS
  ) {
    this.persistenceService = persistenceService;
    this.errorHandler = errorHandler;
    this.auditService = auditService;
    this.orchestratorErrorHandler = new OrchestratorErrorHandler(auditService as any);
    this.batchSize = batchSize;
    this.batchDelayMs = batchDelayMs;
  }


  async run(clientId: string, platformName: string): Promise<Result<IngestionRunReport, IngestionOrchestratorError>> {
    return this.ingest(clientId, platformName);
  }

  async ingest(clientId: string, platformName: string): Promise<Result<IngestionRunReport, IngestionOrchestratorError>> {
    const adapter = PlatformAdapterFactory.create(platformName);

    // Calculate date range per PRD US-102:
    // - On 1st of month: Full pull of prior month
    // - Other days: Incremental pull of last 7 days (catches late-arriving transactions)
    const today = new Date();
    const isFirstOfMonth = today.getDate() === 1;
    
    const fromDate = isFirstOfMonth
      ? new Date(today.getFullYear(), today.getMonth() - 1, 1) // Prior month start
      : new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);   // Last 7 days
    
    const toDate = today;

    this.logger.info('Ingestion date range calculated', {
      clientId,
      platformName,
      isFirstOfMonth,
      fromDate: fromDate.toISOString().slice(0, 10),
      toDate: toDate.toISOString().slice(0, 10),
    });

    const adapterResult = await adapter.fetchData({
      clientId,
      fromDate: fromDate.toISOString().slice(0, 10),
      toDate: toDate.toISOString().slice(0, 10),
      connectionId: `${clientId}:${platformName}`,
    });

    if (!adapterResult.ok) {
      const isTerminal = this.errorHandler.isTerminalError(adapterResult.error.code);
      this.logger.error('Ingestion adapter failure.', {
        clientId,
        platformName,
        error: adapterResult.error,
        circuitBreaker: isTerminal ? 'EARLY_EXIT_TRIGGERED' : 'STANDARD_FAILURE_EXIT',
      });

      await this.auditService.logAdapterFetchFailure(
        clientId,
        platformName,
        adapterResult.error.code,
        adapterResult.error.message,
        adapterResult.error.retryable,
        isTerminal
      );

      if (isTerminal) {
        await this.errorHandler.updatePlatformStatusToRed(
          clientId,
          platformName,
          adapterResult.error.message
        );
      }

      return this.orchestratorErrorHandler.transformError<IngestionOrchestratorError>(
        adapterResult.error,
        {
          defaultCode: 'ADAPTER_FAILURE',
          codeMapping: isTerminal ? { [adapterResult.error.code]: 'TERMINAL_ADAPTER_FAILURE' } : undefined,
        },
        {
          shouldRetry: !isTerminal,
          redTabSuggested: true,
        }
      );
    }

    const failures: IngestionRecordFailure[] = [];
    let saved = 0;
    let redTabMarked = 0;

    // Process transactions in batches
    const records = adapterResult.value;
    for (let i = 0; i < records.length; i += this.batchSize) {
      const batch = records.slice(i, i + this.batchSize);
      
      const batchResult = await this.processBatch(batch, clientId, platformName);
      
      saved += batchResult.saved;
      redTabMarked += batchResult.redTabMarked;
      failures.push(...batchResult.failures);

      // Rate limiting: delay between batches (except for the last batch)
      if (i + this.batchSize < records.length) {
        await new Promise(resolve => setTimeout(resolve, this.batchDelayMs));
      }
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

  /**
   * Processes a single batch of transactions
   */
  private async processBatch(
    batch: ITransaction[],
    clientId: string,
    platformName: string
  ): Promise<BatchProcessingResult> {
    // Prepare all transactions in the batch
    const preparedBatch = batch.map(record => ({
      ...record,
      clientId,
    }));

    // Parallel validation of the batch
    const validationResults = await Promise.all(
      preparedBatch.map(async (prepared) => ({
        transaction: prepared,
        validation: validateTransaction(prepared),
      }))
    );

    // Separate valid and invalid transactions
    const validTransactions: ITransaction[] = [];
    const invalidTransactions: Array<{ transaction: ITransaction; error: ValidationError }> = [];

    for (const { transaction, validation } of validationResults) {
      if (validation.ok) {
        validTransactions.push(transaction);
      } else {
        invalidTransactions.push({ transaction, error: validation.error });
      }
    }

    // Process invalid and valid transactions in parallel
    const [invalidResult, validResult] = await Promise.all([
      this.processInvalidTransactions(invalidTransactions, clientId, platformName),
      this.processValidTransactions(validTransactions, clientId, platformName),
    ]);

    // Combine results
    return {
      saved: invalidResult.saved + validResult.saved,
      redTabMarked: invalidResult.redTabMarked + validResult.redTabMarked,
      failures: [...invalidResult.failures, ...validResult.failures],
    };
  }

  /**
   * Processes invalid transactions by marking them as error status and persisting
   */
  private async processInvalidTransactions(
    invalidTransactions: Array<{ transaction: ITransaction; error: ValidationError }>,
    clientId: string,
    platformName: string
  ): Promise<BatchProcessingResult> {
    if (invalidTransactions.length === 0) {
      return { saved: 0, redTabMarked: 0, failures: [] };
    }

    // Cache timestamp for consistent updatedAt across all transactions
    const now = new Date().toISOString();

    // Mark transactions as error status
    const redTabTransactions = invalidTransactions.map(({ transaction }) => ({
      ...transaction,
      status: 'error' as const,
      updatedAt: now,
    }));

    // Synchronous logging
    invalidTransactions.forEach(({ transaction, error }) => {
      this.logValidationFailure(clientId, platformName, transaction, error);
    });

    // Async audit logging in parallel
    await Promise.all(
      invalidTransactions.map(({ transaction, error }) =>
        this.auditService.logValidationFailure(clientId, platformName, transaction, error)
      )
    );

    // Bulk save error transactions
    const saveErrorResult = await this.persistenceService.saveTransactionsBulk(redTabTransactions);

    if (!saveErrorResult.ok) {
      // Handle persistence failure
      const persistenceFailures = await this.handlePersistenceFailure(
        redTabTransactions,
        saveErrorResult.error,
        clientId,
        platformName,
        'error'
      );

      return {
        saved: 0,
        redTabMarked: 0,
        failures: persistenceFailures,
      };
    }

    // Success: transactions saved with error status
    const validationFailures = invalidTransactions.map(({ transaction, error }) => ({
      transactionId: transaction.id,
      reason: 'VALIDATION_FAILURE' as const,
      details: error.message,
    }));

    return {
      saved: 0,
      redTabMarked: saveErrorResult.value.length,
      failures: validationFailures,
    };
  }

  /**
   * Processes valid transactions by persisting them
   */
  private async processValidTransactions(
    validTransactions: ITransaction[],
    clientId: string,
    platformName: string
  ): Promise<BatchProcessingResult> {
    if (validTransactions.length === 0) {
      return { saved: 0, redTabMarked: 0, failures: [] };
    }

    // Bulk save valid transactions
    const savedResult = await this.persistenceService.saveTransactionsBulk(validTransactions);

    if (!savedResult.ok) {
      // Handle persistence failure
      const persistenceFailures = await this.handlePersistenceFailure(
        validTransactions,
        savedResult.error,
        clientId,
        platformName,
        validTransactions[0]?.status || 'pending'
      );

      return {
        saved: 0,
        redTabMarked: 0,
        failures: persistenceFailures,
      };
    }

    return {
      saved: savedResult.value.length,
      redTabMarked: 0,
      failures: [],
    };
  }

  /**
   * Handles persistence failures by logging to audit and tracking failures
   */
  private async handlePersistenceFailure(
    transactions: ITransaction[],
    error: RepositoryError,
    clientId: string,
    platformName: string,
    statusAttempted: string
  ): Promise<IngestionRecordFailure[]> {
    // Log all persistence failures in parallel
    await Promise.all(
      transactions.map((transaction) =>
        this.auditService.logPersistenceFailure(
          clientId,
          platformName,
          transaction,
          error,
          statusAttempted
        )
      )
    );

    // Return failure records
    return transactions.map((transaction) => ({
      transactionId: transaction.id,
      reason: 'PERSISTENCE_FAILURE' as const,
      details: error.message,
    }));
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


