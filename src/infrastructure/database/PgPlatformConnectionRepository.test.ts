import { PgPlatformConnectionRepository } from './PgPlatformConnectionRepository';
import type { IPgClient } from './PgTransactionRepository';

describe('PgPlatformConnectionRepository — Sprint 2 new methods', () => {
  let repository: PgPlatformConnectionRepository;
  let mockPgClient: jest.Mocked<IPgClient>;
  let mockEncryption: { encrypt: jest.Mock; decrypt: jest.Mock };

  const mockConnectionRow = {
    id: 'conn-123',
    client_id: 'client-456',
    platform: 'youtube' as const,
    status: 'active' as const,
    expires_at: '2027-01-01T00:00:00Z',
    scopes: ['yt-analytics-monetary.readonly'],
    platform_user_id: null,
    last_health_check_at: null,
    token_refreshed_at: null,
  };

  beforeEach(() => {
    mockPgClient = { query: jest.fn() } as jest.Mocked<IPgClient>;
    mockEncryption = { encrypt: jest.fn(), decrypt: jest.fn() };
    repository = new PgPlatformConnectionRepository(mockPgClient, mockEncryption as any);
  });

  describe('createConnection', () => {
    it('should insert and return a new connection', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [mockConnectionRow], rowCount: 1 });

      const result = await repository.createConnection({
        id: 'conn-123',
        clientId: 'client-456',
        platform: 'youtube',
        status: 'active',
        expiresAt: '2027-01-01T00:00:00Z',
        scopes: ['yt-analytics-monetary.readonly'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('conn-123');
        expect(result.value.platform).toBe('youtube');
        expect(result.value.status).toBe('active');
      }
    });

    it('should return DUPLICATE_CONNECTION when unique constraint is violated', async () => {
      const pgError = new Error('duplicate key value violates unique constraint on client_id and platform');
      mockPgClient.query.mockRejectedValue(pgError);

      const result = await repository.createConnection({
        id: 'new-id',
        clientId: 'client-456',
        platform: 'youtube',
        status: 'active',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DUPLICATE_CONNECTION');
        expect(result.error.retryable).toBe(false);
      }
    });
  });

  describe('updateStatus', () => {
    it('should update status and return updated connection', async () => {
      const updatedRow = { ...mockConnectionRow, status: 'inactive' as const };
      mockPgClient.query.mockResolvedValue({ rows: [updatedRow], rowCount: 1 });

      const result = await repository.updateStatus('conn-123', 'inactive');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('inactive');
      }
    });

    it('should update expiresAt when provided', async () => {
      const updatedRow = { ...mockConnectionRow, expires_at: '2028-01-01T00:00:00Z' };
      mockPgClient.query.mockResolvedValue({ rows: [updatedRow], rowCount: 1 });

      const result = await repository.updateStatus('conn-123', 'active', '2028-01-01T00:00:00Z');

      expect(result.ok).toBe(true);
      const sql = mockPgClient.query.mock.calls[0]?.[0] as string;
      expect(sql).toContain('COALESCE($3, expires_at)');
    });

    it('should return NOT_FOUND when connection does not exist', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await repository.updateStatus('ghost-conn', 'active');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('findByClientAndPlatform', () => {
    it('should return connection when found', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [mockConnectionRow], rowCount: 1 });

      const result = await repository.findByClientAndPlatform('client-456', 'youtube');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.id).toBe('conn-123');
        expect(result.value?.platform).toBe('youtube');
      }
    });

    it('should return null when no connection exists', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await repository.findByClientAndPlatform('client-456', 'stripe');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('findExpiringConnections', () => {
    it('should return connections expiring within specified days', async () => {
      mockPgClient.query.mockResolvedValue({
        rows: [
          { ...mockConnectionRow, expires_at: '2026-05-01T00:00:00Z' },
          { ...mockConnectionRow, id: 'conn-456', platform: 'patreon' as const, expires_at: '2026-05-02T00:00:00Z' },
        ],
        rowCount: 2,
      });

      const result = await repository.findExpiringConnections(7);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }

      const params = mockPgClient.query.mock.calls[0]?.[1] as string[];
      expect(params[0]).toBe('7');
    });

    it('should return empty array when no connections expiring soon', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await repository.findExpiringConnections(3);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });
});
