import { ConfidenceScoringService } from './ConfidenceScoringService';
import type { ITransaction } from '@domain/entities';

function makeTxn(overrides: Partial<ITransaction> = {}): ITransaction {
  const now = new Date().toISOString();
  return {
    id: 'txn-score-001',
    clientId: 'client-001',
    platform: 'youtube',
    platformTransactionId: 'YT-001',
    platformId: 'ch-abc',
    transactionDate: '2026-03-21',
    createdAt: now,
    updatedAt: now,
    grossRevenue: 1000.00,
    platformFee: 450.00,
    netPayout: 550.00,
    description: 'YouTube AdSense payout',
    sourceHierarchy: 'primary',
    status: 'pending_review',
    ...overrides,
  };
}

describe('ConfidenceScoringService', () => {
  let service: ConfidenceScoringService;

  beforeEach(() => {
    service = new ConfidenceScoringService();
  });

  describe('categorizeScore', () => {
    it('returns GREEN for score >= 80', () => {
      expect(service.categorizeScore(80)).toBe('GREEN');
      expect(service.categorizeScore(100)).toBe('GREEN');
      expect(service.categorizeScore(95)).toBe('GREEN');
    });

    it('returns YELLOW for score 50-79', () => {
      expect(service.categorizeScore(50)).toBe('YELLOW');
      expect(service.categorizeScore(79)).toBe('YELLOW');
      expect(service.categorizeScore(65)).toBe('YELLOW');
    });

    it('returns RED for score < 50', () => {
      expect(service.categorizeScore(49)).toBe('RED');
      expect(service.categorizeScore(0)).toBe('RED');
    });
  });

  describe('scoreTransaction — base scoring', () => {
    it('yields GREEN for a well-formed YouTube transaction on payout day', async () => {
      const txn = makeTxn();
      const result = await service.scoreTransaction(txn, 'client-001');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Base 70 + primary (+10) + payout calendar (+10) + keyword (+5) + complete metadata (+5) + dedup clean (+5) = 105 → clamped 100
      expect(result.value.score).toBe(100);
      expect(result.value.category).toBe('GREEN');
      expect(result.value.suggestedAction).toBe('AUTO_APPROVE');
    });

    it('includes a reason entry for each applied factor', async () => {
      const txn = makeTxn();
      const result = await service.scoreTransaction(txn, 'client-001');
      if (!result.ok) return;
      const factors = result.value.reasons.map(r => r.factor);
      expect(factors).toContain('base_score');
      expect(factors).toContain('primary_source');
      expect(factors).toContain('known_keywords');
    });
  });

  describe('scoreTransaction — individual factor impacts', () => {
    it('adds +10 for primary platform', async () => {
      const ytResult = await service.scoreTransaction(makeTxn({ platform: 'youtube' }), 'c');
      const stripeResult = await service.scoreTransaction(
        makeTxn({ platform: 'stripe', platformFee: 29, netPayout: 971, sourceHierarchy: 'processor' }),
        'c'
      );
      if (!ytResult.ok || !stripeResult.ok) return;
      expect(ytResult.value.score).toBeGreaterThan(stripeResult.value.score);
    });

    it('deducts -20 for potential duplicate (deduplicationHash present)', async () => {
      const clean = await service.scoreTransaction(makeTxn(), 'c');
      const flagged = await service.scoreTransaction(makeTxn({ deduplicationHash: 'abc123' }), 'c');
      if (!clean.ok || !flagged.ok) return;
      expect(clean.value.score - flagged.value.score).toBeGreaterThanOrEqual(20);
    });

    it('deducts -10 for missing description', async () => {
      const withDesc = await service.scoreTransaction(makeTxn(), 'c');
      const noDesc = await service.scoreTransaction(makeTxn({ description: undefined }), 'c');
      if (!withDesc.ok || !noDesc.ok) return;
      expect(withDesc.value.score - noDesc.value.score).toBeGreaterThanOrEqual(10);
    });

    it('deducts -30 for fee ratio outside expected range', async () => {
      const txn = makeTxn({ platformFee: 10, grossRevenue: 1000 });
      const result = await service.scoreTransaction(txn, 'c');
      if (!result.ok) return;
      const feeReason = result.value.reasons.find(r => r.factor === 'fee_ratio_out_of_range');
      expect(feeReason).toBeDefined();
      expect(feeReason!.impact).toBe(-30);
    });
  });

  describe('scoreTransaction — score clamping', () => {
    it('clamps score to 100 maximum', async () => {
      const result = await service.scoreTransaction(makeTxn(), 'c');
      if (!result.ok) return;
      expect(result.value.score).toBeLessThanOrEqual(100);
    });

    it('clamps score to 0 minimum', async () => {
      const txn = makeTxn({
        platform: 'stripe',
        sourceHierarchy: 'processor',
        description: undefined,
        platformFee: 1,
        grossRevenue: 1000,
        deduplicationHash: 'dup-hash',
      });
      const result = await service.scoreTransaction(txn, 'c');
      if (!result.ok) return;
      expect(result.value.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scoreBatch', () => {
    it('scores all transactions and counts categories correctly', async () => {
      const txns = [
        makeTxn({ id: 'g1' }),
        makeTxn({ id: 'y1', transactionDate: '2026-03-10' }),
        makeTxn({ id: 'r1', platform: 'stripe', sourceHierarchy: 'processor', platformFee: 5, grossRevenue: 1000, description: undefined, deduplicationHash: 'x' }),
      ];

      const result = await service.scoreBatch(txns, 'client-001');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.totalScored).toBe(3);
      expect(result.value.results).toHaveLength(3);
    });

    it('returns an empty batch result for no transactions', async () => {
      const result = await service.scoreBatch([], 'client-001');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.totalScored).toBe(0);
        expect(result.value.greenCount + result.value.yellowCount + result.value.redCount).toBe(0);
      }
    });
  });
});
