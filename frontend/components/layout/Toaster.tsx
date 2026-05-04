'use client';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/utils/cn';
import styles from './Toaster.module.css';
import type { Toast } from '@/stores/uiStore';

import { MdCheckCircleOutline, MdErrorOutline, MdWarningAmber, MdInfoOutline, MdClose } from 'react-icons/md';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUIStore((s) => s.dismissToast);
  const icons: Record<Toast['type'], React.ReactNode> = {
    success: <MdCheckCircleOutline />, error: <MdErrorOutline />, warning: <MdWarningAmber />, info: <MdInfoOutline />,
  };
  return (
    <div className={cn(styles.toast, styles[toast.type])}>
      <span className={styles.icon}>{icons[toast.type]}</span>
      <div className={styles.content}>
        <span className={styles.title}>{toast.title}</span>
        {toast.message && <span className={styles.message}>{toast.message}</span>}
      </div>
      <button className={styles.dismiss} onClick={() => dismiss(toast.id)} aria-label="Dismiss"><MdClose /></button>
    </div>
  );
}

export function Toaster() {
  const toasts = useUIStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className={styles.container} aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
