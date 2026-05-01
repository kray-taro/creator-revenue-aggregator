import { ClientOnboardingService } from './ClientOnboardingService';
import type { IClientRepository, IAuditLogger } from '@domain/ports';
import type { IClient } from '@domain/entities';

const makeClient = (overrides: Partial<IClient> = {}): IClient => ({
  id: 'client-123',
  bookkeeperId: 'bk-456',
  name: 'Acme Corp',
  email: 'acme@example.com',
  accountingMode: 'accrual',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('ClientOnboardingService', () => {
  let service: ClientOnboardingService;
  let mockClientRepo: jest.Mocked<IClientRepository>;
  let mockAuditLogger: jest.Mocked<IAuditLogger>;

  const BASE_URL = 'https://app.example.com';

  beforeEach(() => {
    mockClientRepo = {
      findById: jest.fn(),
      findByBookkeeperId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as jest.Mocked<IClientRepository>;

    mockAuditLogger = {
      log: jest.fn().mockResolvedValue({ ok: true, value: true }),
      sanitize: jest.fn().mockImplementation((d) => d),
    } as jest.Mocked<IAuditLogger>;

    service = new ClientOnboardingService(mockClientRepo, mockAuditLogger, BASE_URL);
  });

  describe('inviteClient', () => {
    it('should create client and return invite token with URL', async () => {
      const client = makeClient();
      mockClientRepo.create.mockResolvedValue({ ok: true, value: client });

      const result = await service.inviteClient({
        bookkeeperId: 'bk-456',
        clientName: 'Acme Corp',
        clientEmail: 'acme@example.com',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.client.email).toBe('acme@example.com');
        expect(result.value.inviteToken).toHaveLength(64); // 32 bytes = 64 hex chars
        expect(result.value.inviteUrl).toContain(`${BASE_URL}/invite/`);
        expect(result.value.inviteUrl).toContain(result.value.inviteToken);
      }
    });

    it('should create client with default accrual accounting mode', async () => {
      mockClientRepo.create.mockResolvedValue({ ok: true, value: makeClient() });

      await service.inviteClient({
        bookkeeperId: 'bk-456',
        clientName: 'New Client',
        clientEmail: 'new@example.com',
      });

      expect(mockClientRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ accountingMode: 'accrual' })
      );
    });

    it('should respect explicitly provided accountingMode', async () => {
      mockClientRepo.create.mockResolvedValue({
        ok: true,
        value: makeClient({ accountingMode: 'cash' }),
      });

      await service.inviteClient({
        bookkeeperId: 'bk-456',
        clientName: 'Cash Client',
        clientEmail: 'cash@example.com',
        accountingMode: 'cash',
      });

      expect(mockClientRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ accountingMode: 'cash' })
      );
    });

    it('should return DUPLICATE_EMAIL when client email already exists', async () => {
      mockClientRepo.create.mockResolvedValue({
        ok: false,
        error: { code: 'DUPLICATE_EMAIL', message: 'Email exists', retryable: false },
      });

      const result = await service.inviteClient({
        bookkeeperId: 'bk-456',
        clientName: 'Duplicate',
        clientEmail: 'existing@example.com',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DUPLICATE_EMAIL');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should log audit event on successful invite creation', async () => {
      mockClientRepo.create.mockResolvedValue({ ok: true, value: makeClient() });

      await service.inviteClient({
        bookkeeperId: 'bk-456',
        clientName: 'Acme Corp',
        clientEmail: 'acme@example.com',
      });

      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        'client-123',
        'CLIENT_INVITE_CREATED',
        'success',
        expect.objectContaining({ bookkeeperId: 'bk-456' })
      );
    });

    it('should generate unique tokens for each invite', async () => {
      mockClientRepo.create
        .mockResolvedValueOnce({ ok: true, value: makeClient({ id: 'c1' }) })
        .mockResolvedValueOnce({ ok: true, value: makeClient({ id: 'c2' }) });

      const first = await service.inviteClient({ bookkeeperId: 'bk-456', clientName: 'A', clientEmail: 'a@a.com' });
      const second = await service.inviteClient({ bookkeeperId: 'bk-456', clientName: 'B', clientEmail: 'b@b.com' });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(first.value.inviteToken).not.toBe(second.value.inviteToken);
      }
    });
  });

  describe('getClientsByBookkeeper', () => {
    it('should return all clients for a bookkeeper', async () => {
      const clients = [makeClient(), makeClient({ id: 'client-456', email: 'b@example.com' })];
      mockClientRepo.findByBookkeeperId.mockResolvedValue({ ok: true, value: clients });

      const result = await service.getClientsByBookkeeper('bk-456');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('should return DB_ERROR on repository failure', async () => {
      mockClientRepo.findByBookkeeperId.mockResolvedValue({
        ok: false,
        error: { code: 'DB_ERROR', message: 'Connection lost', retryable: true },
      });

      const result = await service.getClientsByBookkeeper('bk-456');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DB_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });
  });
});
