import * as crypto from 'crypto';
import { failure, success, type Result } from '@domain/shared';
import type {
  IPlatformConnectionRepository,
  IOAuthStateStore,
  IEncryptionService,
  IDistributedLockService,
  IAuditLogger,
  PlatformConnection,
  CreateConnectionInput,
  OAuthCallbackParams
} from '@domain/ports';
import type { PlatformName } from '@domain/entities';
import type { OAuthStrategyFactory } from '@infrastructure/oauth/OAuthStrategyFactory';
import { OAuthAuditService } from './OAuthAuditService';

export interface InitiateConnectionResult {
  readonly authorizationUrl: string;
  readonly state: string;
}

export interface OAuthOrchestratorError {
  readonly code:
  | 'UNSUPPORTED_PLATFORM'
  | 'STATE_STORE_FAILED'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'INVALID_STATE'
  | 'CONNECTION_PERSIST_FAILED'
  | 'REFRESH_FAILED'
  | 'LOCK_NOT_ACQUIRED'
  | 'UNEXPECTED';
  readonly message: string;
  readonly retryable: boolean;
}

export interface ILogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const OAUTH_REFRESH_LOCK_TTL_MS = 30_000; // 30 seconds
const STATE_TTL_MS = 600_000; // 10 minutes

/**
 * Application-layer coordinator for the OAuth lifecycle.
 * Follows GRASP Controller pattern — delegates to strategies, repositories, stores.
 *
 * Race condition guards:
 * - initiateConnection: crypto.randomUUID() state is unique per call.
 * - handleCallback: IOAuthStateStore.validateAndConsumeState() is atomic (Lua GET+DEL).
 * - refreshToken: IDistributedLockService.withLock() prevents concurrent refresh
 *   of the same connection (avoids invalid_grant from double-refresh).
 * - createConnection: UNIQUE constraint on (client_id, platform) is the final guard.
 */
export class OAuthOrchestrator {
  private readonly auditService: OAuthAuditService;

  constructor(
    private readonly strategyFactory: OAuthStrategyFactory,
    private readonly stateStore: IOAuthStateStore,
    private readonly connectionRepo: IPlatformConnectionRepository,
    private readonly encryptionService: IEncryptionService,
    private readonly lockService: IDistributedLockService,
    private readonly logger: ILogger,
    auditLogger: IAuditLogger
  ) {
    this.auditService = new OAuthAuditService(auditLogger);
  }

  /**
   * Step 1: Bookkeeper initiates OAuth connection for a client platform.
   * Returns the authorization URL for the client to visit.
   */
  async initiateConnection(
    bookkeeperId: string,
    clientId: string,
    platform: PlatformName
  ): Promise<Result<InitiateConnectionResult, OAuthOrchestratorError>> {
    const strategy = this.strategyFactory.getStrategy(platform);
    if (!strategy) {
      return failure({
        code: 'UNSUPPORTED_PLATFORM',
        message: `No OAuth strategy registered for platform: ${platform}`,
        retryable: false,
      });
    }

    const state = crypto.randomUUID();
    const storeResult = await this.stateStore.storeState(
      state,
      { clientId, platform, bookkeeperId, createdAt: new Date().toISOString() },
      STATE_TTL_MS
    );

    if (!storeResult.ok) {
      this.logger.error('Failed to store OAuth state', { clientId, platform, error: storeResult.error });
      return failure({
        code: 'STATE_STORE_FAILED',
        message: storeResult.error.message,
        retryable: storeResult.error.retryable,
      });
    }

    const urlResult = strategy.buildAuthorizationUrl(state);
    if (!urlResult.ok) {
      return failure({
        code: 'UNEXPECTED',
        message: urlResult.error.message,
        retryable: false,
      });
    }

    await this.auditService.logConnectionInitiated(bookkeeperId, clientId, platform);
    this.logger.info('OAuth connection initiated', { bookkeeperId, clientId, platform });

    return success({ authorizationUrl: urlResult.value.url, state });
  }

  /**
   * Step 2: Platform redirects back with authorization code.
   * Validates CSRF state (atomic consume), exchanges code, encrypts tokens, persists connection.
   */
  async handleCallback(
    callbackParams: OAuthCallbackParams
  ): Promise<Result<PlatformConnection, OAuthOrchestratorError>> {
    // Atomic state validation — prevents double-callback replay
    const stateResult = await this.stateStore.validateAndConsumeState(callbackParams.state);
    if (!stateResult.ok) {
      return failure({
        code: 'INVALID_STATE',
        message: stateResult.error.message,
        retryable: false,
      });
    }

    const { clientId, platform, bookkeeperId } = stateResult.value;
    const strategy = this.strategyFactory.getStrategy(platform);

    if (!strategy) {
      return failure({
        code: 'UNSUPPORTED_PLATFORM',
        message: `No OAuth strategy for platform: ${platform}`,
        retryable: false,
      });
    }

    const tokenResult = await strategy.exchangeCodeForTokens(callbackParams);
    if (!tokenResult.ok) {
      await this.auditService.logTokenExchangeFailure(clientId, platform, tokenResult.error.code);
      this.logger.error('Token exchange failed', { clientId, platform, error: tokenResult.error });
      return failure({
        code: 'TOKEN_EXCHANGE_FAILED',
        message: tokenResult.error.message,
        retryable: tokenResult.error.retryable,
      });
    }

    const tokenSet = tokenResult.value;

    // Check for existing connection (upsert pattern)
    const existingResult = await this.connectionRepo.findByClientAndPlatform(clientId, platform);
    if (!existingResult.ok) {
      return failure({
        code: 'CONNECTION_PERSIST_FAILED',
        message: existingResult.error.message,
        retryable: existingResult.error.retryable,
      });
    }

    let connection: PlatformConnection;

    if (existingResult.value) {
      // Update existing connection status and expiry
      const updateResult = await this.connectionRepo.updateStatus(
        existingResult.value.id,
        'active',
        tokenSet.expiresAt
      );
      if (!updateResult.ok) {
        return failure({
          code: 'CONNECTION_PERSIST_FAILED',
          message: updateResult.error.message,
          retryable: updateResult.error.retryable,
        });
      }
      connection = updateResult.value;
    } else {
      // Create new connection
      const createInput: CreateConnectionInput = {
        id: crypto.randomUUID(),
        clientId,
        platform,
        status: 'active',
        expiresAt: tokenSet.expiresAt,
        scopes: tokenSet.scopes,
      };

      const createResult = await this.connectionRepo.createConnection(createInput);
      if (!createResult.ok) {
        return failure({
          code: 'CONNECTION_PERSIST_FAILED',
          message: createResult.error.message,
          retryable: createResult.error.retryable,
        });
      }
      connection = createResult.value;
    }

    // Persist encrypted tokens
    const saveResult = await this.connectionRepo.saveTokens(connection.id, {
      accessToken: this.encryptionService.encrypt(tokenSet.accessToken),
      refreshToken: tokenSet.refreshToken
        ? this.encryptionService.encrypt(tokenSet.refreshToken)
        : undefined,
    });

    if (!saveResult.ok) {
      return failure({
        code: 'CONNECTION_PERSIST_FAILED',
        message: saveResult.error.message,
        retryable: saveResult.error.retryable,
      });
    }

    await this.auditService.logTokenExchangeSuccess(clientId, platform, tokenSet.expiresAt);
    this.logger.info('OAuth callback handled successfully', { bookkeeperId, clientId, platform, connectionId: connection.id });

    return success(connection);
  }

  /**
   * Refreshes an access token for a connection.
   * Distributed lock prevents concurrent refresh of the same connection
   * (double-refresh causes invalid_grant from the platform).
   */
  async refreshToken(
    connectionId: string
  ): Promise<Result<PlatformConnection, OAuthOrchestratorError>> {
    const lockName = `oauth-refresh:${connectionId}`;

    const lockResult = await this.lockService.withLock(
      lockName,
      OAUTH_REFRESH_LOCK_TTL_MS,
      () => this.executeRefresh(connectionId)
    );

    if (!lockResult.ok) {
      if (lockResult.error.code === 'LOCK_NOT_ACQUIRED') {
        return failure({
          code: 'LOCK_NOT_ACQUIRED',
          message: 'Another refresh is in progress for this connection.',
          retryable: true,
        });
      }
      return failure({
        code: 'REFRESH_FAILED',
        message: lockResult.error.message,
        retryable: lockResult.error.retryable,
      });
    }

    return lockResult.value;
  }

  /**
   * Marks a connection as inactive. Token revocation is best-effort
   * (some platforms do not expose a revoke endpoint).
   */
  async disconnectPlatform(
    connectionId: string,
    bookkeeperId: string
  ): Promise<Result<boolean, OAuthOrchestratorError>> {
    const updateResult = await this.connectionRepo.updateStatus(connectionId, 'inactive');
    if (!updateResult.ok) {
      return failure({
        code: 'UNEXPECTED',
        message: updateResult.error.message,
        retryable: updateResult.error.retryable,
      });
    }

    await this.auditService.logDisconnection(bookkeeperId, connectionId, 'bookkeeper_initiated');
    this.logger.info('Platform disconnected', { bookkeeperId, connectionId });

    return success(true);
  }

  private async executeRefresh(
    connectionId: string
  ): Promise<Result<PlatformConnection, OAuthOrchestratorError>> {
    const tokenBundleResult = await this.connectionRepo.getTokens(connectionId);
    if (!tokenBundleResult.ok) {
      return failure({
        code: 'REFRESH_FAILED',
        message: tokenBundleResult.error.message,
        retryable: tokenBundleResult.error.retryable,
      });
    }

    const { refreshToken: encryptedRefresh } = tokenBundleResult.value;
    if (!encryptedRefresh) {
      return failure({
        code: 'REFRESH_FAILED',
        message: 'No refresh token stored for this connection.',
        retryable: false,
      });
    }

    const refreshToken = this.encryptionService.decrypt(encryptedRefresh);

    // Direct lookup by ID — added to IPlatformConnectionRepository in Sprint 3 (B5 fix)
    const connectionResult = await this.connectionRepo.findById(connectionId);
    if (!connectionResult.ok) {
      return failure({
        code: 'REFRESH_FAILED',
        message: connectionResult.error.message,
        retryable: connectionResult.error.retryable,
      });
    }

    const connection = connectionResult.value;

    const strategy = this.strategyFactory.getStrategy(connection.platform);
    if (!strategy) {
      return failure({
        code: 'UNSUPPORTED_PLATFORM',
        message: `No strategy for platform: ${connection.platform}`,
        retryable: false,
      });
    }

    const refreshResult = await strategy.refreshAccessToken(refreshToken);
    if (!refreshResult.ok) {
      await this.auditService.logTokenRefreshFailure(connectionId, refreshResult.error.code);
      return failure({
        code: 'REFRESH_FAILED',
        message: refreshResult.error.message,
        retryable: refreshResult.error.retryable,
      });
    }

    const newTokenSet = refreshResult.value;

    // Persist updated tokens
    await this.connectionRepo.saveTokens(connectionId, {
      accessToken: this.encryptionService.encrypt(newTokenSet.accessToken),
      refreshToken: newTokenSet.refreshToken
        ? this.encryptionService.encrypt(newTokenSet.refreshToken)
        : encryptedRefresh, // Retain existing encrypted refresh if platform didn't rotate it
    });

    const updateResult = await this.connectionRepo.updateStatus(
      connectionId,
      'active',
      newTokenSet.expiresAt
    );

    if (!updateResult.ok) {
      return failure({
        code: 'REFRESH_FAILED',
        message: updateResult.error.message,
        retryable: updateResult.error.retryable,
      });
    }

    await this.auditService.logTokenRefreshSuccess(connectionId, newTokenSet.expiresAt);
    this.logger.info('Token refreshed', { connectionId, newExpiresAt: newTokenSet.expiresAt });

    return success(updateResult.value);
  }
}
