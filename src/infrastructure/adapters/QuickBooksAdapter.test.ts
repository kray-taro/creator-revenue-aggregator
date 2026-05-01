import { QuickBooksAdapter } from './QuickBooksAdapter';
import type { IPlatformConnectionRepository, IEncryptionService } from '@domain/ports';
import { success } from '@domain/shared';
import type { QBJournalEntryInput } from '@domain/ports';

const REALM_ID = 'realm-sandbox-001';

function makeConnectionRepo(accessToken = 'encrypted-qb-token'): IPlatformConnectionRepository {
  return {
    findById: jest.fn(),
    findActiveByClientId: jest.fn(),
    saveTokens: jest.fn(),
    getTokens: jest.fn().mockResolvedValue(success({ accessToken })),
    createConnection: jest.fn(),
    updateStatus: jest.fn(),
    findByClientAndPlatform: jest.fn(),
    findExpiringConnections: jest.fn(),
  } as unknown as IPlatformConnectionRepository;
}

function makeEncryptionService(): IEncryptionService {
  return {
    encrypt: jest.fn(),
    decrypt: jest.fn().mockReturnValue('live-qb-access-token'),
  };
}

function makeEntry(externalId = 'txn-001'): QBJournalEntryInput {
  return {
    externalId,
    txnDate: '2026-03-15',
    lines: [
      { accountId: 'revenue-acct', amount: 550, postingType: 'Credit' },
      { accountId: 'bank-acct', amount: 550, postingType: 'Debit' },
    ],
    privateNote: 'platform:youtube',
  };
}

describe('QuickBooksAdapter', () => {
  let adapter: QuickBooksAdapter;

  beforeEach(() => {
    adapter = new QuickBooksAdapter(makeConnectionRepo(), makeEncryptionService(), 'conn-qb-001', true);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('createJournalEntry', () => {
    it('creates a journal entry and verifies it via PrivateNote', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({ JournalEntry: { Id: 'jeid-001', PrivateNote: 'external_id:txn-001' } }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({ JournalEntry: { Id: 'jeid-001', PrivateNote: 'external_id:txn-001 | platform:youtube' } }),
        } as unknown as Response);

      const result = await adapter.createJournalEntry(makeEntry('txn-001'), REALM_ID);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.qbEntryId).toBe('jeid-001');
      expect(result.value.externalId).toBe('txn-001');
    });

    it('returns TOKEN_EXPIRED on 401', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false, status: 401,
        json: async () => ({}),
      } as unknown as Response);

      const result = await adapter.createJournalEntry(makeEntry(), REALM_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('TOKEN_EXPIRED');
    });

    it('returns VERIFICATION_FAILED when PrivateNote does not contain external_id', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({ JournalEntry: { Id: 'jeid-002', PrivateNote: 'no-match-here' } }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({ JournalEntry: { Id: 'jeid-002', PrivateNote: 'no-match-here' } }),
        } as unknown as Response);

      const result = await adapter.createJournalEntry(makeEntry('txn-verify-fail'), REALM_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VERIFICATION_FAILED');
    });

    it('returns INVALID_ENTRY when QB API returns a Fault', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false, status: 400,
        json: async () => ({ Fault: { Error: [{ Message: 'Invalid account ref', code: '6010' }] } }),
      } as unknown as Response);

      const result = await adapter.createJournalEntry(makeEntry(), REALM_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_ENTRY');
        expect(result.error.message).toContain('Invalid account ref');
      }
    });

    it('returns NETWORK_ERROR on fetch failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await adapter.createJournalEntry(makeEntry(), REALM_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NETWORK_ERROR');
    });
  });

  describe('batchCreateJournalEntries', () => {
    it('creates multiple entries in one batch call', async () => {
      const entries = [makeEntry('txn-b1'), makeEntry('txn-b2')];

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          BatchItemResponse: [
            { bId: 'batch-0', JournalEntry: { Id: 'je-b1' } },
            { bId: 'batch-1', JournalEntry: { Id: 'je-b2' } },
          ],
        }),
      } as unknown as Response);

      const result = await adapter.batchCreateJournalEntries(entries, REALM_ID);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
      expect(result.value[0].qbEntryId).toBe('je-b1');
      expect(result.value[1].qbEntryId).toBe('je-b2');
    });
  });

  describe('verifyEntry', () => {
    it('returns true when PrivateNote contains external_id', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ JournalEntry: { Id: 'je-v1', PrivateNote: 'external_id:txn-001' } }),
      } as unknown as Response);

      const result = await adapter.verifyEntry('je-v1', 'txn-001', REALM_ID);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(true);
    });

    it('returns false when PrivateNote does not contain external_id', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ JournalEntry: { Id: 'je-v2', PrivateNote: 'unrelated note' } }),
      } as unknown as Response);

      const result = await adapter.verifyEntry('je-v2', 'txn-nomatch', REALM_ID);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(false);
    });
  });

  describe('UNAUTHORIZED when token decryption fails', () => {
    it('returns UNAUTHORIZED error', async () => {
      const badEncryption: IEncryptionService = {
        encrypt: jest.fn(),
        decrypt: jest.fn().mockImplementation(() => { throw new Error('decryption failed'); }),
      };
      const badAdapter = new QuickBooksAdapter(makeConnectionRepo(), badEncryption, 'conn-qb-001', true);
      const result = await badAdapter.createJournalEntry(makeEntry(), REALM_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED');
    });
  });
});
