import { DeduplicationService } from './DeduplicationService';
import type { ITransactionRepository } from '@domain/ports';
import type { ITransaction } from '@domain/entities';
import { success, failure } from '@domain/shared';

function makeTxn(overrides: Partial<ITransaction> = {}): ITransaction {
  const now = new Date().toISOString();
  return {
    id: 'txn-001',
    clientId: 'client-001',
    platform: 'youtube',
    platformTransactionId: 'YT-001',
    platformId: undefined,
    transactionDate: '2026-03-15',
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

function makeRepo(existingTransactions: ITransaction[] = []): ITransactionRepository {
  return {
    save: jest.fn(),
    saveBulk: jest.fn(),
    findById: jest.fn(),
    findByClientId: jest.fn(),
    findApprovedUnsyncedByClientId: jest.fn(),
    updateSyncStatus: jest.fn(),
    findByFingerprints: jest.fn().mockResolvedValue(success(existingTransactions)),
  } as unknown as ITransactionRepository;
}

describe('DeduplicationService', () => {
  describe('generateFingerprint', () => {
    it('generates a deterministic SHA-256 hex string', () => {
      const service = new DeduplicationService(makeRepo());
      const txn = makeTxn();
      const fp1 = service.generateFingerprint(txn);
      const fp2 = service.generateFingerprint(txn);
      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different fingerprints for different amounts', () => {
      const service = new DeduplicationService(makeRepo());
      const fp1 = service.generateFingerprint(makeTxn({ grossRevenue: 100 }));
      const fp2 = service.generateFingerprint(makeTxn({ grossRevenue: 200 }));
      expect(fp1).not.toBe(fp2);
    });

    it('produces different fingerprints for different dates', () => {
      const service = new DeduplicationService(makeRepo());
      const fp1 = service.generateFingerprint(makeTxn({ transactionDate: '2026-03-01' }));
      const fp2 = service.generateFingerprint(makeTxn({ transactionDate: '2026-03-02' }));
      expect(fp1).not.toBe(fp2);
    });

    it('normalizes description — case and special chars do not change fingerprint', () => {
      const service = new DeduplicationService(makeRepo());
      const fp1 = service.generateFingerprint(makeTxn({ description: 'YouTube AdSense payout' }));
      const fp2 = service.generateFingerprint(makeTxn({ description: 'youtube adsense payout' }));
      const fp3 = service.generateFingerprint(makeTxn({ description: 'YouTube  AdSense -- payout!!' }));
      expect(fp1).toBe(fp2);
      expect(fp1).toBe(fp3);
    });

    it('isolates fingerprints by clientId', () => {
      const service = new DeduplicationService(makeRepo());
      const fp1 = service.generateFingerprint(makeTxn({ clientId: 'client-A' }));
      const fp2 = service.generateFingerprint(makeTxn({ clientId: 'client-B' }));
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('checkBatch — no existing duplicates', () => {
    it('returns isDuplicate=false for all transactions when DB is empty', async () => {
      const service = new DeduplicationService(makeRepo([]));
      const txns = [makeTxn({ id: 'a' }), makeTxn({ id: 'b', grossRevenue: 500 })];
      const result = await service.checkBatch(txns, 'client-001');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.duplicatesFound).toBe(0);
      result.value.results.forEach(r => expect(r.isDuplicate).toBe(false));
    });

    it('returns empty results for empty input', async () => {
      const service = new DeduplicationService(makeRepo([]));
      const result = await service.checkBatch([], 'client-001');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.totalChecked).toBe(0);
    });
  });

  describe('checkBatch — exact duplicate detection', () => {
    it('flags a transaction as duplicate when fingerprint matches existing', async () => {
      const service = new DeduplicationService(makeRepo());
      const existingTxn = makeTxn({ id: 'existing-001' });
      const existingFingerprint = service.generateFingerprint(existingTxn);

      const repoWithMatch = makeRepo([{ ...existingTxn, deduplicationHash: existingFingerprint }]);
      const serviceWithMatch = new DeduplicationService(repoWithMatch);

      const incomingTxn = makeTxn({ id: 'new-002' });
      const result = await serviceWithMatch.checkBatch([incomingTxn], 'client-001');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.duplicatesFound).toBe(1);
      expect(result.value.results[0].isDuplicate).toBe(true);
      expect(result.value.results[0].duplicateOf).toBe('existing-001');
    });
  });

  describe('checkBatch — fuzzy matching', () => {
    it('detects duplicate with ±$0.01 amount difference', async () => {
      const service = new DeduplicationService(makeRepo());
      const existingTxn = makeTxn({ id: 'existing-fuzzy', grossRevenue: 100.00 });
      const fingerprint = service.generateFingerprint(existingTxn);

      const repo = makeRepo([{ ...existingTxn, deduplicationHash: fingerprint }]);
      const svc = new DeduplicationService(repo);

      const incoming = makeTxn({ id: 'new-fuzzy', grossRevenue: 100.01 });
      const result = await svc.checkBatch([incoming], 'client-001');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.duplicatesFound).toBe(1);
    });

    it('does NOT flag as duplicate when amount differs by more than $0.01', async () => {
      const service = new DeduplicationService(makeRepo());
      const existingTxn = makeTxn({ id: 'existing-safe', grossRevenue: 100.00 });
      const fingerprint = service.generateFingerprint(existingTxn);

      const repo = makeRepo([{ ...existingTxn, deduplicationHash: fingerprint }]);
      const svc = new DeduplicationService(repo);

      const incoming = makeTxn({ id: 'new-safe', grossRevenue: 100.50 });
      const result = await svc.checkBatch([incoming], 'client-001');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.duplicatesFound).toBe(0);
    });
  });

  describe('checkBatch — source hierarchy', () => {
    it('keeps youtube (rank 1) over stripe (rank 6) — stripe is marked as duplicate', async () => {
      const service = new DeduplicationService(makeRepo());
      const ytTxn = makeTxn({ id: 'yt-001', platform: 'youtube', sourceHierarchy: 'primary' });
      const ytFingerprint = service.generateFingerprint(ytTxn);

      const repo = makeRepo([{ ...ytTxn, deduplicationHash: ytFingerprint }]);
      const svc = new DeduplicationService(repo);

      const stripeTxn = makeTxn({ id: 'stripe-001', platform: 'stripe', sourceHierarchy: 'processor' });
      const result = await svc.checkBatch([stripeTxn], 'client-001');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.results[0].isDuplicate).toBe(true);
    });

    it('does not self-match when id is the same transaction', async () => {
      const txn = makeTxn({ id: 'same-id' });
      const service = new DeduplicationService(makeRepo());
      const fingerprint = service.generateFingerprint(txn);
      const repo = makeRepo([{ ...txn, deduplicationHash: fingerprint }]);
      const svc = new DeduplicationService(repo);

      const result = await svc.checkBatch([txn], 'client-001');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.duplicatesFound).toBe(0);
    });
  });

  describe('checkBatch — repository errors', () => {
    it('returns LOOKUP_FAILED when repository throws', async () => {
      const badRepo: ITransactionRepository = {
        ...makeRepo(),
        findByFingerprints: jest.fn().mockResolvedValue(
          failure({ code: 'DB_ERROR', message: 'Connection lost', retryable: true })
        ),
      } as unknown as ITransactionRepository;

      const svc = new DeduplicationService(badRepo);
      const result = await svc.checkBatch([makeTxn()], 'client-001');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('LOOKUP_FAILED');
    });
  });
});
