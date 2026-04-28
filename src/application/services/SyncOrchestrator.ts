import type { IAuditLogger } from '../../domain/ports/IAuditLogger';
import type { IDistributedLockService } from '../../domain/ports/IDistributedLockService';
import type { IIngestionJobQueue } from '../../domain/ports/IIngestionJobQueue';
import type { IPlatformConnectionRepository } from '../../domain/ports/IPlatformConnectionRepository';
import { failure, success, type Result } from '../../domain/shared/Result';

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

export class SyncOrchestrator {
  constructor(
    private readonly platformConnectionRepository: IPlatformConnectionRepository,
    private readonly ingestionQueue: IIngestionJobQueue,
    private readonly auditLogger: IAuditLogger,
    private readonly lockService: IDistributedLockService,
    private readonly logger: ISyncLogger
  ) {}

  async run(clientId: string): Promise<Result<FullClientSyncReport, SyncOrchestratorError>> {
    const lockResult = await this.lockService.withLock('nightly-sync-lock', 120_000, async () => {
      const startedAt = new Date().toISOString();
      await this.auditLogger.log(clientId, 'FULL_CLIENT_SYNC', 'success', {
        phase: 'start',
        startedAt,
        lockName: 'nightly-sync-lock',
      });

      const activeConnectionsResult = await this.platformConnectionRepository.findActiveByClientId(clientId);

      if (!activeConnectionsResult.ok) {
        await this.auditLogger.log(clientId, 'FULL_CLIENT_SYNC', 'failure', {
          phase: 'end',
          startedAt,
          endedAt: new Date().toISOString(),
          errorCode: activeConnectionsResult.error.code,
          errorMessage: activeConnectionsResult.error.message,
        });

        throw new Error(`PLATFORM_LOOKUP_FAILED:${activeConnectionsResult.error.message}`);
      }

      const failures: Array<{ platformName: string; reason: string }> = [];
      let dispatchedJobs = 0;

      for (const connection of activeConnectionsResult.value) {
        const dispatchResult = await this.ingestionQueue.enqueue({
          clientId,
          platformName: connection.platform,
        });

        if (!dispatchResult.ok) {
          failures.push({
            platformName: connection.platform,
            reason: dispatchResult.error.message,
          });

          this.logger.warn('Platform sync job dispatch failed, continuing with remaining platforms.', {
            clientId,
            platformName: connection.platform,
            error: dispatchResult.error,
          });

          continue;
        }

        dispatchedJobs += 1;
      }

      const report: FullClientSyncReport = {
        clientId,
        totalPlatforms: activeConnectionsResult.value.length,
        dispatchedJobs,
        failedDispatches: failures.length,
        failures,
      };

      await this.auditLogger.log(clientId, 'FULL_CLIENT_SYNC', failures.length > 0 ? 'failure' : 'success', {
        phase: 'end',
        startedAt,
        endedAt: new Date().toISOString(),
        report,
      });

      return report;
    });

    if (!lockResult.ok) {
      if (lockResult.error.code === 'LOCK_NOT_ACQUIRED') {
        return failure({
          code: 'LOCK_NOT_ACQUIRED',
          message: lockResult.error.message,
          retryable: true,
        });
      }

      const rawMessage = lockResult.error.message;
      if (rawMessage.startsWith('PLATFORM_LOOKUP_FAILED:')) {
        return failure({
          code: 'PLATFORM_LOOKUP_FAILED',
          message: rawMessage.replace('PLATFORM_LOOKUP_FAILED:', ''),
          retryable: true,
        });
      }

      return failure({
        code: 'UNEXPECTED',
        message: lockResult.error.message,
        retryable: true,
      });
    }

    return success(lockResult.value);
  }
}
