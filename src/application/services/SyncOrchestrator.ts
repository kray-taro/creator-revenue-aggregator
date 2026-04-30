import { failure, success, type Result } from '@domain/shared';
import type {
  IAuditLogger,
  IDistributedLockService,
  IIngestionJobQueue,
  IPlatformConnectionRepository,
  ITransactionRepository,
  IQuickBooksAdapter,
  PlatformConnection,
} from '@domain/ports';
import { OrchestratorErrorHandler } from './OrchestratorErrorHandler';

export interface ISyncLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface FullClientSyncReport {
  readonly clientId: string;
  readonly totalPlatforms: number;
  readonly dispatchedJobs: number;
  readonly failedDispatches: number;
  readonly failures: ReadonlyArray<{ platformName: string; reason: string }>;
}

export interface QBSyncReport {
  readonly clientId: string;
  readonly attempted: number;
  readonly synced: number;
  readonly failed: number;
  readonly failedIds: ReadonlyArray<string>;
}

export interface SyncOrchestratorError {
  readonly code: 'LOCK_NOT_ACQUIRED' | 'PLATFORM_LOOKUP_FAILED' | 'UNEXPECTED';
  readonly message: string;
  readonly retryable: boolean;
}

class PlatformLookupError extends Error {
  constructor(
    message: string,
    public readonly originalError: { code: string; message: string }
  ) {
    super(message);
    this.name = 'PlatformLookupError';
  }
}

export class SyncOrchestrator {
  private readonly errorHandler: OrchestratorErrorHandler;

  constructor(
    private readonly platformConnectionRepository: IPlatformConnectionRepository,
    private readonly ingestionQueue: IIngestionJobQueue,
    private readonly auditLogger: IAuditLogger,
    private readonly lockService: IDistributedLockService,
    private readonly logger: ISyncLogger,
    private readonly config: { syncLockTtlMs: number },
    private readonly transactionRepository: ITransactionRepository | null = null,
    private readonly quickBooksAdapter: IQuickBooksAdapter | null = null,
    private readonly qbRealmId: string | null = null
  ) {
    this.errorHandler = new OrchestratorErrorHandler(auditLogger);
  }

  /**
   * Dispatches ingestion jobs for all active platform connections for a client.
   * Uses a distributed lock to prevent concurrent syncs for the same client.
   */
  async run(clientId: string): Promise<Result<FullClientSyncReport, SyncOrchestratorError>> {
    const lockName = `nightly-sync-lock:${clientId}`;
    const lockResult = await this.lockService.withLock(lockName, this.config.syncLockTtlMs, async () => {
      const startedAt = new Date().toISOString();
      return await this.executeSyncOperation(clientId, startedAt, lockName);
    });

    if (!lockResult.ok) {
      return this.errorHandler.handleLockError<SyncOrchestratorError>(lockResult.error);
    }

    return success(lockResult.value);
  }

  /**
   * Syncs all approved, unsynced transactions for a client to QuickBooks.
   *
   * Idempotent: transactions that already have a qbEntryId are skipped.
   * Append-only: journal entries are never updated — only created.
   * Read-back verification: each created entry is verified via PrivateNote.
   */
  async syncApprovedTransactions(
    clientId: string
  ): Promise<Result<QBSyncReport, SyncOrchestratorError>> {
    if (!this.transactionRepository || !this.quickBooksAdapter || !this.qbRealmId) {
      return failure({
        code: 'UNEXPECTED',
        message: 'QuickBooks sync not configured: transactionRepository, quickBooksAdapter, and qbRealmId are required.',
        retryable: false,
      });
    }

    const pendingResult = await this.transactionRepository.findApprovedUnsyncedByClientId(clientId);
    if (!pendingResult.ok) {
      return failure({
        code: 'PLATFORM_LOOKUP_FAILED',
        message: pendingResult.error.message,
        retryable: pendingResult.error.retryable,
      });
    }

    const transactions = pendingResult.value;
    const failedIds: string[] = [];
    let synced = 0;

    this.logger.info('Starting QB sync', { clientId, transactionCount: transactions.length });

    for (const txn of transactions) {
      if (txn.qbEntryId) continue;

      const grossLine = { accountId: 'revenue-account', amount: txn.grossRevenue, postingType: 'Credit' as const, description: txn.description };
      const feeDebitLine = { accountId: 'platform-fees-account', amount: txn.platformFee, postingType: 'Debit' as const };
      const bankDebitLine = { accountId: 'bank-account', amount: txn.netPayout, postingType: 'Debit' as const };

      const entryInput = {
        externalId: txn.id,
        txnDate: txn.transactionDate,
        lines: [grossLine, feeDebitLine, bankDebitLine],
        privateNote: `platform:${txn.platform} | platformTxnId:${txn.platformTransactionId}`,
      };

      const createResult = await this.quickBooksAdapter.createJournalEntry(entryInput, this.qbRealmId);

      if (!createResult.ok) {
        this.logger.error('QB journal entry creation failed', {
          clientId,
          transactionId: txn.id,
          error: createResult.error,
        });
        failedIds.push(txn.id);
        continue;
      }

      const { qbEntryId, syncedAt } = createResult.value;
      const updateResult = await this.transactionRepository.updateSyncStatus(txn.id, qbEntryId, 'synced', syncedAt);

      if (!updateResult.ok) {
        this.logger.error('Failed to persist QB sync status', {
          clientId,
          transactionId: txn.id,
          qbEntryId,
          error: updateResult.error,
        });
        failedIds.push(txn.id);
        continue;
      }

      synced++;
      this.logger.info('Transaction synced to QB', { clientId, transactionId: txn.id, qbEntryId });
    }

    await this.auditLogger.log(clientId, 'QB_SYNC', failedIds.length > 0 ? 'failure' : 'success', {
      attempted: transactions.length,
      synced,
      failed: failedIds.length,
      failedIds,
    });

    return success({
      clientId,
      attempted: transactions.length,
      synced,
      failed: failedIds.length,
      failedIds,
    });
  }

  private async executeSyncOperation(
    clientId: string,
    startedAt: string,
    lockName: string
  ): Promise<FullClientSyncReport> {
    await this.logSyncPhase(clientId, 'start', 'success', { startedAt, lockName });

    const activeConnectionsResult = await this.platformConnectionRepository.findActiveByClientId(clientId);

    if (!activeConnectionsResult.ok) {
      await this.errorHandler.logErrorPhase(clientId, 'FULL_CLIENT_SYNC', {
        errorCode: activeConnectionsResult.error.code,
        errorMessage: activeConnectionsResult.error.message,
        startedAt,
        additionalContext: { lockName },
      });
      throw new PlatformLookupError(activeConnectionsResult.error.message, activeConnectionsResult.error);
    }

    const { failures, dispatchedJobs } = await this.dispatchPlatformJobs(clientId, activeConnectionsResult.value);

    const report: FullClientSyncReport = {
      clientId,
      totalPlatforms: activeConnectionsResult.value.length,
      dispatchedJobs,
      failedDispatches: failures.length,
      failures,
    };

    const endedAt = new Date().toISOString();
    await this.logSyncPhase(clientId, 'end', failures.length > 0 ? 'failure' : 'success', { startedAt, endedAt, report });

    return report;
  }

  private async dispatchPlatformJobs(
    clientId: string,
    connections: PlatformConnection[]
  ): Promise<{ failures: Array<{ platformName: string; reason: string }>; dispatchedJobs: number }> {
    const today = new Date();
    const isFirstOfMonth = today.getDate() === 1;
    const fromDate = isFirstOfMonth
      ? new Date(today.getFullYear(), today.getMonth() - 1, 1)
      : new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const fromDateStr = fromDate.toISOString().slice(0, 10);
    const toDateStr = today.toISOString().slice(0, 10);

    const dispatchResults = await Promise.allSettled(
      connections.map(connection => {
        const jobId = `${clientId}:${connection.platform}:${fromDateStr}:${toDateStr}`;
        return this.ingestionQueue.enqueue({ clientId, platformName: connection.platform, fromDate: fromDateStr, toDate: toDateStr, jobId });
      })
    );

    const failures: Array<{ platformName: string; reason: string }> = [];
    let dispatchedJobs = 0;

    dispatchResults.forEach((result, index) => {
      const connection = connections[index];
      if (result.status === 'rejected') {
        const reason = result.reason?.message || String(result.reason);
        failures.push({ platformName: connection.platform, reason });
        this.logger.warn('Platform sync job dispatch failed.', { clientId, platformName: connection.platform, error: result.reason });
      } else if (!result.value.ok) {
        if (result.value.error.code !== 'DUPLICATE_JOB') {
          failures.push({ platformName: connection.platform, reason: result.value.error.message });
          this.logger.warn('Platform sync job dispatch failed.', { clientId, platformName: connection.platform, error: result.value.error });
        } else {
          dispatchedJobs += 1;
        }
      } else {
        dispatchedJobs += 1;
      }
    });

    return { failures, dispatchedJobs };
  }

  private async logSyncPhase(
    clientId: string,
    phase: 'start' | 'end',
    status: 'success' | 'failure',
    details: { startedAt: string; endedAt?: string; lockName?: string; report?: FullClientSyncReport }
  ): Promise<void> {
    await this.auditLogger.log(clientId, 'FULL_CLIENT_SYNC', status, { phase, ...details });
  }
}
