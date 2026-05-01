import type { OAuthTokenSet } from '@domain/ports';
import type { PlatformName } from '@domain/entities';
import { AbstractOAuthStrategy } from '../AbstractOAuthStrategy';

/**
 * YouTube / Google OAuth2 strategy.
 * Scopes: yt-analytics-monetary.readonly
 * Token endpoint: Google OAuth2 token endpoint.
 * Access tokens expire in 1 hour; refresh tokens are long-lived (no explicit expiry from Google —
 * we track the 90-day platform connection expiry separately via platform_connections.expires_at).
 */
export class YouTubeOAuthStrategy extends AbstractOAuthStrategy {
  readonly platform: PlatformName = 'youtube';
  readonly authorizationUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  readonly tokenUrl = 'https://oauth2.googleapis.com/token';
  readonly scopes = [
    'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
  ] as const;

  protected extraAuthorizationParams(): Record<string, string> {
    return {
      access_type: 'offline',  // Required to receive a refresh token
      prompt: 'consent',        // Forces refresh token issuance even if previously authorized
    };
  }

  protected buildTokenPayload(code: string): Record<string, string> {
    return {
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    };
  }

  protected buildRefreshPayload(refreshToken: string): Record<string, string> {
    return {
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    };
  }

  protected parseTokenResponse(raw: Record<string, unknown>): OAuthTokenSet {
    const expiresIn = typeof raw['expires_in'] === 'number' ? raw['expires_in'] : 3600;
    const scopes = typeof raw['scope'] === 'string'
      ? raw['scope'].split(' ').filter(Boolean)
      : [...this.scopes];

    return {
      accessToken: String(raw['access_token'] ?? ''),
      refreshToken: typeof raw['refresh_token'] === 'string' ? raw['refresh_token'] : undefined,
      expiresAt: this.calculateExpiresAt(expiresIn),
      scopes,
      raw,
    };
  }
}
