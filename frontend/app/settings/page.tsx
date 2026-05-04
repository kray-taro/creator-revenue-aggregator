'use client';
import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import styles from './page.module.css';
import { MdCheckCircleOutline } from 'react-icons/md';

export default function SettingsPage() {
  const setPageHeader = useUIStore((s) => s.setPageHeader);

  useEffect(() => {
    setPageHeader('Settings', 'Account preferences and integrations');
    return () => setPageHeader(null, null);
  }, [setPageHeader]);

  return (
    <div className={styles.page}>
      {/* Header moved to navbar */}
      <div className={styles.settingsCard}>
        <Section title="Profile">
          <Field label="Name" value="Sarah Chen" />
          <Field label="Email" value="sarah@bookkeeping.co" />
          <Field label="Role" value="Bookkeeper" />
        </Section>
        <hr className={styles.divider} />
        <Section title="QuickBooks Integration">
          <Field label="Connection Status" value={<><MdCheckCircleOutline /> Connected</>} color="var(--green)" />
          <Field label="OAuth Scope" value="Accounting (read/write)" />
        </Section>
        <hr className={styles.divider} />
        <Section title="Notifications">
          <Field label="OAuth expiry warnings" value="Email + In-app (30/14/7 days)" />
          <Field label="Sync completion" value="Email" />
          <Field label="Error alerts" value="Email + In-app" />
        </Section>
        <hr className={styles.divider} />
        <Section title="Data & Compliance">
          <Field label="Receipt retention" value="7 years (IRS compliant)" />
          <Field label="Audit log" value="All approvals logged with timestamp" />
          <Field label="Data encryption" value="AES-256 at rest, TLS 1.3 in transit" />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

function Field({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue} style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}
