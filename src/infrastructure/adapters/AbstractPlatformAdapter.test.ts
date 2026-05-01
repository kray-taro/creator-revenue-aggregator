import { AbstractPlatformAdapter } from './AbstractPlatformAdapter';
import type { FetchPlatformDataInput, IPlatformConnectionRepository, IEncryptionService, IRawResponseArchivalService } from '@domain/ports';
import type { ITransaction, PlatformName } from '@domain/entities';
import { success, failure } from '@domain/shared';

class ConcreteTestAdapter extends AbstractPlatformAdapter {
  readonly platform: PlatformName = 'youtube';
  private urlsRequested: string[] = [];

  setPages(_pages: Array<Record<string, unknown>>): void {
    // mock method, unused fields removed
  }

  getUrlsRequested(): string[] { return this.urlsRequested; }

  protected buildRequestUrl(input: FetchPlatformDataInput, cursor: string | null): string {
    return `https://example.com/api?from=${input.fromDate}&cursor=${cursor ?? ''}`;
  }

  protected buildRequestHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` };
  }

  protected transformPage(raw: Record<string, unknown>, input: FetchPlatformDataInput): ITransaction[] {
    const items = (raw['items'] as Array<{ id: string; amount: number }>) ?? [];
    const now = new Date().toISOString();
    return items.map(item => ({
      id: `txn-${item.id}`,
      clientId: input.clientId,
      platform: 'youtube' as const,
      platformTransactionId: `YT-${item.id}`,
      transactionDate: input.fromDate,
      createdAt: now,
      updatedAt: now,
      grossRevenue: item.amount,
      platformFee: Math.round(item.amount * 0.45 * 100) / 100,
      netPayout: Math.round(item.amount * 0.55 * 100) / 100,
      description: `Test transaction ${item.id}`,
      sourceHierarchy: 'primary' as const,
      status: 'pending_review' as const,
    }));
  }

  protected extractNextCursor(raw: Record<string, unknown>): string | null {
    return (raw['nextCursor'] as string | undefined) ?? null;
  }
}

function makeConnectionRepo(accessToken = 'encrypted-token'): IPlatformConnectionRepository {
  return {
    findById: jest.fn().mockResolvedValue(success({ id: 'conn-1', clientId: 'client-1', platform: 'youtube', status: 'active' })),
    findActiveByClientId: jest.fn(),
    saveTokens: jest.fn(),
    getTokens: jest.fn().mockResolvedValue(success({ accessToken })),
    createConnection: jest.fn(),
    updateStatus: jest.fn(),
    findByClientAndPlatform: jest.fn(),
    findExpiringConnections: jest.fn(),
  } as unknown as IPlatformConnectionRepository;
}

function makeEncryptionService(plainText = 'raw-access-token'): IEncryptionService {
  return {
    encrypt: jest.fn().mockReturnValue('encrypted-token'),
    decrypt: jest.fn().mockReturnValue(plainText),
  };
}

const defaultInput: FetchPlatformDataInput = {
  clientId: 'client-abc',
  connectionId: 'conn-1',
  fromDate: '2026-03-01',
  toDate: '2026-03-31',
};

describe('AbstractPlatformAdapter', () => {
  let adapter: ConcreteTestAdapter;
  let connectionRepo: IPlatformConnectionRepository;
  let encryptionService: IEncryptionService;

  beforeEach(() => {
    connectionRepo = makeConnectionRepo();
    encryptionService = makeEncryptionService();
    adapter = new ConcreteTestAdapter(connectionRepo, encryptionService, null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchData', () => {
    it('returns UNAUTHORIZED when getTokens fails', async () => {
      (connectionRepo.getTokens as jest.Mock).mockResolvedValue(
        failure({ code: 'NOT_FOUND', message: 'no tokens', retryable: false })
      );
      const result = await adapter.fetchData(defaultInput);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('fetches a single page and returns transactions', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [{ id: '1', amount: 100 }, { id: '2', amount: 200 }] }),
        headers: { forEach: jest.fn() },
      } as unknown as Response);

      const result = await adapter.fetchData(defaultInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].platformTransactionId).toBe('YT-1');
      }
    });

    it('follows cursor pagination across multiple pages', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({ items: [{ id: '1', amount: 10 }], nextCursor: 'cursor-page2' }),
          headers: { forEach: jest.fn() },
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({ items: [{ id: '2', amount: 20 }] }),
          headers: { forEach: jest.fn() },
        } as unknown as Response);

      const result = await adapter.fetchData(defaultInput);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(2);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 errors with exponential backoff', async () => {
      jest.useFakeTimers();
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: false, status: 500,
          json: async () => ({ error: 'server error' }),
          headers: { forEach: jest.fn() },
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({ items: [] }),
          headers: { forEach: jest.fn() },
        } as unknown as Response);

      const fetchPromise = adapter.fetchData(defaultInput);
      await jest.runAllTimersAsync();
      const result = await fetchPromise;
      expect(result.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('returns RATE_LIMITED on 429 and retries', async () => {
      jest.useFakeTimers();
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: false, status: 429,
          headers: {
            get: (k: string) => k === 'Retry-After' ? '1' : null,
            forEach: jest.fn(),
          },
          json: async () => ({}),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({ items: [] }),
          headers: { forEach: jest.fn() },
        } as unknown as Response);

      const fetchPromise = adapter.fetchData(defaultInput);
      await jest.runAllTimersAsync();
      const result = await fetchPromise;
      expect(result.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('returns UNAUTHORIZED on 401 without retry', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false, status: 401,
        json: async () => ({}),
        headers: { forEach: jest.fn() },
      } as unknown as Response);

      const result = await adapter.fetchData(defaultInput);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns INVALID_SOURCE_PAYLOAD when transformPage throws', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ items: 'not-an-array' }),
        headers: { forEach: jest.fn() },
      } as unknown as Response);

      jest.spyOn(adapter as unknown as { transformPage: () => ITransaction[] }, 'transformPage').mockImplementation(() => {
        throw new Error('unexpected shape');
      });

      const result = await adapter.fetchData(defaultInput);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_SOURCE_PAYLOAD');
    });

    it('archives first page response when archival service is provided', async () => {
      const archivalService: IRawResponseArchivalService = {
        archiveRawResponse: jest.fn().mockResolvedValue(success({ s3Key: 'k', s3Bucket: 'b', archivedAt: '', sizeBytes: 0 })),
        retrieveRawResponse: jest.fn(),
      };

      const adapterWithArchival = new ConcreteTestAdapter(connectionRepo, encryptionService, archivalService);
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ items: [{ id: '1', amount: 50 }] }),
        headers: { forEach: jest.fn() },
      } as unknown as Response);

      await adapterWithArchival.fetchData(defaultInput);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(archivalService.archiveRawResponse).toHaveBeenCalledTimes(1);
    });
  });
});
