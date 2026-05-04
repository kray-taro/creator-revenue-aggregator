'use client';
import { ClientTable } from '@/components/dashboard/ClientTable';
import { useClientAggregates } from '@/hooks/useClients';
import { useUIStore } from '@/stores/uiStore';
import { useEffect } from 'react';
import styles from './page.module.css';

export default function ClientsPage() {
  const { data: aggregates, isLoading: isClientsLoading } = useClientAggregates();
  const setPageHeader = useUIStore((s) => s.setPageHeader);

  useEffect(() => {
    setPageHeader('Client Management', 'Manage your creator roster, accounting modes, and COA mappings.');
    return () => setPageHeader(null, null);
  }, [setPageHeader]);

  return (
    <div className={styles.page}>
      {/* Header moved to navbar */}
      <div className={styles.content}>
        {isClientsLoading ? (
          <div className={styles.loading}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`skeleton ${styles.skeletonRow}`} />
            ))}
          </div>
        ) : (
          <ClientTable aggregates={aggregates ?? []} />
        )}
      </div>
    </div>
  );
}
