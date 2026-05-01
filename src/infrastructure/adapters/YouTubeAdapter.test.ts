import { YouTubeAdapter } from './YouTubeAdapter';
import type { FetchPlatformDataInput, IPlatformConnectionRepository, IEncryptionService } from '@domain/ports';
import { success } from '@domain/shared';

function makeConnectionRepo(): IPlatformConnectionRepository {
  return {
    findById: jest.fn(),
    findActiveByClientId: jest.fn(),
    saveTokens: jest.fn(),
    getTokens: jest.fn().mockResolvedValue(success({ accessToken: 'enc-token' })),
    createConnection: jest.fn(),
    updateStatus: jest.fn(),
    findByClientAndPlatform: jest.fn(),
    findExpiringConnections: jest.fn(),
  } as unknown as IPlatformConnectionRepository;
}

function makeEncryptionService(): IEncryptionService {
  return {
    encrypt: jest.fn(),
    decrypt: jest.fn().mockReturnValue('yt-access-token'),
  };
}

const input: FetchPlatformDataInput = {
  clientId: 'client-yt-001',
  connectionId: 'conn-yt-001',
  fromDate: '2026-03-01',
  toDate: '2026-03-31',
};

describe('YouTubeAdapter', () => {
  let adapter: YouTubeAdapter;

  beforeEach(() => {
    adapter = new YouTubeAdapter(makeConnectionRepo(), makeEncryptionService(), null);
  });

  afterEach(() => jest.restoreAllMocks());

  it('builds the correct Analytics API URL with date params', async () => {
    let capturedUrl = '';
    global.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ rows: [] }),
        headers: { forEach: jest.fn() },
      } as unknown as Response);
    });

    await adapter.fetchData(input);

    expect(capturedUrl).toContain('youtubeanalytics.googleapis.com/v2/reports');
    expect(capturedUrl).toContain('startDate=2026-03-01');
    expect(capturedUrl).toContain('endDate=2026-03-31');
    expect(capturedUrl).toContain('metrics=estimatedRevenue');
  });

  it('correctly applies 45% platform fee and 55% net payout', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        rows: [['2026-03-15', 1000]],
      }),
      headers: { forEach: jest.fn() },
    } as unknown as Response);

    const result = await adapter.fetchData(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [txn] = result.value;
    expect(txn.grossRevenue).toBe(1000);
    expect(txn.platformFee).toBe(450);
    expect(txn.netPayout).toBe(550);
    expect(txn.platform).toBe('youtube');
    expect(txn.sourceHierarchy).toBe('primary');
  });

  it('returns empty array when API returns no rows', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ rows: [] }),
      headers: { forEach: jest.fn() },
    } as unknown as Response);

    const result = await adapter.fetchData(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('handles missing rows field gracefully', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({}),
      headers: { forEach: jest.fn() },
    } as unknown as Response);

    const result = await adapter.fetchData(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('detects YouTube quotaExceeded and returns RATE_LIMITED', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false, status: 403,
      json: async () => ({
        error: {
          errors: [{ reason: 'quotaExceeded', domain: 'youtube.quota', message: 'Quota exceeded' }],
        },
      }),
      headers: { forEach: jest.fn() },
    } as unknown as Response);

    const result = await adapter.fetchData(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED');
  });

  it('sets status as pending_review and generates a UUID id', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ rows: [['2026-03-10', 500]] }),
      headers: { forEach: jest.fn() },
    } as unknown as Response);

    const result = await adapter.fetchData(input);
    if (!result.ok) return;
    const [txn] = result.value;
    expect(txn.status).toBe('pending_review');
    expect(txn.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(txn.transactionDate).toBe('2026-03-10');
  });

  it('uses Bearer token in Authorization header', async () => {
    let capturedHeaders: Record<string, string> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedHeaders = opts.headers as Record<string, string>;
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ rows: [] }),
        headers: { forEach: jest.fn() },
      } as unknown as Response);
    });

    await adapter.fetchData(input);
    expect(capturedHeaders['Authorization']).toBe('Bearer yt-access-token');
  });
});
