import * as crypto from 'crypto';
import type { IAuthService, AuthTokenPair, AccessTokenClaims, AuthError } from '@domain/ports';
import type { IConfig } from '@domain/ports';
import { failure, success, type Result } from '@domain/shared';

/**
 * Minimal JWT header+payload+signature implementation using Node crypto (no external JWT lib).
 * Uses HMAC-SHA256 (HS256). Claims follow RFC 7519.
 */

export interface IRedisTokenClient {
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<'OK'>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

const base64url = (input: Buffer | string): string => {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const REFRESH_KEY_PREFIX = 'auth:refresh:';
const ROLE = 'bookkeeper' as const;

/**
 * JWT-based authentication service.
 *
 * Access tokens: short-lived JWTs (HS256, 15-min by default), verified locally.
 * Refresh tokens: opaque crypto.randomUUID(), stored in Redis with TTL for revocation support.
 * Rotation: each `refreshTokenPair` call issues a new refresh token and revokes the old one —
 * preventing stolen-token reuse (refresh token rotation pattern).
 */
export class JwtAuthService implements IAuthService {
  private readonly accessExpirySeconds: number;
  private readonly refreshExpirySeconds: number;
  private readonly secret: Buffer;

  constructor(
    config: Pick<IConfig, 'appSecret'> & {
      readonly jwtAccessExpiry: number;
      readonly jwtRefreshExpiry: number;
    },
    private readonly redis: IRedisTokenClient
  ) {
    this.secret = crypto.createHash('sha256').update(config.appSecret, 'utf8').digest();
    this.accessExpirySeconds = config.jwtAccessExpiry;
    this.refreshExpirySeconds = config.jwtRefreshExpiry;
  }

  async generateTokenPair(bookkeeperId: string, email: string): Promise<Result<AuthTokenPair, AuthError>> {
    try {
      const accessToken = this.signJwt({ bookkeeperId, email, role: ROLE });
      const refreshToken = crypto.randomUUID();
      const now = Date.now();
      const accessExpiresAt = new Date(now + this.accessExpirySeconds * 1000).toISOString();
      const refreshExpiresAt = new Date(now + this.refreshExpirySeconds * 1000).toISOString();

      const key = `${REFRESH_KEY_PREFIX}${refreshToken}`;
      await this.redis.set(key, JSON.stringify({ bookkeeperId, email }), 'EX', this.refreshExpirySeconds);

      return success({ accessToken, refreshToken, accessExpiresAt, refreshExpiresAt });
    } catch (error) {
      return failure({
        code: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Failed to generate token pair.',
        retryable: false,
      });
    }
  }

  verifyAccessToken(token: string): Result<AccessTokenClaims, AuthError> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return failure({ code: 'INVALID_TOKEN', message: 'Malformed JWT.', retryable: false });
      }

      const [headerB64, payloadB64, sig] = parts as [string, string, string];
      const expectedSig = this.hmac(`${headerB64}.${payloadB64}`);

      if (!crypto.timingSafeEqual(Buffer.from(sig, 'base64'), Buffer.from(expectedSig, 'base64'))) {
        return failure({ code: 'INVALID_TOKEN', message: 'Invalid JWT signature.', retryable: false });
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<string, unknown>;

      if (typeof payload['exp'] === 'number' && payload['exp'] < Math.floor(Date.now() / 1000)) {
        return failure({ code: 'TOKEN_EXPIRED', message: 'Access token has expired.', retryable: false });
      }

      return success({
        bookkeeperId: String(payload['sub'] ?? ''),
        email: String(payload['email'] ?? ''),
        role: ROLE,
      });
    } catch {
      return failure({ code: 'INVALID_TOKEN', message: 'Failed to verify JWT.', retryable: false });
    }
  }

  async refreshTokenPair(refreshToken: string): Promise<Result<AuthTokenPair, AuthError>> {
    const key = `${REFRESH_KEY_PREFIX}${refreshToken}`;

    try {
      const raw = await this.redis.get(key);
      if (!raw) {
        return failure({
          code: 'REFRESH_TOKEN_REVOKED',
          message: 'Refresh token not found or already revoked.',
          retryable: false,
        });
      }

      const { bookkeeperId, email } = JSON.parse(raw) as { bookkeeperId: string; email: string };

      // Rotate: revoke the consumed token before issuing new pair (prevents replay)
      await this.redis.del(key);

      return this.generateTokenPair(bookkeeperId, email);
    } catch (error) {
      return failure({
        code: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Refresh failed.',
        retryable: true,
      });
    }
  }

  async revokeRefreshToken(refreshToken: string): Promise<Result<boolean, AuthError>> {
    try {
      await this.redis.del(`${REFRESH_KEY_PREFIX}${refreshToken}`);
      return success(true); // Idempotent — del on missing key is fine
    } catch (error) {
      return failure({
        code: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Revocation failed.',
        retryable: true,
      });
    }
  }

  private signJwt(claims: AccessTokenClaims): string {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const now = Math.floor(Date.now() / 1000);
    const payload = base64url(JSON.stringify({
      sub: claims.bookkeeperId,
      email: claims.email,
      role: claims.role,
      iat: now,
      exp: now + this.accessExpirySeconds,
    }));
    const sig = this.hmac(`${header}.${payload}`);
    return `${header}.${payload}.${sig}`;
  }

  private hmac(data: string): string {
    return base64url(crypto.createHmac('sha256', this.secret).update(data).digest());
  }
}
