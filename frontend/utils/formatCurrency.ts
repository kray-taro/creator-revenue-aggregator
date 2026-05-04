/** Format number as USD currency */
export function formatCurrency(
  amount: number,
  options: { compact?: boolean; showSign?: boolean } = {}
): string {
  const { compact = false, showSign = false } = options;

  if (compact && Math.abs(amount) >= 1000) {
    const divided = amount / 1000;
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: divided % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    }).format(divided);
    return formatted + 'K';
  }

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));

  if (amount < 0) return `-${formatted}`;
  if (showSign && amount > 0) return `+${formatted}`;
  return formatted;
}

/** Format variance as percentage with sign */
export function formatVariance(actual: number, expected: number): string {
  if (expected === 0) return 'N/A';
  const pct = ((actual - expected) / expected) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/** Parse a formatted currency string to number */
export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[$,]/g, '')) || 0;
}
