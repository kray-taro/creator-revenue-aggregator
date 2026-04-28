import { PgTransactionRepository, type IPgClient } from './PgTransactionRepository';
import type { ITransaction } from '../../domain/entities/ITransaction';

describe('PgTransactionRepository', () => {
  let repository: PgTransactionRepository;
  let mockPgClient: jest.Mocked<IPgClient>;

  beforeEach(() => {
    mockPgClient = {
      query: jest.fn(),
    } as jest.Mocked<IPgClient>;
    repository = new PgTransactionRepository(mockPgClient);
  });

  describe('save', () => {
    const validTransaction: ITransaction = {
      id: 'txn-123',
      clientId: 'client-456',
      platform: 'youtube',
      platformTransactionId: 'yt-789',
      transactionDate: '2024-01-15',
      grossRevenue: 100.00,
      platformFee: 30.00,
      netPayout: 70.00,
      status: 'pending_review',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    };

    it('should successfully save a valid transaction', async () => {
      const mockRow = {
        id: validTransaction.id,
        client_id: validTransaction.clientId,
        source_platform: validTransaction.platform,
        platform_transaction_id: validTransaction.platformTransactionId,
        platform_id: null,
        transaction_date: validTransaction.transactionDate,
        gross_revenue: validTransaction.grossRevenue,
        platform_fee: validTransaction.platformFee,
        net_payout: validTransaction.netPayout,
        description: null,
        deduplication_hash: null,
        source_hierarchy: null,
        suggested_category: null,
        confidence_score: null,
        status: validTransaction.status,
        qb_account_id: null,
        qb_entry_id: null,
        qb_sync_status: null,
        synced_at: null,
        reviewed_by: null,
        reviewed_at: null,
        receipt_snapshot_url: null,
        created_at: validTransaction.createdAt,
        updated_at: validTransaction.createdAt,
      };

      mockPgClient.query.mockResolvedValue({
        rows: [mockRow],
        rowCount: 1,
      });

      const result = await repository.save(validTransaction);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(validTransaction.id);
        expect(result.value.grossRevenue).toBe(100.00);
      }
    });

    it('should return CRS_EQUATION_VIOLATION error when CHECK constraint fails', async () => {
      const invalidTransaction: ITransaction = {
        ...validTransaction,
        grossRevenue: 100.00,
        platformFee: 30.00,
        netPayout: 75.00, // This violates: gross - fee != net (100 - 30 = 70, not 75)
      };

      const postgresError = {
        code: '23514',
        constraint: 'transactions_crs_equation_check',
        detail: 'Failing row contains (gross_revenue=100.00, platform_fee=30.00, net_payout=75.00)',
        message: 'new row for relation "transactions" violates check constraint "transactions_crs_equation_check"',
      };

      mockPgClient.query.mockRejectedValue(postgresError);

      const result = await repository.save(invalidTransaction);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CRS_EQUATION_VIOLATION');
        expect(result.error.message).toContain('CRS equation');
        expect(result.error.message).toContain('gross_revenue - platform_fee - net_payout must be <= 0.01');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should return generic DB_ERROR for other PostgreSQL errors', async () => {
      const genericError = new Error('Connection timeout');

      mockPgClient.query.mockRejectedValue(genericError);

      const result = await repository.save(validTransaction);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DB_ERROR');
        expect(result.error.message).toBe('Connection timeout');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should return DUPLICATE_TRANSACTION_IGNORED when transaction already exists', async () => {
      mockPgClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repository.save(validTransaction);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DUPLICATE_TRANSACTION_IGNORED');
        expect(result.error.message).toContain('Duplicate transaction ignored');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should handle CHECK constraint violation with missing detail', async () => {
      const postgresError = {
        code: '23514',
        constraint: 'transactions_crs_equation_check',
        message: 'Check constraint violated',
      };

      mockPgClient.query.mockRejectedValue(postgresError);

      const result = await repository.save(validTransaction);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CRS_EQUATION_VIOLATION');
        expect(result.error.message).toContain('CRS equation');
      }
    });

    it('should return UNKNOWN error for non-Error objects', async () => {
      mockPgClient.query.mockRejectedValue('string error');

      const result = await repository.save(validTransaction);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN');
        expect(result.error.message).toBe('Unknown database error.');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('findById', () => {
    it('should return transaction when found', async () => {
      const mockRow = {
        id: 'txn-123',
        client_id: 'client-456',
        source_platform: 'youtube',
        platform_transaction_id: 'yt-789',
        platform_id: null,
        transaction_date: '2024-01-15',
        gross_revenue: '100.00',
        platform_fee: '30.00',
        net_payout: '70.00',
        description: null,
        deduplication_hash: null,
        source_hierarchy: null,
        suggested_category: null,
        confidence_score: null,
        status: 'pending_review',
        qb_account_id: null,
        qb_entry_id: null,
        qb_sync_status: null,
        synced_at: null,
        reviewed_by: null,
        reviewed_at: null,
        receipt_snapshot_url: null,
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      };

      mockPgClient.query.mockResolvedValue({
        rows: [mockRow],
        rowCount: 1,
      });

      const result = await repository.findById('txn-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('txn-123');
        expect(result.value.grossRevenue).toBe(100.00);
      }
    });

    it('should return NOT_FOUND error when transaction does not exist', async () => {
      mockPgClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repository.findById('non-existent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('Transaction not found');
      }
    });
  });

  describe('findByClientId', () => {
    it('should return array of transactions for client', async () => {
      const mockRows = [
        {
          id: 'txn-1',
          client_id: 'client-456',
          source_platform: 'youtube',
          platform_transaction_id: 'yt-1',
          platform_id: null,
          transaction_date: '2024-01-15',
          gross_revenue: '100.00',
          platform_fee: '30.00',
          net_payout: '70.00',
          description: null,
          deduplication_hash: null,
          source_hierarchy: null,
          suggested_category: null,
          confidence_score: null,
          status: 'pending_review',
          qb_account_id: null,
          qb_entry_id: null,
          qb_sync_status: null,
          synced_at: null,
          reviewed_by: null,
          reviewed_at: null,
          receipt_snapshot_url: null,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
      ];

      mockPgClient.query.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      const result = await repository.findByClientId('client-456');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].clientId).toBe('client-456');
      }
    });

    it('should return empty array when no transactions found', async () => {
      mockPgClient.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repository.findByClientId('client-456');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('saveBulk', () => {
    const validTransactions: ITransaction[] = [
      {
        id: 'txn-1',
        clientId: 'client-456',
        platform: 'youtube',
        platformTransactionId: 'yt-1',
        transactionDate: '2024-01-15',
        grossRevenue: 100.00,
        platformFee: 30.00,
        netPayout: 70.00,
        status: 'pending_review',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
      },
      {
        id: 'txn-2',
        clientId: 'client-456',
        platform: 'youtube',
        platformTransactionId: 'yt-2',
        transactionDate: '2024-01-16',
        grossRevenue: 200.00,
        platformFee: 60.00,
        netPayout: 140.00,
        status: 'pending_review',
        createdAt: '2024-01-16T10:00:00Z',
        updatedAt: '2024-01-16T10:00:00Z',
      },
    ];

    it('should successfully save multiple transactions in bulk', async () => {
      const mockRows = validTransactions.map(txn => ({
        id: txn.id,
        client_id: txn.clientId,
        source_platform: txn.platform,
        platform_transaction_id: txn.platformTransactionId,
        platform_id: null,
        transaction_date: txn.transactionDate,
        gross_revenue: txn.grossRevenue,
        platform_fee: txn.platformFee,
        net_payout: txn.netPayout,
        description: null,
        deduplication_hash: null,
        source_hierarchy: null,
        suggested_category: null,
        confidence_score: null,
        status: txn.status,
        qb_account_id: null,
        qb_entry_id: null,
        qb_sync_status: null,
        synced_at: null,
        reviewed_by: null,
        reviewed_at: null,
        receipt_snapshot_url: null,
        created_at: txn.createdAt,
        updated_at: txn.updatedAt,
      }));

      mockPgClient.query.mockResolvedValue({
        rows: mockRows,
        rowCount: 2,
      });

      const result = await repository.saveBulk(validTransactions);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].id).toBe('txn-1');
        expect(result.value[1].id).toBe('txn-2');
      }
    });

    it('should return empty array when saving empty array', async () => {
      const result = await repository.saveBulk([]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
      expect(mockPgClient.query).not.toHaveBeenCalled();
    });

    it('should return INVALID_INPUT error when any transaction has invalid platformTransactionId', async () => {
      const invalidTransactions: ITransaction[] = [
        ...validTransactions,
        {
          ...validTransactions[0],
          id: 'txn-3',
          platformTransactionId: '', // Invalid: empty
        },
      ];

      const result = await repository.saveBulk(invalidTransactions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_INPUT');
        expect(result.error.message).toContain('Bulk save validation failed');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should handle database errors during bulk save', async () => {
      const dbError = new Error('Connection timeout');
      mockPgClient.query.mockRejectedValue(dbError);

      const result = await repository.saveBulk(validTransactions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DB_ERROR');
        expect(result.error.message).toBe('Connection timeout');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle CRS equation violation during bulk save', async () => {
      const postgresError = {
        code: '23514',
        constraint: 'transactions_crs_equation_check',
        detail: 'Failing row contains invalid CRS equation',
        message: 'Check constraint violated',
      };

      mockPgClient.query.mockRejectedValue(postgresError);

      const result = await repository.saveBulk(validTransactions);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CRS_EQUATION_VIOLATION');
        expect(result.error.message).toContain('CRS equation');
      }
    });

    it('should return partial results when some transactions are duplicates', async () => {
      // Only one transaction is returned (the other was a duplicate)
      const mockRows = [
        {
          id: 'txn-1',
          client_id: 'client-456',
          source_platform: 'youtube',
          platform_transaction_id: 'yt-1',
          platform_id: null,
          transaction_date: '2024-01-15',
          gross_revenue: 100.00,
          platform_fee: 30.00,
          net_payout: 70.00,
          description: null,
          deduplication_hash: null,
          source_hierarchy: null,
          suggested_category: null,
          confidence_score: null,
          status: 'pending_review',
          qb_account_id: null,
          qb_entry_id: null,
          qb_sync_status: null,
          synced_at: null,
          reviewed_by: null,
          reviewed_at: null,
          receipt_snapshot_url: null,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
        },
      ];

      mockPgClient.query.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      const result = await repository.saveBulk(validTransactions);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('txn-1');
      }
    });
  });
});


