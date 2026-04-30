import { RedisOAuthStateStore, type IRedisStateClient } from './RedisOAuthStateStore';

describe('RedisOAuthStateStore', () => {
  let store: RedisOAuthStateStore;
  let mockRedis: jest.Mocked<IRedisStateClient>;

  const validMetadata = {
    clientId: 'client-123',
    platform: 'youtube' as const,
    bookkeeperId: 'bk-456',
    createdAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mockRedis = {
      set: jest.fn(),
      eval: jest.fn(),
    } as jest.Mocked<IRedisStateClient>;
    store = new RedisOAuthStateStore(mockRedis);
  });

  describe('storeState', () => {
    it('should store state and return success', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await store.storeState('test-state-uuid', validMetadata, 600_000);

      expect(result.ok).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'oauth:state:test-state-uuid',
        JSON.stringify(validMetadata),
        'EX',
        600,
        'NX'
      );
    });

    it('should return STORE_ERROR when Redis rejects (key exists)', async () => {
      mockRedis.set.mockResolvedValue(null); // NX returns null if key exists

      const result = await store.storeState('existing-state', validMetadata, 600_000);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORE_ERROR');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should return STORE_ERROR (retryable) on Redis network failure', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection refused'));

      const result = await store.storeState('state-uuid', validMetadata, 600_000);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORE_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should round up TTL from ms to seconds', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await store.storeState('state', validMetadata, 601_000); // 601 seconds

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'EX',
        601,
        'NX'
      );
    });
  });

  describe('validateAndConsumeState', () => {
    it('should return metadata when state is valid (atomic consume)', async () => {
      mockRedis.eval.mockResolvedValue(JSON.stringify(validMetadata));

      const result = await store.validateAndConsumeState('test-state-uuid');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.clientId).toBe('client-123');
        expect(result.value.platform).toBe('youtube');
        expect(result.value.bookkeeperId).toBe('bk-456');
      }
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('GET'),
        1,
        'oauth:state:test-state-uuid'
      );
    });

    it('should return STATE_NOT_FOUND when state does not exist', async () => {
      mockRedis.eval.mockResolvedValue(null);

      const result = await store.validateAndConsumeState('unknown-state');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STATE_NOT_FOUND');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should prevent double-consumption (second call returns null)', async () => {
      // First call: returns metadata and deletes key
      mockRedis.eval.mockResolvedValueOnce(JSON.stringify(validMetadata));
      // Second call: key already deleted by Lua script
      mockRedis.eval.mockResolvedValueOnce(null);

      const first = await store.validateAndConsumeState('state-uuid');
      const second = await store.validateAndConsumeState('state-uuid');

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error.code).toBe('STATE_NOT_FOUND');
      }
    });

    it('should return STORE_ERROR (retryable) on Redis failure during consume', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis timeout'));

      const result = await store.validateAndConsumeState('state-uuid');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORE_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });
  });
});
