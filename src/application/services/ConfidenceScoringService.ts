import { failure, success } from '@domain/shared';
import type { Result } from '@domain/shared';
import type {
  IConfidenceScoringService,
  ConfidenceScoringResult,
  BatchConfidenceScoringResult,
  ConfidenceScoringError,
  ConfidenceCategory,
  ConfidenceReason,
} from '@domain/ports';
import type { ITransaction, PlatformName } from '@domain/entities';

const PRIMARY_PLATFORMS: ReadonlySet<PlatformName> = new Set([
  'youtube', 'patreon', 'gumroad', 'substack', 'shopify',
]);

const PAYOUT_DAY_BY_PLATFORM: Partial<Record<PlatformName, number>> = {
  youtube: 21,
  patreon: 5,
  stripe: 2,
};

const KNOWN_KEYWORDS = ['adsense', 'pledge', 'sale', 'subscription', 'payout', 'revenue', 'charge', 'payment'];

const PLATFORM_FEE_RANGES: Partial<Record<PlatformName, { min: number; max: number }>> = {
  youtube: { min: 0.44, max: 0.46 },
  patreon: { min: 0.05, max: 0.15 },
  gumroad: { min: 0.05, max: 0.15 },
  stripe: { min: 0.01, max: 0.05 },
};

const GREEN_THRESHOLD = 80;
const YELLOW_THRESHOLD = 50;

/**
 * Confidence Scoring Service — Sprint 3 rule-based implementation of US-301.
 *
 * Scoring starts at base 70 and applies additive/subtractive factors.
 * Final score maps to GREEN (≥80) / YELLOW (50–79) / RED (<50) categories,
 * which determine the review tab a transaction appears in.
 *
 * All factors are documented as ConfidenceReason entries for audit trails.
 */
export class ConfidenceScoringService implements IConfidenceScoringService {
  async scoreTransaction(
    transaction: ITransaction,
    _clientId: string
  ): Promise<Result<ConfidenceScoringResult, ConfidenceScoringError>> {
    try {
      const result = this.computeScore(transaction);
      return success(result);
    } catch (err) {
      return failure({
        code: 'SCORING_FAILED',
        message: err instanceof Error ? err.message : 'Unknown scoring error.',
        retryable: false,
      });
    }
  }

  async scoreBatch(
    transactions: ReadonlyArray<ITransaction>,
    clientId: string
  ): Promise<Result<BatchConfidenceScoringResult, ConfidenceScoringError>> {
    const results: ConfidenceScoringResult[] = [];
    let greenCount = 0, yellowCount = 0, redCount = 0;

    for (const txn of transactions) {
      const r = await this.scoreTransaction(txn, clientId);
      if (!r.ok) return failure(r.error);
      results.push(r.value);
      if (r.value.category === 'GREEN') greenCount++;
      else if (r.value.category === 'YELLOW') yellowCount++;
      else redCount++;
    }

    return success({ results, totalScored: results.length, greenCount, yellowCount, redCount });
  }

  categorizeScore(score: number): ConfidenceCategory {
    if (score >= GREEN_THRESHOLD) return 'GREEN';
    if (score >= YELLOW_THRESHOLD) return 'YELLOW';
    return 'RED';
  }

  private computeScore(txn: ITransaction): ConfidenceScoringResult {
    const reasons: ConfidenceReason[] = [];
    let score = 70;

    reasons.push({ factor: 'base_score', impact: 70, description: 'All transactions start at 70.' });

    if (PRIMARY_PLATFORMS.has(txn.platform)) {
      score += 10;
      reasons.push({ factor: 'primary_source', impact: 10, description: `${txn.platform} is a primary revenue source.` });
    }

    const payoutDay = PAYOUT_DAY_BY_PLATFORM[txn.platform];
    if (payoutDay !== undefined) {
      const txnDay = new Date(txn.transactionDate).getUTCDate();
      if (Math.abs(txnDay - payoutDay) <= 3) {
        score += 10;
        reasons.push({ factor: 'payout_calendar_match', impact: 10, description: `Transaction date aligns with ${txn.platform} typical payout day (±3 days of day ${payoutDay}).` });
      }
    }

    if (txn.description) {
      const desc = txn.description.toLowerCase();
      const hasKeyword = KNOWN_KEYWORDS.some(kw => desc.includes(kw));
      if (hasKeyword) {
        score += 5;
        reasons.push({ factor: 'known_keywords', impact: 5, description: 'Description contains a known revenue keyword.' });
      }
    }

    if (txn.description && txn.platformId) {
      score += 5;
      reasons.push({ factor: 'complete_metadata', impact: 5, description: 'All optional metadata fields present.' });
    }

    if (!txn.deduplicationHash) {
      score += 5;
      reasons.push({ factor: 'dedup_clean', impact: 5, description: 'Transaction has not been flagged as a potential duplicate.' });
    }

    if (txn.deduplicationHash) {
      score -= 20;
      reasons.push({ factor: 'potential_duplicate', impact: -20, description: 'Flagged as a potential duplicate by deduplication service.' });
    }

    const feeRange = PLATFORM_FEE_RANGES[txn.platform];
    if (feeRange && txn.grossRevenue > 0) {
      const feeRatio = txn.platformFee / txn.grossRevenue;
      if (feeRatio < feeRange.min || feeRatio > feeRange.max) {
        score -= 30;
        reasons.push({
          factor: 'fee_ratio_out_of_range',
          impact: -30,
          description: `${txn.platform} fee ratio ${(feeRatio * 100).toFixed(1)}% is outside expected range ${(feeRange.min * 100).toFixed(0)}–${(feeRange.max * 100).toFixed(0)}%.`,
        });
      }
    }

    if (!txn.description) {
      score -= 10;
      reasons.push({ factor: 'missing_description', impact: -10, description: 'No description provided.' });
    }

    score = Math.max(0, Math.min(100, score));
    const category = this.categorizeScore(score);
    const suggestedAction =
      category === 'GREEN' ? 'AUTO_APPROVE' :
      category === 'YELLOW' ? 'MANUAL_REVIEW' :
      'FLAG_FOR_INVESTIGATION';

    return { transaction: txn, score, category, reasons, suggestedAction };
  }
}
