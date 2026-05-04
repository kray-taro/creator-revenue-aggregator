'use client';
import { cn } from '@/utils/cn';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  value: number; // 0–100
  total?: number;
  variant?: 'default' | 'green' | 'blue';
  label?: string;
  showPercent?: boolean;
  animated?: boolean;
  className?: string;
}

export function ProgressBar({ value, total, variant = 'blue', label, showPercent, animated, className }: ProgressBarProps) {
  const pct = total ? Math.round((value / total) * 100) : Math.min(100, Math.max(0, value));
  return (
    <div className={cn(styles.wrapper, className)}>
      {(label || showPercent) && (
        <div className={styles.meta}>
          {label && <span className={styles.label}>{label}</span>}
          {showPercent && <span className={styles.pct}>{pct}%</span>}
        </div>
      )}
      <div className={styles.track}>
        <div
          className={cn(styles.fill, styles[variant], animated && styles.animated)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
