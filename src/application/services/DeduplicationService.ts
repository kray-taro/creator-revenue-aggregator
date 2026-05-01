import * as crypto from 'crypto';
import { failure, success } from '@domain/shared';
import type { Result } from '@domain/shared';
import type {
  IDeduplicationService,
  DeduplicationResult,
  BatchDeduplicationResult,
  DeduplicationError,
} from '@domain/ports';
import type { ITransactionRepository } from '@domain/ports';
import type { ITransaction, PlatformName } from '@domain/entities';

const SOURCE_HIERARCHY: Record<PlatformName, number> = {
  youtube: 1,
  patreon: 2,
  gumroad: 3,
  substack: 4,
  shopify: 5,
  stripe: 6,
  quickbooks: 7,
  unknown: 99,
};

/**
 * Deduplication Service — Sprint 3 implementation of IDeduplicationService (US-601).
 *
 * Strategy:
 * 1. Generate a SHA-256 fingerprint for each transaction from normalized attributes.
 * 2. Also generate 8 fuzzy variant fingerprints (±$0.01 amount × ±1 day date).
 * 3. Batch-query the DB for any existing transactions with matching fingerprints.
 * 4. When a match is found, apply source hierarchy — the lower-ranked (primary)
 *    source wins; the processor-source duplicate is flagged for Yellow tab review.
 * 5. Duplicates receive status 'pending_review' (not auto-rejected).
 */
export class DeduplicationService implements IDeduplicationService {
  private static readonly AMOUNT_TOLERANCE = 0.01;
  private static readonly DATE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

  constructor(private readonly transactionRepo: ITransactionRepository) {}

  generateFingerprint(transaction: ITransaction): string {
    const normalized = this.normalize(
      transaction.grossRevenue,
      transaction.transactionDate,
      transaction.description
    );
    const input = `${transaction.clientId}|${normalized.amount}|${normalized.date}|${normalized.description}`;
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  async checkTransaction(
    transaction: ITransaction,
    clientId: string
  ): Promise<Result<DeduplicationResult, DeduplicationError>> {
    const batchResult = await this.checkBatch([transaction], clientId);
    if (!batchResult.ok) return failure(batchResult.error);
    const result = batchResult.value.results[0];
    if (!result) {
      return failure({ code: 'LOOKUP_FAILED', message: 'No result returned for transaction.', retryable: false });
    }
    return success(result);
  }

  async checkBatch(
    transactions: ReadonlyArray<ITransaction>,
    clientId: string
  ): Promise<Result<BatchDeduplicationResult, DeduplicationError>> {
    if (transactions.length === 0) {
      return success({ results: [], totalChecked: 0, duplicatesFound: 0 });
    }

    const fingerprintMap = new Map<string, ITransaction>();
    const allFingerprints: string[] = [];

    for (const txn of transactions) {
      const variants = this.generateFuzzyFingerprints(txn);
      for (const fp of variants) {
        if (!fingerprintMap.has(fp)) {
          fingerprintMap.set(fp, txn);
          allFingerprints.push(fp);
        }
      }
    }

    let existingByFingerprint: Map<string, ITransaction>;
    try {
      const lookupResult = await this.transactionRepo.findByFingerprints(clientId, allFingerprints);
      if (!lookupResult.ok) {
        return failure({ code: 'LOOKUP_FAILED', message: lookupResult.error.message, retryable: lookupResult.error.retryable });
      }
      existingByFingerprint = new Map(
        lookupResult.value
          .filter(t => t.deduplicationHash)
          .map(t => [t.deduplicationHash as string, t])
      );
    } catch (err) {
      return failure({
        code: 'LOOKUP_FAILED',
        message: err instanceof Error ? err.message : 'Fingerprint lookup failed.',
        retryable: true,
      });
    }

    const results: DeduplicationResult[] = [];
    let duplicatesFound = 0;

    for (const txn of transactions) {
      let fingerprint: string;
      try {
        fingerprint = this.generateFingerprint(txn);
      } catch (err) {
        return failure({
          code: 'FINGERPRINT_GENERATION_FAILED',
          message: err instanceof Error ? err.message : 'Failed to generate fingerprint.',
          retryable: false,
        });
      }

      const variants = this.generateFuzzyFingerprints(txn);
      let matchedExisting: ITransaction | undefined;

      for (const variant of variants) {
        const existing = existingByFingerprint.get(variant);
        if (existing && existing.id !== txn.id) {
          matchedExisting = existing;
          break;
        }
      }

      if (matchedExisting) {
        const incomingRank = SOURCE_HIERARCHY[txn.platform] ?? 99;
        const existingRank = SOURCE_HIERARCHY[matchedExisting.platform] ?? 99;
        const isDuplicate = incomingRank >= existingRank;

        duplicatesFound++;
        results.push({
          transaction: txn,
          isDuplicate,
          duplicateOf: isDuplicate ? matchedExisting.id : undefined,
          fingerprint,
          matchReason: isDuplicate
            ? `Matches existing ${matchedExisting.platform} transaction (source hierarchy: ${existingRank} < ${incomingRank})`
            : `Incoming ${txn.platform} (rank ${incomingRank}) takes precedence over existing ${matchedExisting.platform} (rank ${existingRank})`,
        });
      } else {
        results.push({ transaction: txn, isDuplicate: false, fingerprint });
      }
    }

    return success({ results, totalChecked: transactions.length, duplicatesFound });
  }

  private normalize(
    amount: number,
    date: string,
    description?: string
  ): { amount: string; date: string; description: string } {
    return {
      amount: amount.toFixed(2),
      date: date.slice(0, 10),
      description: (description ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64),
    };
  }

  private generateFuzzyFingerprints(txn: ITransaction): string[] {
    const amountDeltas = [0, -DeduplicationService.AMOUNT_TOLERANCE, DeduplicationService.AMOUNT_TOLERANCE];
    const dateDeltaMs = [-DeduplicationService.DATE_TOLERANCE_MS, 0, DeduplicationService.DATE_TOLERANCE_MS];
    const baseDate = new Date(txn.transactionDate);
    const fingerprints: string[] = [];

    for (const amtDelta of amountDeltas) {
      const amount = Math.round((txn.grossRevenue + amtDelta) * 100) / 100;
      for (const dateDelta of dateDeltaMs) {
        const date = new Date(baseDate.getTime() + dateDelta).toISOString().slice(0, 10);
        const input = `${txn.clientId}|${amount.toFixed(2)}|${date}|${this.normalize(0, '', txn.description).description}`;
        fingerprints.push(crypto.createHash('sha256').update(input).digest('hex'));
      }
    }

    return fingerprints;
  }
}
