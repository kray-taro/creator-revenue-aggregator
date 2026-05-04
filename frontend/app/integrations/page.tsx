'use client';
import { useUIStore } from '@/stores/uiStore';
import { useSendAllRenewals } from '@/hooks/useOAuth';
import { Button } from '@/components/ui/Button';
import { MdMailOutline } from 'react-icons/md';
import styles from './page.module.css';

export default function IntegrationsPage() {
  const showToast = useUIStore((s) => s.showToast);
  const { mutateAsync: sendAllRenewals, isPending: isSendingRenewals } = useSendAllRenewals();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Global Integrations</h1>
        <p className={styles.subtitle}>Monitor and manage all platform connections across your roster.</p>
      </div>
      
      <div className={styles.actions}>
        <Button
          variant="primary"
          loading={isSendingRenewals}
          onClick={async () => {
            try {
              const r = await sendAllRenewals();
              showToast({ type: 'success', title: `${r.sent} renewal reminders sent` });
            } catch { showToast({ type: 'error', title: 'Failed to send renewals' }); }
          }}
          icon={<MdMailOutline />}
          tooltip="Send renewal emails to all pending"
        >
          Send OAuth Renewals to All Pending
        </Button>
      </div>

      <div className={styles.placeholderCard}>
        <div className={styles.emptyState}>
          <span className={styles.icon}>🔌</span>
          <h3>OAuth Monitoring Center</h3>
          <p>This view will provide a practice-level overview of OAuth health, making it easy to identify and resolve expired connections without digging into individual clients.</p>
        </div>
      </div>
    </div>
  );
}
