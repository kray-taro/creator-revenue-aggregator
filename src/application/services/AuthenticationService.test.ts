import { AuthenticationService } from './AuthenticationService';
import type { IBookkeeperRepository, IAuthService, IAuditLogger, AuthTokenPair } from '@domain/ports';
import type { IBookkeeper } from '@domain/entities';
import type { PasswordService } from '@infrastructure/auth/PasswordService';

const makeBookkeeper = (overrides: Partial<IBookkeeper> = {}): IBookkeeper => ({
  id: 'bk-123',
  email: 'bookkeeper@example.com',
  name: 'Jane Smith',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeTokenPair = (): AuthTokenPair => ({
  accessToken: 'header.payload.sig',
  refreshToken: 'opaque-refresh-token',
  accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
  refreshExpiresAt: new Date(Date.now() + 604_800_000).toISOString(),
});

describe('AuthenticationService', () => {
  let service: AuthenticationService;
  let mockBookkeeperRepo: jest.Mocked<IBookkeeperRepository> & { findPasswordHash: jest.Mock };
  let mockPasswordService: jest.Mocked<PasswordService>;
  let mockAuthService: jest.Mocked<IAuthService>;
  let mockAuditLogger: jest.Mocked<IAuditLogger>;

  beforeEach(() => {
    mockBookkeeperRepo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      findPasswordHash: jest.fn(),
    } as any;

    mockPasswordService = {
      hash: jest.fn().mockResolvedValue('scrypt:salt:hash'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<PasswordService>;

    mockAuthService = {
      generateTokenPair: jest.fn().mockResolvedValue({ ok: true, value: makeTokenPair() }),
      verifyAccessToken: jest.fn(),
      refreshTokenPair: jest.fn(),
      revokeRefreshToken: jest.fn(),
    } as jest.Mocked<IAuthService>;

    mockAuditLogger = {
      log: jest.fn().mockResolvedValue({ ok: true, value: true }),
      sanitize: jest.fn().mockImplementation((d) => d),
    } as jest.Mocked<IAuditLogger>;

    service = new AuthenticationService(
      mockBookkeeperRepo,
      mockPasswordService,
      mockAuthService,
      mockAuditLogger
    );
  });

  describe('register', () => {
    it('should hash password, create bookkeeper, and return token pair', async () => {
      mockBookkeeperRepo.findByEmail.mockResolvedValue({ ok: true, value: null });
      mockBookkeeperRepo.create.mockResolvedValue({ ok: true, value: makeBookkeeper() });

      const result = await service.register({
        email: 'bookkeeper@example.com',
        name: 'Jane Smith',
        password: 'secure-password-123',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.bookkeeper.email).toBe('bookkeeper@example.com');
        expect(result.value.tokens.accessToken).toBeDefined();
      }
      expect(mockPasswordService.hash).toHaveBeenCalledWith('secure-password-123');
      expect(mockBookkeeperRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'bookkeeper@example.com',
          name: 'Jane Smith',
          passwordHash: 'scrypt:salt:hash',
        })
      );
    });

    it('should return DUPLICATE_EMAIL when email already exists', async () => {
      mockBookkeeperRepo.findByEmail.mockResolvedValue({
        ok: true,
        value: makeBookkeeper(), // email exists
      });

      const result = await service.register({
        email: 'bookkeeper@example.com',
        name: 'Clone',
        password: 'password',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DUPLICATE_EMAIL');
        expect(mockBookkeeperRepo.create).not.toHaveBeenCalled();
      }
    });

    it('should return DUPLICATE_EMAIL even on concurrent insert race (DB constraint)', async () => {
      mockBookkeeperRepo.findByEmail.mockResolvedValue({ ok: true, value: null });
      mockBookkeeperRepo.create.mockResolvedValue({
        ok: false,
        error: { code: 'DUPLICATE_EMAIL', message: 'Duplicate email', retryable: false },
      });

      const result = await service.register({
        email: 'race@example.com',
        name: 'Race Condition',
        password: 'password',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DUPLICATE_EMAIL');
      }
    });
  });

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      mockBookkeeperRepo.findByEmail.mockResolvedValue({ ok: true, value: makeBookkeeper() });
      mockBookkeeperRepo.findPasswordHash.mockResolvedValue({ ok: true, value: 'scrypt:salt:hash' });
      mockPasswordService.verify.mockResolvedValue(true);

      const result = await service.login({
        email: 'bookkeeper@example.com',
        password: 'correct-password',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.bookkeeper.id).toBe('bk-123');
        expect(result.value.tokens.refreshToken).toBe('opaque-refresh-token');
      }
    });

    it('should return INVALID_CREDENTIALS for wrong password (not exposing which field)', async () => {
      mockBookkeeperRepo.findByEmail.mockResolvedValue({ ok: true, value: makeBookkeeper() });
      mockBookkeeperRepo.findPasswordHash.mockResolvedValue({ ok: true, value: 'scrypt:salt:hash' });
      mockPasswordService.verify.mockResolvedValue(false);

      const result = await service.login({
        email: 'bookkeeper@example.com',
        password: 'wrong-password',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_CREDENTIALS');
        // Must NOT reveal which field was wrong (prevents email enumeration)
        expect(result.error.message).toBe('Invalid email or password.');
      }
    });

    it('should return INVALID_CREDENTIALS for unknown email (generic message)', async () => {
      mockBookkeeperRepo.findByEmail.mockResolvedValue({ ok: true, value: null });

      const result = await service.login({
        email: 'nobody@example.com',
        password: 'password',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_CREDENTIALS');
        expect(result.error.message).toBe('Invalid email or password.');
        // Verify password check is NEVER called for unknown email
        expect(mockPasswordService.verify).not.toHaveBeenCalled();
      }
    });

    it('should log a failed login attempt to audit logger', async () => {
      mockBookkeeperRepo.findByEmail.mockResolvedValue({ ok: true, value: makeBookkeeper() });
      mockBookkeeperRepo.findPasswordHash.mockResolvedValue({ ok: true, value: 'scrypt:salt:hash' });
      mockPasswordService.verify.mockResolvedValue(false);

      await service.login({ email: 'bookkeeper@example.com', password: 'wrong' });

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        'bk-123',
        'BOOKKEEPER_LOGIN_FAILED',
        'failure',
        expect.objectContaining({ reason: 'invalid_password' })
      );
    });
  });

  describe('refreshSession', () => {
    it('should return new token pair on valid refresh token', async () => {
      mockAuthService.refreshTokenPair.mockResolvedValue({ ok: true, value: makeTokenPair() });

      const result = await service.refreshSession('valid-refresh-token');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBeDefined();
      }
    });

    it('should return INVALID_CREDENTIALS when refresh token is revoked', async () => {
      mockAuthService.refreshTokenPair.mockResolvedValue({
        ok: false,
        error: { code: 'REFRESH_TOKEN_REVOKED', message: 'Token revoked', retryable: false },
      });

      const result = await service.refreshSession('revoked-token');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_CREDENTIALS');
      }
    });
  });

  describe('logout', () => {
    it('should revoke refresh token and return success', async () => {
      mockAuthService.revokeRefreshToken.mockResolvedValue({ ok: true, value: true });

      const result = await service.logout('refresh-token');

      expect(result.ok).toBe(true);
      expect(mockAuthService.revokeRefreshToken).toHaveBeenCalledWith('refresh-token');
    });
  });
});
