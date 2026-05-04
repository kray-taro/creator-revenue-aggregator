export type PlatformName =
  | 'youtube'
  | 'patreon'
  | 'gumroad'
  | 'substack'
  | 'shopify'
  | 'stripe';

export type SourceHierarchy = 'primary' | 'processor';

export type TransactionStatus =
  | 'pending_review'
  | 'approved'
  | 'synced'
  | 'voided'
  | 'rejected'
  | 'error';

export type QbSyncStatus = 'pending' | 'synced' | 'failed' | 'voided';

export type ReviewTab = 'green' | 'yellow' | 'red';

export type YellowFlagType =
  | 'first_time_source'
  | 'potential_duplicate'
  | 'amount_variance'
  | 'category_uncertainty';

export type RedFlagType =
  | 'oauth_expiring'
  | 'oauth_expired'
  | 'api_failure'
  | 'validation_error'
  | 'sync_failed'
  | 'void_detected';

export interface Transaction {
  id: string;
  clientId: string;
  platform: PlatformName;
  platformTransactionId: string;
  platformId?: string;
  transactionDate: string;
  createdAt: string;
  updatedAt: string;
  grossRevenue: number;
  platformFee: number;
  netPayout: number;
  description?: string;
  deduplicationHash?: string;
  sourceHierarchy?: SourceHierarchy;
  suggestedCategory?: string;
  confidenceScore?: number;
  confidenceReasons?: ConfidenceReason[];
  status: TransactionStatus;
  qbAccountId?: string;
  qbAccountName?: string;
  qbEntryId?: string;
  qbSyncStatus?: QbSyncStatus;
  syncedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  receiptSnapshotUrl?: string;
  yellowFlag?: YellowFlagType;
  redFlag?: RedFlagType;
  duplicateOf?: string;
  duplicatePeer?: Transaction;
  note?: string;
}

export interface ConfidenceReason {
  label: string;
  description: string;
  score: number;
}

export interface TransactionGroup {
  category: string;
  platform: PlatformName;
  transactions: Transaction[];
  totalGross: number;
  totalFees: number;
  totalNet: number;
  avgConfidence: number;
  confidenceReasons?: ConfidenceReason[];
}

export interface ReviewQueueCounts {
  green: number;
  yellow: number;
  red: number;
  total: number;
}

export interface ReviewAction {
  transactionId: string;
  action: 'approve' | 'reject' | 'edit' | 'map_account' | 'resolve_duplicate' | 'override_validation';
  qbAccountId?: string;
  duplicateResolution?: 'keep_primary' | 'keep_processor' | 'keep_both';
  note?: string;
  amount?: number;
}

export interface BulkApproveJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  errors?: { transactionId: string; message: string }[];
  startedAt?: string;
  completedAt?: string;
}
