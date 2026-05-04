'use client';
import { formatCurrency } from '@/utils/formatCurrency';
import styles from './MoneyDisplay.module.css';
import { cn } from '@/utils/cn';

interface MoneyDisplayProps {
  amount: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  muted?: boolean;
  compact?: boolean;
}

export function MoneyDisplay({ amount, className, size = 'md', muted, compact }: MoneyDisplayProps) {
  return (
    <span className={cn(styles.money, styles[size], muted && styles.muted, className)}>
      {formatCurrency(amount, { compact })}
    </span>
  );
}
