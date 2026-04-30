import type { Result } from '../shared/Result';

export interface AuthTokenPair {
  readonly accessToken: string;   // JWT, 15-min expiry
  readonly refreshToken: string;  // Opaque token, 7-day expiry
  readonly accessExpiresAt: string;  // ISO-8601
  readonly refreshExpiresAt: string; // ISO-8601
}

export interface AccessTokenClaims {
  readonly bookkeeperId: string;
  readonly email: string;
  readonly role: 'bookkeeper';
}

export type AuthErrorCode =
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'REFRESH_TOKEN_REVOKED'
  | 'UNKNOWN';

export interface AuthError {
  readonly code: AuthErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * JWT authentication port. Access tokens are short-lived JWTs (15 min).
 * Refresh tokens are opaque, stored in Redis for revocation support.
 * Implements rotation: each refresh produces a new refresh token and revokes the old one.
 */
export interface IAuthService {
  /**
   * Generates a new access + refresh token pair for the given bookkeeper.
   */
  generateTokenPair(bookkeeperId: string, email: string): Promise<Result<AuthTokenPair, AuthError>>;

  /**
   * Verifies an access token signature and expiry, returns claims.
   */
  verifyAccessToken(token: string): Result<AccessTokenClaims, AuthError>;

  /**
   * Validates the refresh token, rotates it (new token), revokes the old one.
   */
  refreshTokenPair(refreshToken: string): Promise<Result<AuthTokenPair, AuthError>>;

  /**
   * Revokes a refresh token (logout). Idempotent.
   */
  revokeRefreshToken(refreshToken: string): Promise<Result<boolean, AuthError>>;
}
