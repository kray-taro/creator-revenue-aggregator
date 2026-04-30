import type { PlatformAdapterFactory } from '../factories/PlatformAdapterFactory';
import type { ITransaction, PlatformName } from '@domain/entities';
import { validateTransaction, type ValidationError } from '@domain/services';
import { success, failure, type Result } from '@domain/shared';
import type { RepositoryError, IDeduplicationService, IConfidenceScoringService } from '@domain/ports';
import { TransactionPersistenceService } from './TransactionPersistenceService';
import { IngestionErrorHandler } from './IngestionErrorHandler';
import { IngestionAuditService } from './IngestionAuditService';
import { OrchestratorErrorHandler } from './OrchestratorErrorHandler';
import { getPlatformConfig } from '@infrastructure/config/PlatformConfig';
import type { IPlatformConnectionRepository } from '@domain/ports';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

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
  readonly duplicatesFound: number;
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
  duplicatesFound: number;
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
 * Orchestrates the ingestion pipeline:
 *   Adapter → Validation → Deduplication → Confidence Scoring → Persistence
 *
 * Follows GRASP Controller pattern — delegates to specialized services.
 * Deduplication and scoring are injected and optional (null = skip).
 */
export class IngestionOrchestrator {
  private readonly persistenceService: TransactionPersistenceService;
  private readonly errorHandler: IngestionErrorHandler;
  private readonly auditService: IngestionAuditService;
  private readonly orchestratorErrorHandler: OrchestratorErrorHandler;

  constructor(
    private readonly adapterFactory: PlatformAdapterFactory,
    persistenceService: TransactionPersistenceService,
    errorHandler: IngestionErrorHandler,
    auditService: IngestionAuditService,
    private readonly logger: ILogger,
    private readonly connectionRepo: IPlatformConnectionRepository,
    private readonly deduplicationService: IDeduplicationService | null = null,
    private readonly confidenceScoringService: IConfidenceScoringService | null = null
  ) {
    this.persistenceService = persistenceService;
    this.errorHandler = errorHandler;
    this.auditService = auditService;
    this.orchestratorErrorHandler = new OrchestratorErrorHandler(auditService);
  }

  async run(clientId: string, platformName: string): Promise<Result<IngestionRunReport, IngestionOrchestratorError>> {
    return this.ingest(clientId, platformName);
  }

  async ingest(clientId: string, platformName: string): Promise<Result<IngestionRunReport, IngestionOrchestratorError>> {
    const adapter = this.adapterFactory.create(platformName);

    const today = new Date();
    const isFirstOfMonth = today.getDate() === 1;

    const fromDate = isFirstOfMonth
      ? new Date(today.getFullYear(), today.getMonth() - 1, 1)
      : new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const toDate = today;

    this.logger.info('Ingestion date range calculated', {
      clientId,
      platformName,
      isFirstOfMonth,
      fromDate: fromDate.toISOString().slice(0, 10),
      toDate: toDate.toISOString().slice(0, 10),
    });

    const connResult = await this.connectionRepo.findByClientAndPlatform(clientId, platformName as PlatformName);
    if (!connResult.ok || !connResult.value) {
      this.logger.error('Connection not found', { clientId, platformName });
      return failure({
        code: 'ADAPTER_FAILURE',
        message: 'Connection not found',
        retryable: false,
        shouldRetry: false,
        redTabSuggested: true,
      });
    }

    let adapterResult;
    try {
      adapterResult = await adapter.fetchData({
        clientId,
        fromDate: fromDate.toISOString().slice(0, 10),
        toDate: toDate.toISOString().slice(0, 10),
        connectionId: connResult.value.id,
        platformUserId: connResult.value.platformUserId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown adapter error';
      this.logger.error('Adapter threw unexpected exception', { clientId, platformName, error: errorMessage });

      await this.auditService.logAdapterFetchFailure(clientId, platformName, 'UNKNOWN', errorMessage, true, false);

      return this.orchestratorErrorHandler.transformError<IngestionOrchestratorError>(
        { code: 'UNKNOWN', message: errorMessage },
        { defaultCode: 'ADAPTER_FAILURE' },
        { shouldRetry: true, redTabSuggested: true }
      );
    }

    if (!adapterResult.ok) {
      const isTerminal = this.errorHandler.isTerminalError(adapterResult.error.code);
      this.logger.error('Ingestion adapter failure.', {
        clientId,
        platformName,
        error: adapterResult.error,
        circuitBreaker: isTerminal ? 'EARLY_EXIT_TRIGGERED' : 'STANDARD_FAILURE_EXIT',
      });

      await this.auditService.logAdapterFetchFailure(
        clientId, platformName,
        adapterResult.error.code, adapterResult.error.message,
        adapterResult.error.retryable, isTerminal
      );

      if (isTerminal) {
        await this.errorHandler.updatePlatformStatusToRed(clientId, platformName, adapterResult.error.message);
      }

      return this.orchestratorErrorHandler.transformError<IngestionOrchestratorError>(
        adapterResult.error,
        {
          defaultCode: 'ADAPTER_FAILURE',
          codeMapping: isTerminal ? { [adapterResult.error.code]: 'TERMINAL_ADAPTER_FAILURE' } : undefined,
        },
        { shouldRetry: !isTerminal, redTabSuggested: true }
      );
    }

    const failures: IngestionRecordFailure[] = [];
    let saved = 0;
    let redTabMarked = 0;
    let duplicatesFound = 0;

    const platformConfig = getPlatformConfig(platformName as PlatformName);
    const { batchSize, batchDelayMs } = platformConfig;

    this.logger.info('Using platform-specific batch configuration', { clientId, platformName, batchSize, batchDelayMs });

    const records = adapterResult.value;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      const batchResult = await this.processBatch(batch, clientId, platformName);

      saved += batchResult.saved;
      redTabMarked += batchResult.redTabMarked;
      duplicatesFound += batchResult.duplicatesFound;
      failures.push(...batchResult.failures);

      if (i + batchSize < records.length) {
        await delay(batchDelayMs);
      }
    }

    return success({
      clientId,
      platformName,
      fetched: adapterResult.value.length,
      saved,
      redTabMarked,
      duplicatesFound,
      failures,
    });
  }

  private async processBatch(
    batch: ITransaction[],
    clientId: string,
    platformName: string
  ): Promise<BatchProcessingResult> {
    const preparedBatch = batch.map(record => ({ ...record, clientId }));

    const validationResults = await Promise.all(
      preparedBatch.map(async (prepared) => ({
        transaction: prepared,
        validation: validateTransaction(prepared),
      }))
    );

    const validTransactions: ITransaction[] = [];
    const invalidTransactions: Array<{ transaction: ITransaction; error: ValidationError }> = [];

    for (const { transaction, validation } of validationResults) {
      if (validation.ok) {
        validTransactions.push(transaction);
      } else {
        invalidTransactions.push({ transaction, error: validation.error });
      }
    }

    // Apply deduplication to valid transactions
    let dedupedTransactions = validTransactions;
    let batchDuplicatesFound = 0;

    if (this.deduplicationService && validTransactions.length > 0) {
      const dedupResult = await this.deduplicationService.checkBatch(validTransactions, clientId);
      if (dedupResult.ok) {
        batchDuplicatesFound = dedupResult.value.duplicatesFound;
        dedupedTransactions = dedupResult.value.results.map(r => {
          const fingerprint = r.fingerprint;
          if (r.isDuplicate) {
            return { ...r.transaction, deduplicationHash: fingerprint, status: 'pending_review' as const };
          }
          return { ...r.transaction, deduplicationHash: fingerprint };
        });
      } else {
        this.logger.warn('Deduplication failed, proceeding without dedup', { clientId, platformName, error: dedupResult.error });
      }
    }

    // Apply confidence scoring
    if (this.confidenceScoringService && dedupedTransactions.length > 0) {
      const scoringResult = await this.confidenceScoringService.scoreBatch(dedupedTransactions, clientId);
      if (scoringResult.ok) {
        dedupedTransactions = scoringResult.value.results.map(r => {
          const status = r.category === 'RED' ? 'error' as const : r.transaction.status;
          return { ...r.transaction, confidenceScore: r.score / 100, status };
        });
      } else {
        this.logger.warn('Confidence scoring failed, proceeding without scores', { clientId, platformName, error: scoringResult.error });
      }
    }

    const [invalidResult, validResult] = await Promise.all([
      this.processInvalidTransactions(invalidTransactions, clientId, platformName),
      this.processValidTransactions(dedupedTransactions, clientId, platformName),
    ]);

    return {
      saved: invalidResult.saved + validResult.saved,
      redTabMarked: invalidResult.redTabMarked + validResult.redTabMarked,
      duplicatesFound: batchDuplicatesFound,
      failures: [...invalidResult.failures, ...validResult.failures],
    };
  }

  private async processInvalidTransactions(
    invalidTransactions: Array<{ transaction: ITransaction; error: ValidationError }>,
    clientId: string,
    platformName: string
  ): Promise<BatchProcessingResult> {
    if (invalidTransactions.length === 0) {
      return { saved: 0, redTabMarked: 0, duplicatesFound: 0, failures: [] };
    }

    const now = new Date().toISOString();
    const redTabTransactions = invalidTransactions.map(({ transaction }) => ({
      ...transaction,
      status: 'error' as const,
      updatedAt: now,
    }));

    invalidTransactions.forEach(({ transaction, error }) => {
      this.logValidationFailure(clientId, platformName, transaction, error);
    });

    await Promise.all(
      invalidTransactions.map(({ transaction, error }) =>
        this.auditService.logValidationFailure(clientId, platformName, transaction, error)
      )
    );

    const saveErrorResult = await this.persistenceService.saveTransactionsBulk(redTabTransactions);

    if (!saveErrorResult.ok) {
      const persistenceFailures = await this.handlePersistenceFailure(
        redTabTransactions, saveErrorResult.error, clientId, platformName, 'error'
      );
      return { saved: 0, redTabMarked: 0, duplicatesFound: 0, failures: persistenceFailures };
    }

    const validationFailures = invalidTransactions.map(({ transaction, error }) => ({
      transactionId: transaction.id,
      reason: 'VALIDATION_FAILURE' as const,
      details: error.message,
    }));

    return { saved: 0, redTabMarked: saveErrorResult.value.length, duplicatesFound: 0, failures: validationFailures };
  }

  private async processValidTransactions(
    validTransactions: ITransaction[],
    clientId: string,
    platformName: string
  ): Promise<BatchProcessingResult> {
    if (validTransactions.length === 0) {
      return { saved: 0, redTabMarked: 0, duplicatesFound: 0, failures: [] };
    }

    const savedResult = await this.persistenceService.saveTransactionsBulk(validTransactions);

    if (!savedResult.ok) {
      const persistenceFailures = await this.handlePersistenceFailure(
        validTransactions, savedResult.error, clientId, platformName,
        validTransactions[0]?.status || 'pending'
      );
      return { saved: 0, redTabMarked: 0, duplicatesFound: 0, failures: persistenceFailures };
    }

    return { saved: savedResult.value.length, redTabMarked: 0, duplicatesFound: 0, failures: [] };
  }

  private async handlePersistenceFailure(
    transactions: ITransaction[],
    error: RepositoryError,
    clientId: string,
    platformName: string,
    statusAttempted: string
  ): Promise<IngestionRecordFailure[]> {
    await Promise.all(
      transactions.map((transaction) =>
        this.auditService.logPersistenceFailure(clientId, platformName, transaction, error, statusAttempted)
      )
    );

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
