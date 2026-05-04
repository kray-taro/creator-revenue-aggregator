'use client';
import {
  SiYoutube,
  SiPatreon,
  SiGumroad,
  SiSubstack,
  SiShopify,
  SiStripe,
} from 'react-icons/si';
import type { IconType } from 'react-icons';
import { cn } from '@/utils/cn';
import { getPlatformMeta } from '@/utils/platformMeta';
import type { PlatformName } from '@/types';
import styles from './PlatformIcon.module.css';

const ICONS: Record<string, IconType> = {
  SiYoutube,
  SiPatreon,
  SiGumroad,
  SiSubstack,
  SiShopify,
  SiStripe,
};

const SIZE_PX: Record<'sm' | 'md' | 'lg', number> = {
  sm: 11,
  md: 14,
  lg: 18,
};

interface PlatformIconProps {
  platform: PlatformName;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}

export function PlatformIcon({ platform, size = 'md', showName, className }: PlatformIconProps) {
  const meta = getPlatformMeta(platform);
  const Icon = ICONS[meta.iconKey];

  return (
    <span className={cn(styles.wrapper, styles[size], className)}>
      <span
        className={styles.icon}
        style={{ background: meta.bgColor, color: meta.textColor }}
        title={meta.name}
        aria-label={meta.name}
      >
        {Icon ? <Icon size={SIZE_PX[size]} /> : platform.charAt(0).toUpperCase()}
      </span>
      {showName && <span className={styles.name}>{meta.name}</span>}
    </span>
  );
}
