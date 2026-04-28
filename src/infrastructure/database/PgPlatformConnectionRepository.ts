import type {
  IPlatformConnectionRepository,
  PlatformConnection,
  PlatformConnectionRepositoryError,
  PlatformTokenBundle,
} from '../../domain/ports/IPlatformConnectionRepository';
import type { IEncryptionService } from '../../domain/ports/IEncryptionService';
import { failure, success, type Result } from '../../domain/shared/Result';
import type { IPgClient } from './PgTransactionRepository';

interface PlatformConnectionRow {
  id: string;
  client_id: string;
  platform: PlatformConnection['platform'];
  status: PlatformConnection['status'];
  expires_at: string | null;
}

interface PlatformTokenRow {
  encrypted_token: Buffer | null;
}

export class PgPlatformConnectionRepository implements IPlatformConnectionRepository {
  constructor(
    private readonly pgClient: IPgClient,
    private readonly encryptionService: IEncryptionService
  ) {}

  async findActiveByClientId(
    clientId: string
  ): Promise<Result<PlatformConnection[], PlatformConnectionRepositoryError>> {
    const sql = `
      SELECT pc.id, pc.client_id, pc.platform, pc.status, pc.expires_at
      FROM platform_connections pc
      INNER JOIN clients c ON c.id = pc.client_id
      WHERE pc.client_id = $1 AND pc.status = 'active'
      ORDER BY pc.platform ASC;
    `;

    try {
      const result = await this.pgClient.query<PlatformConnectionRow>(sql, [clientId]);
      return success(
        result.rows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          platform: row.platform,
          status: row.status,
          expiresAt: row.expires_at ?? undefined,
        }))
      );
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  async saveTokens(
    connectionId: string,
    tokens: PlatformTokenBundle
  ): Promise<Result<boolean, PlatformConnectionRepositoryError>> {
    const payload = JSON.stringify(tokens);
    const encrypted = this.encryptionService.encrypt(payload);
    const [tokenIv] = encrypted.split('.');

    const sql = `
      UPDATE platform_connections
      SET encrypted_token = $2::bytea,
          token_iv = $3,
          updated_at = NOW()
      WHERE id = $1;
    `;

    try {
      const result = await this.pgClient.query(sql, [connectionId, Buffer.from(encrypted, 'utf8'), tokenIv ?? null]);
      const rowCount = result.rowCount ?? 0;
      if (rowCount === 0) {
        return failure({
          code: 'NOT_FOUND',
          message: `Platform connection not found for id=${connectionId}.`,
          retryable: false,
        });
      }

      return success(true);
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  async getTokens(connectionId: string): Promise<Result<PlatformTokenBundle, PlatformConnectionRepositoryError>> {
    const sql = `
      SELECT encrypted_token
      FROM platform_connections
      WHERE id = $1
      LIMIT 1;
    `;

    try {
      const result = await this.pgClient.query<PlatformTokenRow>(sql, [connectionId]);
      const row = result.rows[0];

      if (!row || !row.encrypted_token) {
        return failure({
          code: 'NOT_FOUND',
          message: `Encrypted tokens not found for connection id=${connectionId}.`,
          retryable: false,
        });
      }

      const decrypted = this.encryptionService.decrypt(row.encrypted_token.toString('utf8'));
      return success(JSON.parse(decrypted) as PlatformTokenBundle);
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  private toError(error: unknown): PlatformConnectionRepositoryError {
    if (error instanceof Error) {
      return {
        code: 'DB_ERROR',
        message: error.message,
        retryable: true,
      };
    }

    return {
      code: 'UNKNOWN',
      message: 'Unknown platform connection repository error.',
      retryable: true,
    };
  }
}
