'use client';
import React from 'react';
import { cn } from '@/utils/cn';
import styles from './Badge.module.css';

export type BadgeVariant = 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'orange' | 'ghost';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function Badge({ variant = 'default', size = 'md', dot, children, className }: BadgeProps) {
  return (
    <span className={cn(styles.badge, styles[variant], styles[size], className)}>
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
