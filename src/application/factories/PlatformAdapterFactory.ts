import type { PlatformName } from '@domain/entities';
import type { IPlatformAdapter, IPlatformConnectionRepository, IEncryptionService, IRawResponseArchivalService } from '@domain/ports';
import { MockAdapter } from './MockAdapter';
import { UnknownPlatformAdapter } from './UnknownPlatformAdapter';
import { YouTubeAdapter } from './YouTubeAdapter';
import { PatreonAdapter } from './PatreonAdapter';
import { GumroadAdapter } from './GumroadAdapter';
import { SubstackAdapter } from './SubstackAdapter';
import { ShopifyAdapter } from './ShopifyAdapter';
import { StripeAdapter } from './StripeAdapter';

/**
 * Factory for platform ingestion adapters.
 * Now instance-based (not static) so it can accept infrastructure dependencies
 * that the real adapters require (repository, encryption, archival).
 *
 * OCP: adding a new platform requires only a new adapter class and one line here.
 */
export class PlatformAdapterFactory {
  constructor(
    private readonly connectionRepo: IPlatformConnectionRepository,
    private readonly encryptionService: IEncryptionService,
    private readonly archivalService: IRawResponseArchivalService | null = null
  ) {}

  create(platformName: string): IPlatformAdapter {
    const normalized = platformName.toLowerCase() as PlatformName;

    switch (normalized) {
      case 'mock':
        return new MockAdapter();

      case 'youtube':
        return new YouTubeAdapter(this.connectionRepo, this.encryptionService, this.archivalService);

      case 'patreon':
        return new PatreonAdapter(this.connectionRepo, this.encryptionService, this.archivalService);

      case 'gumroad':
        return new GumroadAdapter(this.connectionRepo, this.encryptionService, this.archivalService);

      case 'substack':
        return new SubstackAdapter();

      case 'shopify':
        return new ShopifyAdapter(this.connectionRepo, this.encryptionService, this.archivalService);

      case 'stripe':
        return new StripeAdapter(this.connectionRepo, this.encryptionService, this.archivalService);

      default:
        return new UnknownPlatformAdapter(platformName);
    }
  }
}
