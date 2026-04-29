import type { Result } from '../shared/Result';
import type { ITransaction } from '../entities/ITransaction';

/**
 * Confidence Score Categories
 * Determines which review tab a transaction appears in
 */
export type ConfidenceCategory = 'GREEN' | 'YELLOW' | 'RED';

/**
 * Confidence Reason
 * Explains why a transaction received its confidence score
 */
export interface ConfidenceReason {
  readonly factor: string;      // e.g., "complete_metadata", "missing_description"
  readonly impact: number;      // Points added/subtracted (-100 to +100)
  readonly description: string; // Human-readable explanation
}

/**
 * Confidence Scoring Result
 */
export interface ConfidenceScoringResult {
  readonly transaction: ITransaction;
  readonly score: number;              // 0-100 confidence score
  readonly category: ConfidenceCategory; // GREEN (>90), YELLOW (70-90), RED (<70)
  readonly reasons: ReadonlyArray<ConfidenceReason>;
  readonly suggestedAction: 'AUTO_APPROVE' | 'MANUAL_REVIEW' | 'FLAG_FOR_INVESTIGATION';
}

/**
 * Batch Confidence Scoring Result
 */
export interface BatchConfidenceScoringResult {
  readonly results: ReadonlyArray<ConfidenceScoringResult>;
  readonly totalScored: number;
  readonly greenCount: number;
  readonly yellowCount: number;
  readonly redCount: number;
}

export interface ConfidenceScoringError {
  readonly code: 'SCORING_FAILED' | 'INVALID_TRANSACTION' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Confidence Scoring Service Interface
 * 
 * Purpose: Assign confidence scores to transactions for automated categorization:
 * - GREEN (>90%): High confidence, bulk approve eligible
 * - YELLOW (70-90%): Medium confidence, manual review recommended
 * - RED (<70%): Low confidence, requires investigation
 * 
 * Scoring Factors (US-301):
 * - Complete metadata (+20): All required fields present
 * - Platform verification (+15): Transaction ID verified with platform
 * - Amount validation (+15): Amount matches expected range for platform
 * - Description quality (+10): Meaningful description present
 * - Historical pattern (+10): Matches client's typical transactions
 * - Date reasonableness (+10): Date within expected range
 * - No duplicates (+10): Not flagged as potential duplicate
 * - Category mapping (+10): Successfully mapped to chart of accounts
 * 
 * Penalties:
 * - Missing description (-20)
 * - Amount outlier (-15): Significantly different from typical
 * - Date anomaly (-15): Future date or very old
 * - Potential duplicate (-30): Flagged by deduplication service
 * - Failed validation (-50): Domain validation errors
 * 
 * Implementation Notes:
 * - Sprint 7 deliverable (US-301: Confidence Scoring for Green Tab)
 * - Should be extensible for ML-based scoring in future sprints
 * - Should cache scoring rules for performance
 * - Should log scoring decisions for audit trail
 * - Should support custom scoring rules per client
 * 
 * @see docs/SPRINT_1_CODE_REVIEW.md P1-9
 * @see docs/PRODUCT REQUIREMENTS DOCUMENT (PRD).md US-301
 */
export interface IConfidenceScoringService {
  /**
   * Scores a single transaction for confidence
   * 
   * @param transaction - Transaction to score
   * @param clientId - Client ID for client-specific scoring rules
   * @returns Result with confidence scoring result or error
   */
  scoreTransaction(
    transaction: ITransaction,
    clientId: string
  ): Promise<Result<ConfidenceScoringResult, ConfidenceScoringError>>;

  /**
   * Scores a batch of transactions for confidence
   * Optimized for bulk operations
   * 
   * @param transactions - Transactions to score
   * @param clientId - Client ID for client-specific scoring rules
   * @returns Result with batch confidence scoring results or error
   */
  scoreBatch(
    transactions: ReadonlyArray<ITransaction>,
    clientId: string
  ): Promise<Result<BatchConfidenceScoringResult, ConfidenceScoringError>>;

  /**
   * Determines confidence category from score
   * 
   * @param score - Confidence score (0-100)
   * @returns Confidence category (GREEN/YELLOW/RED)
   */
  categorizeScore(score: number): ConfidenceCategory;
}