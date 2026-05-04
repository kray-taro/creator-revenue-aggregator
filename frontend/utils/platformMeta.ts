import type { PlatformName } from '@/types';

export interface PlatformMeta {
  name: string;
  color: string;
  bgColor: string;
  textColor: string;
  hierarchy: 'primary' | 'processor';
  /** react-icons Simple Icons key — imported dynamically in PlatformIcon */
  iconKey: string;
}

export const PLATFORM_META: Record<PlatformName, PlatformMeta> = {
  youtube: {
    name: 'YouTube',
    color: 'hsl(0, 100%, 50%)',
    bgColor: 'hsl(0, 60%, 12%)',
    textColor: 'hsl(0, 90%, 65%)',
    hierarchy: 'primary',
    iconKey: 'SiYoutube',
  },
  patreon: {
    name: 'Patreon',
    color: 'hsl(14, 100%, 55%)',
    bgColor: 'hsl(14, 60%, 12%)',
    textColor: 'hsl(14, 90%, 65%)',
    hierarchy: 'primary',
    iconKey: 'SiPatreon',
  },
  gumroad: {
    name: 'Gumroad',
    color: 'hsl(330, 90%, 56%)',
    bgColor: 'hsl(330, 50%, 12%)',
    textColor: 'hsl(330, 90%, 70%)',
    hierarchy: 'primary',
    iconKey: 'SiGumroad',
  },
  substack: {
    name: 'Substack',
    color: 'hsl(25, 100%, 55%)',
    bgColor: 'hsl(25, 60%, 12%)',
    textColor: 'hsl(25, 90%, 65%)',
    hierarchy: 'primary',
    iconKey: 'SiSubstack',
  },
  shopify: {
    name: 'Shopify',
    color: 'hsl(98, 59%, 44%)',
    bgColor: 'hsl(98, 40%, 10%)',
    textColor: 'hsl(98, 59%, 55%)',
    hierarchy: 'primary',
    iconKey: 'SiShopify',
  },
  stripe: {
    name: 'Stripe',
    color: 'hsl(229, 71%, 62%)',
    bgColor: 'hsl(229, 40%, 12%)',
    textColor: 'hsl(229, 71%, 72%)',
    hierarchy: 'processor',
    iconKey: 'SiStripe',
  },
};

export function getPlatformMeta(platform: PlatformName): PlatformMeta {
  return PLATFORM_META[platform];
}

export function getPlatformName(platform: PlatformName): string {
  return PLATFORM_META[platform]?.name ?? platform;
}

export const ALL_PLATFORMS: PlatformName[] = [
  'youtube', 'patreon', 'gumroad', 'substack', 'shopify', 'stripe',
];
