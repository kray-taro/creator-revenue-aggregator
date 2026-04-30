import type { PlatformName } from '../entities/ITransaction';
import type { Result } from '../shared/Result';

export interface PlatformConnection {
  readonly id: string;
  readonly clientId: string;
  readonly platform: PlatformName;
  readonly status: 'active' | 'inactive' | 'expired' | 'error';
  readonly expiresAt?: string;
  readonly scopes?: readonly string[];
  readonly platformUserId?: string;
  readonly lastHealthCheckAt?: string;
  readonly tokenRefreshedAt?: string;
}

export interface PlatformTokenBundle {
  readonly accessToken: string;
  readonly refreshToken?: string;
}

export interface CreateConnectionInput {
  readonly id: string;
  readonly clientId: string;
  readonly platform: PlatformName;
  readonly status: PlatformConnection['status'];
  readonly expiresAt?: string;
  readonly scopes?: readonly string[];
  readonly platformUserId?: string;
}

export interface PlatformConnectionRepositoryError {
  readonly code: 'NOT_FOUND' | 'DUPLICATE_CONNECTION' | 'DB_ERROR' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

export interface IPlatformConnectionRepository {
  findById(connectionId: string): Promise<Result<PlatformConnection, PlatformConnectionRepositoryError>>;
  findActiveByClientId(clientId: string): Promise<Result<PlatformConnection[], PlatformConnectionRepositoryError>>;
  saveTokens(connectionId: string, tokens: PlatformTokenBundle): Promise<Result<boolean, PlatformConnectionRepositoryError>>;
  getTokens(connectionId: string): Promise<Result<PlatformTokenBundle, PlatformConnectionRepositoryError>>;

  /**
   * Creates a new platform connection record.
   * Returns DUPLICATE_CONNECTION if (client_id, platform) already exists.
   */
  createConnection(input: CreateConnectionInput): Promise<Result<PlatformConnection, PlatformConnectionRepositoryError>>;

  /**
   * Updates the status (and optionally expiresAt) of a connection.
   */
  updateStatus(
    connectionId: string,
    status: PlatformConnection['status'],
    expiresAt?: string
  ): Promise<Result<PlatformConnection, PlatformConnectionRepositoryError>>;

  /**
   * Finds a connection by composite key (clientId, platform). Returns null if not found.
   */
  findByClientAndPlatform(
    clientId: string,
    platform: PlatformName
  ): Promise<Result<PlatformConnection | null, PlatformConnectionRepositoryError>>;

  /**
   * Finds all active connections expiring within `withinDays` days.
   * Used by OAuth health monitoring.
   */
  findExpiringConnections(withinDays: number): Promise<Result<PlatformConnection[], PlatformConnectionRepositoryError>>;
}
