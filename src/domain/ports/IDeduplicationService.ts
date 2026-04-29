import type { Result } from '../shared/Result';
import type { ITransaction } from '../entities/ITransaction';

/**
 * Deduplication Result for a single transaction
 */
export interface DeduplicationResult {
  readonly transaction: ITransaction;
  readonly isDuplicate: boolean;
  readonly duplicateOf?: string; // Transaction ID of the original if duplicate
  readonly fingerprint: string;  // SHA-256 hash used for matching
  readonly matchReason?: string; // Explanation of why it's a duplicate
}

/**
 * Batch Deduplication Result
 */
export interface BatchDeduplicationResult {
  readonly results: ReadonlyArray<DeduplicationResult>;
  readonly totalChecked: number;
  readonly duplicatesFound: number;
}

export interface DeduplicationError {
  readonly code: 'FINGERPRINT_GENERATION_FAILED' | 'LOOKUP_FAILED' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Deduplication Service Interface
 * 
 * Purpose: Detect and flag duplicate transactions across platforms using:
 * - SHA-256 fingerprinting of transaction attributes
 * - Source hierarchy logic (primary source vs payment processor)
 * - Fuzzy matching for amount/date variations
 * 
 * Business Rules (US-601):
 * - Primary sources (YouTube, Patreon, Gumroad) take precedence over processors (Stripe, PayPal)
 * - Duplicates are flagged for Yellow tab review, not auto-rejected
 * - Fingerprint includes: amount, date, description (normalized), client ID
 * - Amount tolerance: ±$0.01 for floating point variations
 * - Date tolerance: ±1 day for timezone/processing delays
 * 
 * Implementation Notes:
 * - Sprint 5 deliverable (US-601: Deduplication Intelligence)
 * - Should use Redis for fast fingerprint lookups
 * - Should store fingerprints in PostgreSQL for persistence
 * - Should implement source hierarchy: YouTube > Patreon > Gumroad > Stripe > PayPal
 * - Should normalize descriptions (lowercase, remove special chars) before hashing
 * 
 * @see docs/SPRINT_1_CODE_REVIEW.md P1-8
 * @see docs/PRODUCT REQUIREMENTS DOCUMENT (PRD).md US-601
 */
export interface IDeduplicationService {
  /**
   * Checks a single transaction for duplicates
   * 
   * @param transaction - Transaction to check
   * @param clientId - Client ID for scoping the duplicate check
   * @returns Result with deduplication result or error
   */
  checkTransaction(
    transaction: ITransaction,
    clientId: string
  ): Promise<Result<DeduplicationResult, DeduplicationError>>;

  /**
   * Checks a batch of transactions for duplicates
   * Optimized for bulk operations with single database query
   * 
   * @param transactions - Transactions to check
   * @param clientId - Client ID for scoping the duplicate check
   * @returns Result with batch deduplication results or error
   */
  checkBatch(
    transactions: ReadonlyArray<ITransaction>,
    clientId: string
  ): Promise<Result<BatchDeduplicationResult, DeduplicationError>>;

  /**
   * Generates SHA-256 fingerprint for a transaction
   * Used for duplicate detection and testing
   * 
   * @param transaction - Transaction to fingerprint
   * @returns Fingerprint hash string
   */
  generateFingerprint(transaction: ITransaction): string;
}

// Made with Bob
