/**
 * Creator Revenue Standard (CRS) transaction contract.
 * Keeps core accounting fields normalized across platforms.
 */
export interface ITransaction {
  readonly id: string;
  readonly clientId: string;

  // Platform identity
  readonly platform: PlatformName;
  readonly platformTransactionId: string;
  readonly platformId?: string;

  // Dates
  readonly transactionDate: string; // ISO-8601 date (YYYY-MM-DD)
  readonly createdAt: string; // ISO-8601 datetime
  readonly updatedAt: string; // ISO-8601 datetime

  // CRS normalized values
  readonly grossRevenue: number;
  readonly platformFee: number;
  readonly netPayout: number;

  // Metadata and workflow
  readonly description?: string;
  readonly deduplicationHash?: string;
  readonly sourceHierarchy?: SourceHierarchy;
  readonly suggestedCategory?: string;
  readonly confidenceScore?: number;
  readonly status: TransactionStatus;

  // QuickBooks sync metadata
  readonly qbAccountId?: string;
  readonly qbEntryId?: string;
  readonly qbSyncStatus?: QbSyncStatus;
  readonly syncedAt?: string; // ISO-8601 datetime
  readonly reviewedBy?: string;
  readonly reviewedAt?: string; // ISO-8601 datetime

  // Receipt snapshot linkage
  readonly receiptSnapshotUrl?: string;
}

export type PlatformName =
  | 'youtube'
  | 'patreon'
  | 'gumroad'
  | 'substack'
  | 'shopify'
  | 'stripe'
  | 'quickbooks'
  | 'unknown';

export type SourceHierarchy = 'primary' | 'processor';

export type TransactionStatus =
  | 'pending_review'
  | 'approved'
  | 'synced'
  | 'voided'
  | 'rejected'
  | 'error';

export type QbSyncStatus =
  | 'pending'
  | 'synced'
  | 'failed'
  | 'voided';
