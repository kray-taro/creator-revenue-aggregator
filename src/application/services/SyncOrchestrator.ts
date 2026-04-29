import { success, type Result } from '@domain/shared';
import type {
  IAuditLogger,
  IDistributedLockService,
  IIngestionJobQueue,
  IPlatformConnectionRepository,
  PlatformConnection
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

export interface SyncOrchestratorError {
  readonly code: 'LOCK_NOT_ACQUIRED' | 'PLATFORM_LOOKUP_FAILED' | 'UNEXPECTED';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Custom error class for platform lookup failures.
 * Provides type-safe error handling instead of string-based error signaling.
 */
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
    private readonly config: { syncLockTtlMs: number }
  ) {
    this.errorHandler = new OrchestratorErrorHandler(auditLogger);
  }

  async run(clientId: string): Promise<Result<FullClientSyncReport, SyncOrchestratorError>> {
    /**
     * Distributed Lock Strategy for Nightly Sync Operations
     *
     * Lock Naming Convention:
     * - Format: `nightly-sync-lock:${clientId}`
     * - Prefix 'nightly-sync-lock' identifies this as a scheduled sync operation lock
     * - Suffix '${clientId}' ensures per-client isolation (prevents concurrent syncs for same client)
     * - This allows multiple clients to sync in parallel while preventing race conditions per client
     *
     * TTL (Time-To-Live) Rationale:
     * - Set to 120,000ms (2 minutes)
     * - Chosen based on expected sync duration: fetching connections + dispatching jobs typically < 30s
     * - 4x buffer provides safety margin for network latency, database queries, and job queue operations
     * - Prevents indefinite locks if process crashes or network partitions occur
     *
     * Lock Cleanup Strategy:
     * - Automatic: Lock expires after TTL if not explicitly released
     * - Explicit: Lock released automatically when withLock callback completes (success or failure)
     * - Redlock algorithm ensures lock is released across all Redis nodes
     *
     * Lock Timeout Behavior:
     * - If operation exceeds 120s, lock auto-expires and another sync can start
     * - Original operation continues but loses exclusivity guarantee
     * - Audit logs track overlapping syncs via startedAt/endedAt timestamps
     * - Consider increasing TTL if legitimate operations consistently exceed 2 minutes
     */
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
   * Executes the core sync operation: fetching connections, dispatching jobs, and logging results.
   */
  private async executeSyncOperation(
    clientId: string,
    startedAt: string,
    lockName: string
  ): Promise<FullClientSyncReport> {
    await this.logSyncPhase(clientId, 'start', 'success', {
      startedAt,
      lockName,
    });

    const activeConnectionsResult = await this.platformConnectionRepository.findActiveByClientId(clientId);

    if (!activeConnectionsResult.ok) {
      await this.errorHandler.logErrorPhase(clientId, 'FULL_CLIENT_SYNC', {
        errorCode: activeConnectionsResult.error.code,
        errorMessage: activeConnectionsResult.error.message,
        startedAt,
        additionalContext: { lockName },
      });

      throw new PlatformLookupError(
        activeConnectionsResult.error.message,
        activeConnectionsResult.error
      );
    }

    const { failures, dispatchedJobs } = await this.dispatchPlatformJobs(
      clientId,
      activeConnectionsResult.value
    );

    const report: FullClientSyncReport = {
      clientId,
      totalPlatforms: activeConnectionsResult.value.length,
      dispatchedJobs,
      failedDispatches: failures.length,
      failures,
    };

    const endedAt = new Date().toISOString();
    await this.logSyncPhase(
      clientId,
      'end',
      failures.length > 0 ? 'failure' : 'success',
      {
        startedAt,
        endedAt,
        report,
      }
    );

    return report;
  }

  /**
   * Dispatches ingestion jobs for all platform connections in parallel.
   * Uses Promise.allSettled to ensure all dispatches are attempted even if some fail.
   *
   * Implements idempotency via jobId to prevent duplicate job execution.
   */
  private async dispatchPlatformJobs(
    clientId: string,
    connections: PlatformConnection[]
  ): Promise<{
    failures: Array<{ platformName: string; reason: string }>;
    dispatchedJobs: number;
  }> {
    // Calculate date range per PRD US-102 (same logic as IngestionOrchestrator)
    const today = new Date();
    const isFirstOfMonth = today.getDate() === 1;
    
    const fromDate = isFirstOfMonth
      ? new Date(today.getFullYear(), today.getMonth() - 1, 1) // Prior month start
      : new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);   // Last 7 days
    
    const toDate = today;
    const fromDateStr = fromDate.toISOString().slice(0, 10);
    const toDateStr = toDate.toISOString().slice(0, 10);

    const dispatchResults = await Promise.allSettled(
      connections.map(connection => {
        // Generate idempotency key: clientId:platform:dateRange
        // This prevents duplicate jobs for same client/platform/date range
        const jobId = `${clientId}:${connection.platform}:${fromDateStr}:${toDateStr}`;
        
        return this.ingestionQueue.enqueue({
          clientId,
          platformName: connection.platform,
          fromDate: fromDateStr,
          toDate: toDateStr,
          jobId,
        });
      })
    );

    const failures: Array<{ platformName: string; reason: string }> = [];
    let dispatchedJobs = 0;

    dispatchResults.forEach((result, index) => {
      const connection = connections[index];

      if (result.status === 'rejected') {
        const reason = result.reason?.message || String(result.reason);
        failures.push({
          platformName: connection.platform,
          reason,
        });

        this.logger.warn('Platform sync job dispatch failed, continuing with remaining platforms.', {
          clientId,
          platformName: connection.platform,
          error: result.reason,
        });
      } else if (!result.value.ok) {
        // Skip logging for DUPLICATE_JOB errors (expected behavior)
        if (result.value.error.code !== 'DUPLICATE_JOB') {
          failures.push({
            platformName: connection.platform,
            reason: result.value.error.message,
          });

          this.logger.warn('Platform sync job dispatch failed, continuing with remaining platforms.', {
            clientId,
            platformName: connection.platform,
            error: result.value.error,
          });
        } else {
          // Duplicate job is not a failure - job already queued
          dispatchedJobs += 1;
        }
      } else {
        dispatchedJobs += 1;
      }
    });

    return { failures, dispatchedJobs };
  }

  /**
   * Centralized audit logging helper to eliminate code duplication.
   */
  private async logSyncPhase(
    clientId: string,
    phase: 'start' | 'end',
    status: 'success' | 'failure',
    details: {
      startedAt: string;
      endedAt?: string;
      lockName?: string;
      report?: FullClientSyncReport;
      errorCode?: string;
      errorMessage?: string;
    }
  ): Promise<void> {
    await this.auditLogger.log(clientId, 'FULL_CLIENT_SYNC', status, {
      phase,
      ...details,
    });
  }

}
