import type { ReviewTab, Transaction } from '@/types';

/** Map a transaction to its review tab based on confidence score and flags */
export function getTransactionTab(tx: Transaction): ReviewTab {
  if (tx.redFlag) return 'red';
  if (tx.yellowFlag) return 'yellow';
  const score = tx.confidenceScore ?? 0;
  if (score >= 0.95) return 'green';
  if (score >= 0.80) return 'yellow';
  return 'red';
}

/** Get percentage as 0–100 integer */
export function confidencePercent(score: number): number {
  return Math.round(score * 100);
}

/** Describe confidence level in human terms */
export function confidenceLabel(score: number): string {
  if (score >= 0.95) return 'High Confidence';
  if (score >= 0.80) return 'Needs Review';
  return 'Low Confidence';
}

/** Hex color for a confidence score */
export function confidenceColor(score: number): string {
  if (score >= 0.95) return 'var(--green)';
  if (score >= 0.80) return 'var(--yellow)';
  return 'var(--red)';
}

/** CSS variable name for a tab */
export function tabColor(tab: ReviewTab): string {
  const map: Record<ReviewTab, string> = {
    green: 'var(--green)',
    yellow: 'var(--yellow)',
    red: 'var(--red)',
  };
  return map[tab];
}

export function tabMutedColor(tab: ReviewTab): string {
  const map: Record<ReviewTab, string> = {
    green: 'var(--green-muted)',
    yellow: 'var(--yellow-muted)',
    red: 'var(--red-muted)',
  };
  return map[tab];
}

/** Human-readable label for yellow flag type */
export function yellowFlagLabel(flag: string): string {
  const map: Record<string, string> = {
    first_time_source: 'First-Time Source',
    potential_duplicate: 'Potential Duplicate',
    amount_variance: 'Amount Variance',
    category_uncertainty: 'Category Uncertain',
  };
  return map[flag] ?? flag;
}

/** Human-readable label for red flag type */
export function redFlagLabel(flag: string): string {
  const map: Record<string, string> = {
    oauth_expiring: 'OAuth Expiring',
    oauth_expired: 'OAuth Expired',
    api_failure: 'API Failure',
    validation_error: 'Validation Error',
    sync_failed: 'Sync Failed',
    void_detected: 'Entry Voided in QB',
  };
  return map[flag] ?? flag;
}
