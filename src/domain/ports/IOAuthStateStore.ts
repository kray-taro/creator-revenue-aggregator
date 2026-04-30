import type { PlatformName } from '../entities/ITransaction';
import type { Result } from '../shared/Result';

export interface OAuthStateMetadata {
  readonly clientId: string;
  readonly platform: PlatformName;
  readonly bookkeeperId: string;
  readonly createdAt: string; // ISO-8601
}

export interface OAuthStateError {
  readonly code: 'STATE_NOT_FOUND' | 'STATE_EXPIRED' | 'STORE_ERROR' | 'UNKNOWN';
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Short-lived CSRF state store for OAuth flows.
 * Redis-backed in infrastructure. `validateAndConsumeState` MUST be atomic
 * (GET+DEL via Lua script) to prevent double-callback replay attacks.
 */
export interface IOAuthStateStore {
  /**
   * Stores CSRF state with a TTL. The state key is caller-generated (crypto.randomUUID).
   */
  storeState(
    state: string,
    metadata: OAuthStateMetadata,
    expiresInMs: number
  ): Promise<Result<boolean, OAuthStateError>>;

  /**
   * Validates the state exists and atomically deletes it (single-use).
   * Returns the metadata stored during `storeState`.
   */
  validateAndConsumeState(state: string): Promise<Result<OAuthStateMetadata, OAuthStateError>>;
}
