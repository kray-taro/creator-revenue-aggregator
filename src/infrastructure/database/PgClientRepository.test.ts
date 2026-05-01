import { PgClientRepository } from './PgClientRepository';
import type { IPgClient } from './PgTransactionRepository';

describe('PgClientRepository', () => {
  let repository: PgClientRepository;
  let mockPgClient: jest.Mocked<IPgClient>;

  const mockClientRow = {
    id: 'client-123',
    bookkeeper_id: 'bk-456',
    name: 'Acme Corp',
    email: 'acme@example.com',
    accounting_mode: 'accrual' as const,
    qb_company_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    mockPgClient = { query: jest.fn() } as jest.Mocked<IPgClient>;
    repository = new PgClientRepository(mockPgClient);
  });

  describe('findById', () => {
    it('should return client when found', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [mockClientRow], rowCount: 1 });

      const result = await repository.findById('client-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('client-123');
        expect(result.value.bookkeeperId).toBe('bk-456');
        expect(result.value.name).toBe('Acme Corp');
      }
    });

    it('should return NOT_FOUND when client does not exist', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await repository.findById('non-existent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should return DB_ERROR on query failure', async () => {
      mockPgClient.query.mockRejectedValue(new Error('Connection lost'));

      const result = await repository.findById('client-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DB_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('findByBookkeeperId', () => {
    it('should return all clients for a bookkeeper', async () => {
      mockPgClient.query.mockResolvedValue({
        rows: [mockClientRow, { ...mockClientRow, id: 'client-456', name: 'Beta LLC' }],
        rowCount: 2,
      });

      const result = await repository.findByBookkeeperId('bk-456');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].bookkeeperId).toBe('bk-456');
      }
    });

    it('should return empty array when bookkeeper has no clients', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await repository.findByBookkeeperId('bk-no-clients');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('create', () => {
    it('should create and return a new client', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [mockClientRow], rowCount: 1 });

      const result = await repository.create({
        id: 'client-123',
        bookkeeperId: 'bk-456',
        name: 'Acme Corp',
        email: 'acme@example.com',
        accountingMode: 'accrual',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('client-123');
        expect(result.value.email).toBe('acme@example.com');
      }
    });

    it('should return DUPLICATE_EMAIL when email constraint is violated', async () => {
      const pgError = new Error('duplicate key value violates unique constraint "clients_email_key"');
      mockPgClient.query.mockRejectedValue(pgError);

      const result = await repository.create({
        id: 'new-id',
        bookkeeperId: 'bk-456',
        name: 'Clone Corp',
        email: 'acme@example.com', // already exists
        accountingMode: 'cash',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DUPLICATE_EMAIL');
        expect(result.error.retryable).toBe(false);
      }
    });
  });

  describe('update', () => {
    it('should update client name and return updated entity', async () => {
      const updatedRow = { ...mockClientRow, name: 'Acme Inc', updated_at: '2026-06-01T00:00:00Z' };
      mockPgClient.query.mockResolvedValue({ rows: [updatedRow], rowCount: 1 });

      const result = await repository.update('client-123', { name: 'Acme Inc' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Acme Inc');
      }
    });

    it('should return NOT_FOUND when client to update does not exist', async () => {
      mockPgClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await repository.update('ghost-id', { name: 'Ghost' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });
});
