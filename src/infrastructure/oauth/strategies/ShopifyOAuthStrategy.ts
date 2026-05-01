import type { OAuthTokenSet } from '@domain/ports';
import type { PlatformName } from '@domain/entities';
import { AbstractOAuthStrategy } from '../AbstractOAuthStrategy';

/**
 * Shopify Admin API OAuth strategy (per-store OAuth).
 * Each Shopify store is a separate OAuth authorization. The shop domain is embedded
 * in the authorization URL and token endpoint at runtime.
 *
 * Shopify permanent tokens (offline access) do not expire; we record a far-future expiry.
 * Online access tokens (per-session) expire in 24 hours — we use offline mode for background sync.
 */
export class ShopifyOAuthStrategy extends AbstractOAuthStrategy {
  readonly platform: PlatformName = 'shopify';
  readonly scopes = ['read_orders', 'read_products', 'read_inventory'] as const;

  private static readonly OFFLINE_TOKEN_EXPIRY_SECONDS = 365 * 24 * 3600 * 10; // 10 years (permanent)

  // shopDomain is set per-request via setShopDomain before OAuth flow begins.
  private shopDomain = '';

  get authorizationUrl(): string {
    return `https://${this.shopDomain}/admin/oauth/authorize`;
  }

  get tokenUrl(): string {
    return `https://${this.shopDomain}/admin/oauth/access_token`;
  }

  /**
   * Must be called before initiating the OAuth flow for a specific store.
   */
  setShopDomain(shopDomain: string): void {
    this.shopDomain = shopDomain;
  }

  protected extraAuthorizationParams(): Record<string, string> {
    // Offline access tokens are permanent and suitable for background sync
    return {};
  }

  protected buildTokenPayload(code: string): Record<string, string> {
    return {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
    };
  }

  protected buildRefreshPayload(_refreshToken: string): Record<string, string> {
    // Shopify offline tokens do not need refreshing; this is a no-op stub
    return {};
  }

  protected parseTokenResponse(raw: Record<string, unknown>): OAuthTokenSet {
    const scopeRaw = raw['scope'];
    const scopes = typeof scopeRaw === 'string'
      ? scopeRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [...this.scopes];

    return {
      accessToken: String(raw['access_token'] ?? ''),
      // Shopify permanent tokens have no refresh token
      refreshToken: undefined,
      expiresAt: this.calculateExpiresAt(ShopifyOAuthStrategy.OFFLINE_TOKEN_EXPIRY_SECONDS),
      scopes,
      raw,
    };
  }
}
