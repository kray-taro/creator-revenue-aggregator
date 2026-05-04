/** Format ISO date string to readable form */
export function formatDate(
  dateStr: string,
  options: { relative?: boolean; short?: boolean } = {}
): string {
  const date = new Date(dateStr);
  const now = new Date();

  if (options.relative) {
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  }

  if (options.short) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Format date range */
export function formatDateRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (f.getFullYear() !== t.getFullYear()) {
    return `${f.toLocaleDateString('en-US', { ...opts, year: 'numeric' })} – ${t.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
  }
  return `${f.toLocaleDateString('en-US', opts)} – ${t.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

/** Days until a date (negative = past) */
export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}
