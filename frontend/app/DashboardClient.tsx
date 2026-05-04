'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { MdOutlinePersonAdd } from 'react-icons/md';

import styles from './page.module.css';

import { useUIStore } from '@/stores/uiStore';
import { formatDate } from '@/utils/formatDate';
import { Button } from '@/components/ui/Button';
import { useDashboardAggregates } from '@/hooks/useDashboard';

export default function DashboardPage() {
  const showToast = useUIStore((s) => s.showToast);
  const setPageHeader = useUIStore((s) => s.setPageHeader);
  const { data: dashAgg, isLoading: isDashboardLoading } = useDashboardAggregates();

  const totalPending = dashAgg?.totalPending ?? 0;
  const totalErrors = dashAgg?.totalErrors ?? 0;
  const oauthIssues = (dashAgg?.oauthWarning ?? 0) + (dashAgg?.oauthCritical ?? 0);

  useEffect(() => {
    const subtitle = dashAgg?.lastSyncAt
      ? `Last sync ${formatDate(dashAgg.lastSyncAt, { relative: true })}`
      : 'Loading…';
    setPageHeader('Dashboard', subtitle);
    return () => setPageHeader(null, null);
  }, [dashAgg?.lastSyncAt, setPageHeader]);

  return (
    <div className={styles.page}>
      {/* Page header actions */}
      <div className={styles.pageHeader}>
        <div /> {/* Spacer for flexbox if needed, or remove and adjust CSS */}
        <div className={styles.headerActions}>
          <Link href="/onboarding">
            <Button variant="primary" size="sm" id="add-client-btn" icon={<MdOutlinePersonAdd />} tooltip="Onboard a new client">Add Client</Button>
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <StatCard label="Pending Transactions" value={totalPending} variant={totalPending > 0 ? 'yellow' : 'default'} />
        <StatCard label="Errors" value={totalErrors} variant={totalErrors > 0 ? 'red' : 'default'} />
        <StatCard label="OAuth Issues" value={oauthIssues} variant={oauthIssues > 0 ? 'orange' : 'default'} />
      </div>
    </div>
  );
}

function StatCard({ label, value, variant }: { label: string; value: number; variant: 'default' | 'yellow' | 'red' | 'orange' }) {
  const colorMap: Record<string, string> = {
    default: 'var(--text-primary)',
    yellow: 'var(--yellow)',
    red: 'var(--red)',
    orange: 'var(--orange)',
  };
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue} style={{ color: colorMap[variant] }}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
