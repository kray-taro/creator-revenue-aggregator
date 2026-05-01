import type { PlatformName } from '@domain/entities';

/**
 * Platform-specific configuration for ingestion operations
 */
export interface PlatformConfig {
  readonly batchSize: number;        // Number of transactions per batch
  readonly batchDelayMs: number;     // Delay between batches for rate limiting
  readonly maxRetries: number;       // Maximum retry attempts for failed operations
  readonly timeoutMs: number;        // Timeout for platform API calls
}

/**
 * Default configuration for platforms without specific overrides
 */
const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  batchSize: 100,
  batchDelayMs: 100,
  maxRetries: 3,
  timeoutMs: 30000, // 30 seconds
};

/**
 * Platform-specific configurations optimized for each platform's characteristics
 * 
 * Rationale:
 * - YouTube: Smaller batches due to complex metadata and NET-60 payout processing
 * - Patreon: Medium batches, moderate API rate limits
 * - Gumroad: Medium batches, simple transaction structure
 * - Substack: Medium batches, similar to Patreon
 * - Shopify: Larger batches, robust API with high rate limits
 * - Stripe: Largest batches, highly optimized API with generous rate limits
 * 
 * @see docs/SPRINT_1_CODE_REVIEW.md P3-16
 */
const PLATFORM_CONFIGS: Record<PlatformName, PlatformConfig> = {
  youtube: {
    batchSize: 50,        // Smaller batches for complex metadata
    batchDelayMs: 200,    // More conservative rate limiting
    maxRetries: 3,
    timeoutMs: 45000,     // Longer timeout for complex queries
  },
  patreon: {
    batchSize: 100,
    batchDelayMs: 100,
    maxRetries: 3,
    timeoutMs: 30000,
  },
  gumroad: {
    batchSize: 100,
    batchDelayMs: 100,
    maxRetries: 3,
    timeoutMs: 30000,
  },
  substack: {
    batchSize: 100,
    batchDelayMs: 100,
    maxRetries: 3,
    timeoutMs: 30000,
  },
  shopify: {
    batchSize: 150,       // Larger batches for robust API
    batchDelayMs: 75,     // Less aggressive rate limiting
    maxRetries: 4,        // More retries due to higher volume
    timeoutMs: 30000,
  },
  stripe: {
    batchSize: 200,       // Largest batches for highly optimized API
    batchDelayMs: 50,     // Minimal rate limiting
    maxRetries: 5,        // Most retries due to highest volume
    timeoutMs: 30000,
  },
  quickbooks: {
    batchSize: 30,        // QuickBooks API has a strict 30 operations per batch limit
    batchDelayMs: 500,    // Conservative rate limiting
    maxRetries: 3,
    timeoutMs: 30000,
  },
  unknown: {
    batchSize: 50,        // Conservative batch size for unknown platforms
    batchDelayMs: 200,    // Conservative rate limiting
    maxRetries: 2,        // Fewer retries for unknown platforms
    timeoutMs: 30000,
  },
};

/**
 * Retrieves platform-specific configuration
 * Falls back to default configuration for unknown platforms
 * 
 * @param platformName - Platform identifier
 * @returns Platform-specific configuration
 */
export function getPlatformConfig(platformName: PlatformName): PlatformConfig {
  return PLATFORM_CONFIGS[platformName] || DEFAULT_PLATFORM_CONFIG;
}

/**
 * Retrieves all platform configurations
 * Useful for testing and documentation
 * 
 * @returns Record of all platform configurations
 */
export function getAllPlatformConfigs(): Record<PlatformName, PlatformConfig> {
  return { ...PLATFORM_CONFIGS };
}

/**
 * Updates platform configuration at runtime
 * Useful for A/B testing and dynamic optimization
 * 
 * Note: This mutates the configuration. Use with caution in production.
 * Consider using environment variables or feature flags instead.
 * 
 * @param platformName - Platform identifier
 * @param config - Partial configuration to merge
 */
export function updatePlatformConfig(
  platformName: PlatformName,
  config: Partial<PlatformConfig>
): void {
  PLATFORM_CONFIGS[platformName] = {
    ...PLATFORM_CONFIGS[platformName],
    ...config,
  };
}