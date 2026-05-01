import { OAuthOrchestrator } from './OAuthOrchestrator';
import type { OAuthStrategyFactory } from '@infrastructure/oauth/OAuthStrategyFactory';
import type {
  IPlatformConnectionRepository,
  IOAuthStateStore,
  IEncryptionService,
  IDistributedLockService,
  IAuditLogger,
  PlatformConnection,
} from '@domain/ports';

const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const makeAuditLogger = (): jest.Mocked<IAuditLogger> => ({
  log: jest.fn().mockResolvedValue({ ok: true, value: true }),
  sanitize: jest.fn().mockImplementation((d) => d),
});

const makeStrategy = () => ({
  platform: 'youtube' as const,
  buildAuthorizationUrl: jest.fn().mockReturnValue({
    ok: true,
    value: { url: 'https://accounts.google.com/auth?state=test-state', state: 'test-state' },
  }),
  exchangeCodeForTokens: jest.fn(),
  refreshAccessToken: jest.fn(),
});

const makeConnection = (overrides: Partial<PlatformConnection> = {}): PlatformConnection => ({
  id: 'conn-123',
  clientId: 'client-456',
  platform: 'youtube',
  status: 'active',
  expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  scopes: ['yt-analytics-monetary.readonly'],
  ...overrides,
});

describe('OAuthOrchestrator', () => {
  let orchestrator: OAuthOrchestrator;
  let mockStrategyFactory: jest.Mocked<OAuthStrategyFactory>;
  let mockStateStore: jest.Mocked<IOAuthStateStore>;
  let mockConnectionRepo: jest.Mocked<IPlatformConnectionRepository>;
  let mockEncryption: jest.Mocked<IEncryptionService>;
  let mockLockService: jest.Mocked<IDistributedLockService>;
  let mockStrategy: ReturnType<typeof makeStrategy>;

  beforeEach(() => {
    mockStrategy = makeStrategy();

    mockStrategyFactory = {
      getStrategy: jest.fn().mockReturnValue(mockStrategy),
      getSupportedPlatforms: jest.fn().mockReturnValue(['youtube']),
    } as unknown as jest.Mocked<OAuthStrategyFactory>;

    mockStateStore = {
      storeState: jest.fn().mockResolvedValue({ ok: true, value: true }),
      validateAndConsumeState: jest.fn().mockResolvedValue({
        ok: true,
        value: {
          clientId: 'client-456',
          platform: 'youtube' as const,
          bookkeeperId: 'bk-789',
          createdAt: new Date().toISOString(),
        },
      }),
    } as jest.Mocked<IOAuthStateStore>;

    mockConnectionRepo = {
      findById: jest.fn().mockResolvedValue({ ok: true, value: makeConnection() }),
      findActiveByClientId: jest.fn(),
      saveTokens: jest.fn().mockResolvedValue({ ok: true, value: true }),
      getTokens: jest.fn(),
      createConnection: jest.fn().mockResolvedValue({ ok: true, value: makeConnection() }),
      updateStatus: jest.fn().mockResolvedValue({ ok: true, value: makeConnection() }),
      findByClientAndPlatform: jest.fn().mockResolvedValue({ ok: true, value: null }),
      findExpiringConnections: jest.fn(),
    } as jest.Mocked<IPlatformConnectionRepository>;

    mockEncryption = {
      encrypt: jest.fn().mockImplementation((v) => `encrypted:${v}`),
      decrypt: jest.fn().mockImplementation((v) => v.replace('encrypted:', '')),
    } as jest.Mocked<IEncryptionService>;

    mockLockService = {
      withLock: jest.fn().mockImplementation(async (_name, _ttl, fn) => {
        return { ok: true, value: await fn() };
      }),
    } as unknown as jest.Mocked<IDistributedLockService>;

    orchestrator = new OAuthOrchestrator(
      mockStrategyFactory,
      mockStateStore,
      mockConnectionRepo,
      mockEncryption,
      mockLockService,
      makeLogger(),
      makeAuditLogger()
    );
  });

  describe('initiateConnection', () => {
    it('should return authorization URL and state for a supported platform', async () => {
      const result = await orchestrator.initiateConnection('bk-789', 'client-456', 'youtube');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.authorizationUrl).toContain('accounts.google.com');
        expect(result.value.state).toBeDefined();
      }
      expect(mockStateStore.storeState).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ clientId: 'client-456', platform: 'youtube', bookkeeperId: 'bk-789' }),
        600_000
      );
    });

    it('should return UNSUPPORTED_PLATFORM when no strategy is registered', async () => {
      mockStrategyFactory.getStrategy.mockReturnValue(null);

      const result = await orchestrator.initiateConnection('bk-789', 'client-456', 'unknown' as any);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNSUPPORTED_PLATFORM');
      }
    });

    it('should return STATE_STORE_FAILED when Redis write fails', async () => {
      mockStateStore.storeState.mockResolvedValue({
        ok: false,
        error: { code: 'STORE_ERROR', message: 'Redis down', retryable: true },
      });

      const result = await orchestrator.initiateConnection('bk-789', 'client-456', 'youtube');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STATE_STORE_FAILED');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('handleCallback', () => {
    const tokenSet = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: '2027-01-01T00:00:00Z',
      scopes: ['yt-analytics-monetary.readonly'],
      raw: {},
    };

    beforeEach(() => {
      mockStrategy.exchangeCodeForTokens.mockResolvedValue({ ok: true, value: tokenSet });
    });

    it('should create new connection and persist encrypted tokens on first callback', async () => {
      const result = await orchestrator.handleCallback({
        code: 'auth-code',
        state: 'valid-state',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.platform).toBe('youtube');
        expect(result.value.status).toBe('active');
      }
      expect(mockConnectionRepo.createConnection).toHaveBeenCalled();
      expect(mockConnectionRepo.saveTokens).toHaveBeenCalledWith(
        'conn-123',
        expect.objectContaining({
          accessToken: 'encrypted:access-token',
          refreshToken: 'encrypted:refresh-token',
        })
      );
    });

    it('should update existing connection status instead of creating duplicate', async () => {
      const existingConnection = makeConnection({ id: 'existing-conn' });
      mockConnectionRepo.findByClientAndPlatform.mockResolvedValue({
        ok: true,
        value: existingConnection,
      });
      mockConnectionRepo.updateStatus.mockResolvedValue({ ok: true, value: existingConnection });

      const result = await orchestrator.handleCallback({ code: 'code', state: 'state' });

      expect(result.ok).toBe(true);
      expect(mockConnectionRepo.createConnection).not.toHaveBeenCalled();
      expect(mockConnectionRepo.updateStatus).toHaveBeenCalledWith(
        'existing-conn',
        'active',
        tokenSet.expiresAt
      );
    });

    it('should return INVALID_STATE when CSRF state is not found (replay prevention)', async () => {
      mockStateStore.validateAndConsumeState.mockResolvedValue({
        ok: false,
        error: { code: 'STATE_NOT_FOUND', message: 'State not found', retryable: false },
      });

      const result = await orchestrator.handleCallback({ code: 'code', state: 'consumed-state' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE');
        // Verify token exchange was NOT called after state failure
        expect(mockStrategy.exchangeCodeForTokens).not.toHaveBeenCalled();
      }
    });

    it('should return TOKEN_EXCHANGE_FAILED when platform rejects the code', async () => {
      mockStrategy.exchangeCodeForTokens.mockResolvedValue({
        ok: false,
        error: { code: 'TOKEN_EXCHANGE_FAILED', message: 'invalid_grant', retryable: false },
      });

      const result = await orchestrator.handleCallback({ code: 'bad-code', state: 'state' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TOKEN_EXCHANGE_FAILED');
        expect(mockConnectionRepo.createConnection).not.toHaveBeenCalled();
      }
    });

    it('should handle provider-reported error in callback params', async () => {
      mockStrategy.exchangeCodeForTokens.mockResolvedValue({
        ok: false,
        error: { code: 'PROVIDER_ERROR', message: 'access_denied', retryable: false },
      });

      const result = await orchestrator.handleCallback({
        code: '',
        state: 'state',
        error: 'access_denied',
        errorDescription: 'User denied access',
      });

      expect(result.ok).toBe(false);
    });
  });

  describe('refreshToken', () => {
    it('should acquire lock, decrypt refresh token, call strategy, re-encrypt and update', async () => {
      const encryptedBundle = {
        accessToken: 'encrypted:old-access',
        refreshToken: 'encrypted:old-refresh',
      };
      const expiringConn = makeConnection({ id: 'conn-123' });
      mockConnectionRepo.getTokens.mockResolvedValue({ ok: true, value: encryptedBundle });
      mockConnectionRepo.findExpiringConnections.mockResolvedValue({ ok: true, value: [expiringConn] });
      mockStrategy.refreshAccessToken.mockResolvedValue({
        ok: true,
        value: {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresAt: '2027-06-01T00:00:00Z',
          scopes: ['yt-analytics-monetary.readonly'],
          raw: {},
        },
      });
      mockConnectionRepo.updateStatus.mockResolvedValue({ ok: true, value: expiringConn });

      const result = await orchestrator.refreshToken('conn-123');

      expect(result.ok).toBe(true);
      expect(mockLockService.withLock).toHaveBeenCalledWith(
        'oauth-refresh:conn-123',
        30_000,
        expect.any(Function)
      );
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('encrypted:old-refresh');
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('new-access');
      expect(mockConnectionRepo.saveTokens).toHaveBeenCalledWith(
        'conn-123',
        expect.objectContaining({ accessToken: 'encrypted:new-access' })
      );
    });

    it('should return LOCK_NOT_ACQUIRED when concurrent refresh is in progress', async () => {
      mockLockService.withLock.mockResolvedValue({
        ok: false,
        error: { code: 'LOCK_NOT_ACQUIRED', message: 'Lock held', retryable: true },
      });

      const result = await orchestrator.refreshToken('conn-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('LOCK_NOT_ACQUIRED');
        expect(result.error.retryable).toBe(true);
        expect(mockConnectionRepo.getTokens).not.toHaveBeenCalled();
      }
    });

    it('should return REFRESH_FAILED when no refresh token is stored', async () => {
      mockConnectionRepo.getTokens.mockResolvedValue({
        ok: true,
        value: { accessToken: 'encrypted:access' }, // no refreshToken
      });

      const result = await orchestrator.refreshToken('conn-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('REFRESH_FAILED');
        expect(result.error.retryable).toBe(false);
      }
    });
  });

  describe('disconnectPlatform', () => {
    it('should update status to inactive and log audit event', async () => {
      const result = await orchestrator.disconnectPlatform('conn-123', 'bk-789');

      expect(result.ok).toBe(true);
      expect(mockConnectionRepo.updateStatus).toHaveBeenCalledWith('conn-123', 'inactive');
    });

    it('should return UNEXPECTED error if updateStatus fails', async () => {
      mockConnectionRepo.updateStatus.mockResolvedValue({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Connection gone', retryable: false },
      });

      const result = await orchestrator.disconnectPlatform('ghost-conn', 'bk-789');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNEXPECTED');
      }
    });
  });
});
