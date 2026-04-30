import type { ITransaction, QbSyncStatus } from '../entities/ITransaction';
import type { Result } from '../shared/Result';

export interface RepositoryError {
  readonly code: 'NOT_FOUND' | 'CONFLICT' | 'DUPLICATE_TRANSACTION_IGNORED' | 'CRS_EQUATION_VIOLATION' | 'INVALID_INPUT' | 'DB_ERROR' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

export interface ITransactionRepository {
  save(transaction: ITransaction): Promise<Result<ITransaction, RepositoryError>>;
  saveBulk(transactions: ITransaction[]): Promise<Result<ITransaction[], RepositoryError>>;
  findById(id: string): Promise<Result<ITransaction, RepositoryError>>;
  findByClientId(clientId: string): Promise<Result<ITransaction[], RepositoryError>>;

  findByFingerprints(
    clientId: string,
    fingerprints: string[]
  ): Promise<Result<ITransaction[], RepositoryError>>;

  findApprovedUnsyncedByClientId(
    clientId: string
  ): Promise<Result<ITransaction[], RepositoryError>>;

  updateSyncStatus(
    id: string,
    qbEntryId: string,
    status: QbSyncStatus,
    syncedAt: string
  ): Promise<Result<ITransaction, RepositoryError>>;
}
