'use client';
import { useDashboardAggregates } from '@/hooks/useDashboard';
import { formatDate } from '@/utils/formatDate';
import styles from './page.module.css';

export default function AuditLogPage() {
  const { data: dashAgg, isLoading } = useDashboardAggregates();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Audit Log</h1>
        <p className={styles.subtitle}>Immutable record of data pulls, manual overrides, and exports.</p>
      </div>
      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`skeleton ${styles.skeletonRow}`} />
            ))}
          </div>
        ) : dashAgg?.recentActivity && dashAgg.recentActivity.length > 0 ? (
          <div className={styles.activityFeed}>
            {dashAgg.recentActivity.map((ev) => (
              <div key={ev.id} className={styles.activityItem}>
                <span className={styles.activityDot} data-type={ev.type} />
                <div className={styles.activityContent}>
                  <span className={styles.activityDesc}>{ev.description}</span>
                  <span className={styles.activityMeta}>
                    {ev.clientName} · {formatDate(ev.timestamp, { relative: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.placeholderCard}>
            <div className={styles.emptyState}>
              <span className={styles.icon}>📑</span>
              <h3>Compliance Documentation</h3>
              <p>Every transaction approval, validation override, and platform sync is logged here to ensure a bulletproof audit trail for you and your clients.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
