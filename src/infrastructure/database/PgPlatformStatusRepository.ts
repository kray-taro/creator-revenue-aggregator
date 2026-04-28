import type { PlatformName } from '../../domain/entities/ITransaction';
import type {
  IPlatformStatusRepository,
  PlatformHealthStatus,
  PlatformStatusRecord,
  PlatformStatusRepositoryError,
} from '../../domain/ports/IPlatformStatusRepository';
import { failure, success, type Result } from '../../domain/shared/Result';
import type { IPgClient } from './PgTransactionRepository';

interface PlatformStatusRow {
  client_id: string;
  platform: string;
  status: PlatformHealthStatus;
  last_error: string | null;
  updated_at: string;
}

export class PgPlatformStatusRepository implements IPlatformStatusRepository {
  constructor(private readonly pgClient: IPgClient) {}

  async updateStatus(
    clientId: string,
    platform: PlatformName,
    status: PlatformHealthStatus,
    lastError?: string
  ): Promise<Result<PlatformStatusRecord, PlatformStatusRepositoryError>> {
    const sql = `
      INSERT INTO platform_statuses (client_id, platform, status, last_error, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (client_id, platform)
      DO UPDATE SET
        status = EXCLUDED.status,
        last_error = EXCLUDED.last_error,
        updated_at = NOW()
      RETURNING client_id, platform, status, last_error, updated_at;
    `;

    try {
      const result = await this.pgClient.query<PlatformStatusRow>(sql, [
        clientId,
        platform,
        status,
        lastError ?? null,
      ]);

      const row = result.rows[0];
      return success({
        clientId: row.client_id,
        platform: row.platform as PlatformName,
        status: row.status,
        lastError: row.last_error ?? undefined,
        updatedAt: row.updated_at,
      });
    } catch (error) {
      if (error instanceof Error) {
        return failure({
          code: 'DB_ERROR',
          message: error.message,
          retryable: true,
        });
      }

      return failure({
        code: 'UNKNOWN',
        message: 'Unknown platform status repository error.',
        retryable: true,
      });
    }
  }
}
