import type { ITransaction } from '../../domain/entities/ITransaction';
import type { ITransactionRepository, RepositoryError } from '../../domain/ports/ITransactionRepository';
import { failure, success, type Result } from '../../domain/shared/Result';

interface QueryResultRow {
  [key: string]: unknown;
}

interface QueryResult<T extends QueryResultRow> {
  readonly rows: T[];
  readonly rowCount?: number;
}

export interface IPgClient {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
}

interface TransactionRow extends QueryResultRow {
  id: string;
  client_id: string;
  source_platform: string;
  platform_transaction_id: string;
  platform_id: string | null;
  transaction_date: string;
  gross_revenue: string | number;
  platform_fee: string | number;
  net_payout: string | number;
  description: string | null;
  deduplication_hash: string | null;
  source_hierarchy: 'primary' | 'processor' | null;
  suggested_category: string | null;
  confidence_score: string | number | null;
  status: string;
  qb_account_id: string | null;
  qb_entry_id: string | null;
  qb_sync_status: string | null;
  synced_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  receipt_snapshot_url: string | null;
  created_at: string;
  updated_at: string;
}

export class PgTransactionRepository implements ITransactionRepository {
  constructor(private readonly pgClient: IPgClient) {}

  async save(transaction: ITransaction): Promise<Result<ITransaction, RepositoryError>> {
    const sql = `
      INSERT INTO transactions (
        id, client_id, source_platform, platform_transaction_id, platform_id, transaction_date,
        gross_revenue, platform_fee, net_payout,
        description, deduplication_hash, source_hierarchy, suggested_category, confidence_score, status,
        qb_account_id, qb_entry_id, qb_sync_status, synced_at, reviewed_by, reviewed_at,
        receipt_snapshot_url, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21,
        $22, $23, $24
      )
      ON CONFLICT (platform_transaction_id, source_platform)
      DO NOTHING
      RETURNING *;
    `;

    try {
      const now = new Date().toISOString();
      const params: readonly unknown[] = [
        transaction.id,
        transaction.clientId,
        transaction.platform,
        transaction.platformTransactionId,
        transaction.platformId ?? null,
        transaction.transactionDate,
        transaction.grossRevenue,
        transaction.platformFee,
        transaction.netPayout,
        transaction.description ?? null,
        transaction.deduplicationHash ?? null,
        transaction.sourceHierarchy ?? null,
        transaction.suggestedCategory ?? null,
        transaction.confidenceScore ?? null,
        transaction.status,
        transaction.qbAccountId ?? null,
        transaction.qbEntryId ?? null,
        transaction.qbSyncStatus ?? null,
        transaction.syncedAt ?? null,
        transaction.reviewedBy ?? null,
        transaction.reviewedAt ?? null,
        transaction.receiptSnapshotUrl ?? null,
        transaction.createdAt,
        transaction.updatedAt || now,
      ];

      const result = await this.pgClient.query<TransactionRow>(sql, params);

      if (!result.rows[0] || result.rowCount === 0) {
        return failure({
          code: 'DUPLICATE_TRANSACTION_IGNORED',
          message: `Duplicate transaction ignored for platform_transaction_id=${transaction.platformTransactionId}.`,
          retryable: false,
        });
      }

      return success(this.toDomain(result.rows[0]));
    } catch (error) {
      return failure(this.toRepositoryError(error));
    }
  }

  async findById(id: string): Promise<Result<ITransaction, RepositoryError>> {
    const sql = 'SELECT * FROM transactions WHERE id = $1 LIMIT 1;';

    try {
      const result = await this.pgClient.query<TransactionRow>(sql, [id]);

      if (result.rows.length === 0) {
        return failure({
          code: 'NOT_FOUND',
          message: `Transaction not found for id=${id}.`,
          retryable: false,
        });
      }

      return success(this.toDomain(result.rows[0]));
    } catch (error) {
      return failure(this.toRepositoryError(error));
    }
  }

  async findByClientId(clientId: string): Promise<Result<ITransaction[], RepositoryError>> {
    const sql = 'SELECT * FROM transactions WHERE client_id = $1 ORDER BY transaction_date DESC;';

    try {
      const result = await this.pgClient.query<TransactionRow>(sql, [clientId]);
      return success(result.rows.map((row) => this.toDomain(row)));
    } catch (error) {
      return failure(this.toRepositoryError(error));
    }
  }

  private toDomain(row: TransactionRow): ITransaction {
    return {
      id: row.id,
      clientId: row.client_id,
      platform: row.source_platform as ITransaction['platform'],
      platformTransactionId: row.platform_transaction_id,
      platformId: row.platform_id ?? undefined,
      transactionDate: row.transaction_date,
      grossRevenue: Number(row.gross_revenue),
      platformFee: Number(row.platform_fee),
      netPayout: Number(row.net_payout),
      description: row.description ?? undefined,
      deduplicationHash: row.deduplication_hash ?? undefined,
      sourceHierarchy: row.source_hierarchy ?? undefined,
      suggestedCategory: row.suggested_category ?? undefined,
      confidenceScore: row.confidence_score == null ? undefined : Number(row.confidence_score),
      status: row.status as ITransaction['status'],
      qbAccountId: row.qb_account_id ?? undefined,
      qbEntryId: row.qb_entry_id ?? undefined,
      qbSyncStatus: (row.qb_sync_status as ITransaction['qbSyncStatus']) ?? undefined,
      syncedAt: row.synced_at ?? undefined,
      reviewedBy: row.reviewed_by ?? undefined,
      reviewedAt: row.reviewed_at ?? undefined,
      receiptSnapshotUrl: row.receipt_snapshot_url ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toRepositoryError(error: unknown): RepositoryError {
    if (error instanceof Error) {
      return {
        code: 'DB_ERROR',
        message: error.message,
        retryable: true,
      };
    }

    return {
      code: 'UNKNOWN',
      message: 'Unknown database error.',
      retryable: true,
    };
  }
}
