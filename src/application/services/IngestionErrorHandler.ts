import type { IPlatformStatusRepository, PlatformAdapterErrorCode} from '@domain/ports';
import type { PlatformName } from '@domain/entities';

const TERMINAL_ADAPTER_ERROR_CODES: ReadonlySet<PlatformAdapterErrorCode> = new Set([
  'RATE_LIMIT',
  'RATE_LIMITED',
  'AUTH_EXPIRED',
  'TOKEN_EXPIRED',
  'UNAUTHORIZED',
]);

const KNOWN_PLATFORMS: ReadonlySet<PlatformName> = new Set([
  'youtube',
  'patreon',
  'gumroad',
  'substack',
  'shopify',
  'stripe',
]);

/**
 * Handles error classification and platform status updates
 */
export class IngestionErrorHandler {
  constructor(private readonly platformStatusRepository: IPlatformStatusRepository) {}

  isTerminalError(errorCode: PlatformAdapterErrorCode): boolean {
    return TERMINAL_ADAPTER_ERROR_CODES.has(errorCode);
  }

  toKnownPlatform(platformName: string): PlatformName | null {
    const normalized = platformName.toLowerCase() as PlatformName;
    return KNOWN_PLATFORMS.has(normalized) ? normalized : null;
  }

  async updatePlatformStatusToRed(
    clientId: string,
    platformName: string,
    errorMessage: string
  ): Promise<void> {
    const platform = this.toKnownPlatform(platformName);
    if (platform) {
      await this.platformStatusRepository.updateStatus(
        clientId,
        platform,
        'RED',
        errorMessage
      );
    }
  }
}


