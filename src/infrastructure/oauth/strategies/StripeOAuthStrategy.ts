import type { OAuthTokenSet } from '@domain/ports';
import type { PlatformName } from '@domain/entities';
import { AbstractOAuthStrategy } from '../AbstractOAuthStrategy';

/**
 * Stripe Connect OAuth strategy.
 * Uses the Stripe Connect OAuth flow to obtain a connected account's access token.
 * Stripe access tokens for Connect do not expire (unlike standard OAuth).
 * The `scope` param must be `read_only` for read-only revenue data access.
 *
 * Token exchange returns: access_token, refresh_token, token_type, stripe_publishable_key,
 * stripe_user_id (the connected account ID), scope, livemode.
 */
export class StripeOAuthStrategy extends AbstractOAuthStrategy {
  readonly platform: PlatformName = 'stripe';
  readonly authorizationUrl = 'https://connect.stripe.com/oauth/authorize';
  readonly tokenUrl = 'https://connect.stripe.com/oauth/token';
  readonly scopes = ['read_only'] as const;

  // Stripe Connect tokens effectively do not expire; we set a far-future date
  private static readonly FAR_FUTURE_EXPIRY_SECONDS = 365 * 24 * 3600 * 10; // 10 years

  protected extraAuthorizationParams(): Record<string, string> {
    return {
      // Instructs Stripe to show only the requested scope
      response_type: 'code',
    };
  }

  protected buildTokenPayload(code: string): Record<string, string> {
    return {
      code,
      grant_type: 'authorization_code',
      client_secret: this.clientSecret,
    };
  }

  protected buildRefreshPayload(refreshToken: string): Record<string, string> {
    // Stripe Connect refresh: deauthorize + re-authorize is the Stripe-recommended flow,
    // but the refresh_token endpoint is supported for programmatic use.
    return {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_secret: this.clientSecret,
    };
  }

  protected parseTokenResponse(raw: Record<string, unknown>): OAuthTokenSet {
    return {
      accessToken: String(raw['access_token'] ?? ''),
      refreshToken: typeof raw['refresh_token'] === 'string' ? raw['refresh_token'] : undefined,
      // Stripe access tokens do not expire; set far-future sentinel
      expiresAt: this.calculateExpiresAt(StripeOAuthStrategy.FAR_FUTURE_EXPIRY_SECONDS),
      scopes: [...this.scopes],
      raw,
    };
  }
}
