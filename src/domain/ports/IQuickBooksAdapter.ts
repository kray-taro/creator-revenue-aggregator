import type { Result } from '../shared/Result';

export interface QBJournalEntryLine {
  readonly accountId: string;
  readonly amount: number;
  readonly postingType: 'Debit' | 'Credit';
  readonly description?: string;
}

export interface QBJournalEntryInput {
  readonly externalId: string;
  readonly txnDate: string;
  readonly lines: ReadonlyArray<QBJournalEntryLine>;
  readonly privateNote?: string;
  readonly currencyRef?: string;
}

export interface QBJournalEntryResult {
  readonly qbEntryId: string;
  readonly externalId: string;
  readonly syncedAt: string;
}

export interface QBSyncError {
  readonly code:
    | 'UNAUTHORIZED'
    | 'TOKEN_EXPIRED'
    | 'RATE_LIMITED'
    | 'INVALID_ENTRY'
    | 'DUPLICATE_ENTRY'
    | 'NETWORK_ERROR'
    | 'VERIFICATION_FAILED'
    | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
}

/**
 * Port for QuickBooks Online sync operations.
 * Separate from IPlatformAdapter — QB is a sync target, not an ingestion source.
 *
 * JournalEntry append-only pattern:
 * - Create: POST /v3/company/{realmId}/journalentry
 * - Verify: GET entry and confirm PrivateNote contains external_id
 * - Never update or delete — append-only for audit integrity.
 */
export interface IQuickBooksAdapter {
  createJournalEntry(
    entry: QBJournalEntryInput,
    realmId: string
  ): Promise<Result<QBJournalEntryResult, QBSyncError>>;

  batchCreateJournalEntries(
    entries: ReadonlyArray<QBJournalEntryInput>,
    realmId: string
  ): Promise<Result<QBJournalEntryResult[], QBSyncError>>;

  verifyEntry(
    qbEntryId: string,
    externalId: string,
    realmId: string
  ): Promise<Result<boolean, QBSyncError>>;
}
