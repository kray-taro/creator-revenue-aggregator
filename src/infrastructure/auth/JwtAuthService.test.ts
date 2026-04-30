import { JwtAuthService, type IRedisTokenClient } from './JwtAuthService';

describe('JwtAuthService', () => {
  let service: JwtAuthService;
  let mockRedis: jest.Mocked<IRedisTokenClient>;

  const config = {
    appSecret: 'a-very-long-secret-key-for-testing-purposes-ok',
    jwtAccessExpiry: 900,      // 15 min
    jwtRefreshExpiry: 604800,  // 7 days
  };

  beforeEach(() => {
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK' as const),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
    } as jest.Mocked<IRedisTokenClient>;

    service = new JwtAuthService(config, mockRedis);
  });

  describe('generateTokenPair', () => {
    it('should return a valid access token and opaque refresh token', async () => {
      const result = await service.generateTokenPair('bk-123', 'bookkeeper@example.com');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // JWT format
        expect(result.value.refreshToken).toMatch(/^[0-9a-f-]{36}$/); // UUID format
        expect(new Date(result.value.accessExpiresAt).getTime()).toBeGreaterThan(Date.now());
        expect(new Date(result.value.refreshExpiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    });

    it('should store refresh token in Redis with correct TTL', async () => {
      await service.generateTokenPair('bk-123', 'bookkeeper@example.com');

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('auth:refresh:'),
        expect.stringContaining('bk-123'),
        'EX',
        604800
      );
    });
  });

  describe('verifyAccessToken', () => {
    it('should successfully verify a freshly generated token', async () => {
      const pairResult = await service.generateTokenPair('bk-456', 'test@example.com');
      expect(pairResult.ok).toBe(true);
      if (!pairResult.ok) return;

      const verifyResult = service.verifyAccessToken(pairResult.value.accessToken);

      expect(verifyResult.ok).toBe(true);
      if (verifyResult.ok) {
        expect(verifyResult.value.bookkeeperId).toBe('bk-456');
        expect(verifyResult.value.email).toBe('test@example.com');
        expect(verifyResult.value.role).toBe('bookkeeper');
      }
    });

    it('should return INVALID_TOKEN for a malformed JWT', () => {
      const result = service.verifyAccessToken('not.a.valid.token.structure');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_TOKEN');
      }
    });

    it('should return INVALID_TOKEN for a tampered JWT', async () => {
      const pairResult = await service.generateTokenPair('bk-789', 'tamper@example.com');
      expect(pairResult.ok).toBe(true);
      if (!pairResult.ok) return;

      // Tamper with the payload
      const parts = pairResult.value.accessToken.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'attacker', role: 'admin' })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const result = service.verifyAccessToken(tamperedToken);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_TOKEN');
      }
    });

    it('should return TOKEN_EXPIRED for an expired token', async () => {
      // Generate with a service configured for 0 expiry (already expired)
      const shortService = new JwtAuthService(
        { ...config, jwtAccessExpiry: -10 }, // Expired 10s ago
        mockRedis
      );

      const pairResult = await shortService.generateTokenPair('bk-999', 'expired@example.com');
      expect(pairResult.ok).toBe(true);
      if (!pairResult.ok) return;

      const result = service.verifyAccessToken(pairResult.value.accessToken);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TOKEN_EXPIRED');
      }
    });
  });

  describe('refreshTokenPair', () => {
    it('should rotate refresh token and return new pair', async () => {
      const storedData = JSON.stringify({ bookkeeperId: 'bk-123', email: 'test@example.com' });
      mockRedis.get.mockResolvedValue(storedData);

      const result = await service.refreshTokenPair('old-refresh-token');

      expect(result.ok).toBe(true);
      // Should have deleted old token
      expect(mockRedis.del).toHaveBeenCalledWith('auth:refresh:old-refresh-token');
      // Should have stored new token
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('auth:refresh:'),
        storedData,
        'EX',
        604800
      );
    });

    it('should return REFRESH_TOKEN_REVOKED when token not in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.refreshTokenPair('revoked-token');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('REFRESH_TOKEN_REVOKED');
      }
    });
  });

  describe('revokeRefreshToken', () => {
    it('should delete the token from Redis', async () => {
      const result = await service.revokeRefreshToken('refresh-token-to-revoke');

      expect(result.ok).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('auth:refresh:refresh-token-to-revoke');
    });

    it('should be idempotent when token does not exist', async () => {
      mockRedis.del.mockResolvedValue(0); // Key didn't exist

      const result = await service.revokeRefreshToken('non-existent-token');

      expect(result.ok).toBe(true); // No error — idempotent
    });
  });
});
