import type { PlatformName } from '../../domain/entities/ITransaction';
import type { IPlatformAdapter } from '../../domain/ports/IPlatformAdapter';
import { MockAdapter } from '../../infrastructure/adapters/MockAdapter';
import { NotImplementedPlatformAdapter } from '../../infrastructure/adapters/NotImplementedPlatformAdapter';
import { UnknownPlatformAdapter } from '../../infrastructure/adapters/UnknownPlatformAdapter';

const SUPPORTED_PLATFORMS: ReadonlySet<string> = new Set([
  'youtube',
  'patreon',
  'gumroad',
  'substack',
  'shopify',
  'stripe',
]);

export class PlatformAdapterFactory {
  static create(platformName: string): IPlatformAdapter {
    const normalized = platformName.toLowerCase();

    if (normalized === 'mock') {
      return new MockAdapter();
    }

    if (SUPPORTED_PLATFORMS.has(normalized)) {
      return new NotImplementedPlatformAdapter(normalized as PlatformName);
    }

    return new UnknownPlatformAdapter(platformName);
  }
}
