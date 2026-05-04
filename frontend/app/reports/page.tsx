'use client';
import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useRequestCsvExport } from '@/hooks/useDashboard';
import { Button } from '@/components/ui/Button';
import { MdDownload } from 'react-icons/md';
import styles from './page.module.css';

export default function ReportsPage() {
  const showToast = useUIStore((s) => s.showToast);
  const setPageHeader = useUIStore((s) => s.setPageHeader);
  const { mutateAsync: requestCsvExport, isPending: isExporting } = useRequestCsvExport();

  useEffect(() => {
    setPageHeader('Strategic Insights & Reports', 'Analyze creator revenue trends and platform performance.');
    return () => setPageHeader(null, null);
  }, [setPageHeader]);

  return (
    <div className={styles.page}>
      {/* Header moved to navbar */}
      
      <div className={styles.actions}>
        <Button
          variant="primary"
          loading={isExporting}
          onClick={async () => {
            try {
              await requestCsvExport({});
              showToast({ type: 'success', title: 'Report ready', message: 'Combined CSV export generated.' });
            } catch { showToast({ type: 'error', title: 'Export failed' }); }
          }}
          icon={<MdDownload />}
          tooltip="Download report as CSV"
        >
          Download Combined CSV Report
        </Button>
      </div>

      <div className={styles.placeholderCard}>
        <div className={styles.emptyState}>
          <span className={styles.icon}>📊</span>
          <h3>Reports (Phase 2)</h3>
          <p>As outlined in the PRD, the Strategic Insights Export and Creator Health Scorecard are deferred to Phase 2, requiring a clean data foundation first.</p>
        </div>
      </div>
    </div>
  );
}
