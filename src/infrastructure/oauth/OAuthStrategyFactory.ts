import type { PlatformName } from '@domain/entities';
import type { OAuthPlatformConfig } from '@domain/ports';
import { AbstractOAuthStrategy } from './AbstractOAuthStrategy';
import { YouTubeOAuthStrategy } from './strategies/YouTubeOAuthStrategy';
import { PatreonOAuthStrategy } from './strategies/PatreonOAuthStrategy';
import { StripeOAuthStrategy } from './strategies/StripeOAuthStrategy';
import { ShopifyOAuthStrategy } from './strategies/ShopifyOAuthStrategy';
import { GumroadOAuthStrategy } from './strategies/GumroadOAuthStrategy';
import { SubstackOAuthStrategy } from './strategies/SubstackOAuthStrategy';

type StrategyConstructor = new (
  clientId: string,
  clientSecret: string,
  redirectUri: string
) => AbstractOAuthStrategy;

const STRATEGY_REGISTRY: Partial<Record<PlatformName, StrategyConstructor>> = {
  youtube: YouTubeOAuthStrategy,
  patreon: PatreonOAuthStrategy,
  stripe: StripeOAuthStrategy,
  shopify: ShopifyOAuthStrategy,
  gumroad: GumroadOAuthStrategy,
  substack: SubstackOAuthStrategy,
};

/**
 * Factory for OAuth strategies. Mirrors PlatformAdapterFactory pattern.
 * OCP: registering a new platform requires only adding to STRATEGY_REGISTRY and
 * creating a new strategy class — the factory itself never changes.
 */
export class OAuthStrategyFactory {
  private readonly strategies: Map<PlatformName, AbstractOAuthStrategy>;

  constructor(configs: Map<PlatformName, OAuthPlatformConfig>) {
    this.strategies = new Map();

    for (const [platform, config] of configs) {
      const StrategyClass = STRATEGY_REGISTRY[platform];
      if (StrategyClass) {
        this.strategies.set(platform, new StrategyClass(
          config.clientId,
          config.clientSecret,
          config.redirectUri
        ));
      }
    }
  }

  getStrategy(platform: PlatformName): AbstractOAuthStrategy | null {
    return this.strategies.get(platform) ?? null;
  }

  getSupportedPlatforms(): PlatformName[] {
    return Array.from(this.strategies.keys());
  }
}
