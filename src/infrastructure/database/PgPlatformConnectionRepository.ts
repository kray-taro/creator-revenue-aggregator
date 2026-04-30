import type {
  IPlatformConnectionRepository,
  PlatformConnection,
  PlatformConnectionRepositoryError,
  PlatformTokenBundle,
  IEncryptionService,
  CreateConnectionInput
} from '@domain/ports';
import { failure, success, type Result } from '@domain/shared';
import type { IPgClient } from './PgTransactionRepository';

interface PlatformConnectionRow {
  id: string;
  client_id: string;
  platform: PlatformConnection['platform'];
  status: PlatformConnection['status'];
  expires_at: string | null;
  scopes: string[] | null;
  platform_user_id: string | null;
  last_health_check_at: string | null;
  token_refreshed_at: string | null;
  [key: string]: unknown;
}

interface PlatformTokenRow {
  encrypted_token: Buffer | null;
  [key: string]: unknown;
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
      SELECT pc.id, pc.client_id, pc.platform, pc.status, pc.expires_at,
             pc.scopes, pc.platform_user_id, pc.last_health_check_at, pc.token_refreshed_at
      FROM platform_connections pc
      INNER JOIN clients c ON c.id = pc.client_id
      WHERE pc.client_id = $1 AND pc.status = 'active'
      ORDER BY pc.platform ASC;
    `;

    try {
      const result = await this.pgClient.query<PlatformConnectionRow>(sql, [clientId]);
      return success(result.rows.map(row => this.toEntity(row)));
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
          token_refreshed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1;
    `;

    try {
      const result = await this.pgClient.query(sql, [
        connectionId,
        Buffer.from(encrypted, 'utf8'),
        tokenIv ?? null,
      ]);
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

  async getTokens(
    connectionId: string
  ): Promise<Result<PlatformTokenBundle, PlatformConnectionRepositoryError>> {
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

  async createConnection(
    input: CreateConnectionInput
  ): Promise<Result<PlatformConnection, PlatformConnectionRepositoryError>> {
    const sql = `
      INSERT INTO platform_connections
        (id, client_id, platform, status, expires_at, scopes, platform_user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id, client_id, platform, status, expires_at, scopes,
                platform_user_id, last_health_check_at, token_refreshed_at;
    `;

    try {
      const result = await this.pgClient.query<PlatformConnectionRow>(sql, [
        input.id,
        input.clientId,
        input.platform,
        input.status,
        input.expiresAt ?? null,
        input.scopes ? [...input.scopes] : null,
        input.platformUserId ?? null,
      ]);

      const row = result.rows[0];
      if (!row) {
        return failure({ code: 'DB_ERROR', message: 'Insert returned no row.', retryable: false });
      }
      return success(this.toEntity(row));
    } catch (error) {
      if (this.isDuplicateConnectionError(error)) {
        return failure({
          code: 'DUPLICATE_CONNECTION',
          message: `A connection for platform ${input.platform} already exists for client ${input.clientId}.`,
          retryable: false,
        });
      }
      return failure(this.toError(error));
    }
  }

  async updateStatus(
    connectionId: string,
    status: PlatformConnection['status'],
    expiresAt?: string
  ): Promise<Result<PlatformConnection, PlatformConnectionRepositoryError>> {
    const sql = `
      UPDATE platform_connections
      SET status = $2,
          expires_at = COALESCE($3, expires_at),
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, client_id, platform, status, expires_at, scopes,
                platform_user_id, last_health_check_at, token_refreshed_at;
    `;

    try {
      const result = await this.pgClient.query<PlatformConnectionRow>(sql, [
        connectionId,
        status,
        expiresAt ?? null,
      ]);

      const row = result.rows[0];
      if (!row) {
        return failure({
          code: 'NOT_FOUND',
          message: `Platform connection not found: ${connectionId}`,
          retryable: false,
        });
      }
      return success(this.toEntity(row));
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  async findByClientAndPlatform(
    clientId: string,
    platform: PlatformConnection['platform']
  ): Promise<Result<PlatformConnection | null, PlatformConnectionRepositoryError>> {
    const sql = `
      SELECT id, client_id, platform, status, expires_at, scopes,
             platform_user_id, last_health_check_at, token_refreshed_at
      FROM platform_connections
      WHERE client_id = $1 AND platform = $2
      LIMIT 1;
    `;

    try {
      const result = await this.pgClient.query<PlatformConnectionRow>(sql, [clientId, platform]);
      const row = result.rows[0];
      return success(row ? this.toEntity(row) : null);
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  async findExpiringConnections(
    withinDays: number
  ): Promise<Result<PlatformConnection[], PlatformConnectionRepositoryError>> {
    const sql = `
      SELECT id, client_id, platform, status, expires_at, scopes,
             platform_user_id, last_health_check_at, token_refreshed_at
      FROM platform_connections
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at <= NOW() + ($1 || ' days')::INTERVAL
      ORDER BY expires_at ASC;
    `;

    try {
      const result = await this.pgClient.query<PlatformConnectionRow>(sql, [String(withinDays)]);
      return success(result.rows.map(row => this.toEntity(row)));
    } catch (error) {
      return failure(this.toError(error));
    }
  }

  private toEntity(row: PlatformConnectionRow): PlatformConnection {
    return {
      id: row.id,
      clientId: row.client_id,
      platform: row.platform,
      status: row.status,
      expiresAt: row.expires_at ?? undefined,
      scopes: row.scopes ?? undefined,
      platformUserId: row.platform_user_id ?? undefined,
      lastHealthCheckAt: row.last_health_check_at ?? undefined,
      tokenRefreshedAt: row.token_refreshed_at ?? undefined,
    };
  }

  private isDuplicateConnectionError(error: unknown): boolean {
    return error instanceof Error &&
      error.message.includes('duplicate key') &&
      error.message.includes('client_id');
  }

  private toError(error: unknown): PlatformConnectionRepositoryError {
    if (error instanceof Error) {
      return { code: 'DB_ERROR', message: error.message, retryable: true };
    }
    return { code: 'UNKNOWN', message: 'Unknown platform connection repository error.', retryable: true };
  }
}
