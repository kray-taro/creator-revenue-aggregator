'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useClient, useClientAggregates } from '@/hooks/useClients';
import { useTransactionStore } from '@/stores/transactionStore';
import { useUIStore } from '@/stores/uiStore';
import { transactionService } from '@/services/transactionService';
import { ReviewQueue } from '@/components/review/ReviewQueue';
import { ConnectionPanel } from '@/components/dashboard/ConnectionPanel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { formatDate } from '@/utils/formatDate';
import { MdArrowBack, MdSync, MdSettings } from 'react-icons/md';
import type { PlatformName } from '@/types';
import styles from './page.module.css';

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: client, isLoading: clientLoading } = useClient(id);
  const { data: aggregates } = useClientAggregates();
  const aggregate = aggregates?.find((a) => a.clientId === id);

  const { setTransactions, isLoading: txLoading, setLoading } = useTransactionStore();
  const showToast = useUIStore((s) => s.showToast);
  const setPageHeader = useUIStore((s) => s.setPageHeader);

  useEffect(() => {
    async function loadTransactions() {
      setLoading(true);
      try {
        const txData = await transactionService.listByClient(id);
        setTransactions(txData.data);
      } catch {
        showToast({ type: 'error', title: 'Failed to load transactions' });
      } finally {
        setLoading(false);
      }
    }
    loadTransactions();
  }, [id, setTransactions, setLoading, showToast]);

  useEffect(() => {
    setPageHeader('Client Details');
    return () => setPageHeader(null, null);
  }, [setPageHeader]);

  const isLoading = clientLoading || txLoading;

  return (
    <div className={styles.page}>
      {/* Navigation & Actions */}
      <div className={styles.topBar}>
        <Link href="/clients" className={styles.backLink}>
          <MdArrowBack /> Back to Clients
        </Link>
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" icon={<MdSync />} tooltip="Trigger a manual sync">Sync Now</Button>
          <Button variant="ghost" size="sm" icon={<MdSettings />} tooltip="Client settings">Settings</Button>
        </div>
      </div>

      {/* Client header */}
      <div className={styles.clientHeader}>
        <div className={styles.clientInfo}>
          <div className={styles.clientAvatar}>{(client?.name ?? 'C').charAt(0)}</div>
          <div>
            <h1 className={styles.clientName}>{client?.name ?? 'Loading…'}</h1>
            <div className={styles.clientMeta}>
              {client?.email && <span>{client.email}</span>}
              {client?.email && <span className={styles.metaDot}>·</span>}
              <Badge variant={client?.accountingMode === 'accrual' ? 'blue' : 'default'} size="sm">
                {client?.accountingMode === 'accrual' ? 'Accrual Basis' : 'Cash Basis'}
              </Badge>
              {client?.qbCompanyId && (
                <>
                  <span className={styles.metaDot}>·</span>
                  <Badge variant="default" size="sm">QB Connected</Badge>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Platform connection status */}
        {aggregate && (
          <div className={styles.platformStatus}>
            {aggregate.oauthHealth.connectedPlatforms.map((p: PlatformName) => {
              const expiring = aggregate.oauthHealth.expiringPlatforms.find((e) => e.platform === p);
              const expired  = aggregate.oauthHealth.expiredPlatforms.find((e) => e.platform === p);
              return (
                <div key={p} className={styles.platformItem} title={
                  expired  ? `${p} — Expired` :
                  expiring ? `${p} — Expires in ${expiring.daysUntilExpiry} days` :
                             `${p} — Connected`
                }>
                  <PlatformIcon platform={p} size="sm" />
                  <span className={styles.platformDot}
                    style={{ background: expired ? 'var(--red)' : expiring ? 'var(--yellow)' : 'var(--green)' }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Key Stats Overview */}
      {aggregate && (
        <div className={styles.statsBar}>
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ color: aggregate.pendingCount > 0 ? 'var(--yellow)' : 'inherit' }}>
              {aggregate.pendingCount}
            </span>
            <span className={styles.statLabel}>Pending Transactions</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ color: aggregate.redCount > 0 ? 'var(--red)' : 'inherit' }}>
              {aggregate.redCount}
            </span>
            <span className={styles.statLabel}>Blocking Errors</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue} style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-medium)' }}>
              {aggregate.lastSyncDate ? formatDate(aggregate.lastSyncDate, { relative: true }) : 'Never'}
            </span>
            <span className={styles.statLabel}>Last Global Sync</span>
          </div>
        </div>
      )}

      {/* Platform Connections — PRD US-101 AC #5 */}
      <ConnectionPanel clientId={id} />

      {/* Review Queue */}
      {isLoading ? (
        <div className={styles.loading}>
          {[...Array(4)].map((_, i) => <div key={i} className={`skeleton ${styles.skeletonCard}`} />)}
        </div>
      ) : (
        <ReviewQueue clientId={id} />
      )}
    </div>
  );
}
