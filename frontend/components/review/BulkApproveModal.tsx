'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MoneyDisplay } from '@/components/shared/MoneyDisplay';
import { useDashboardStore } from '@/stores/dashboardStore';
import styles from './BulkApproveModal.module.css';

interface BulkApproveModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  transactionCount: number;
  totalAmount: number;
}

export function BulkApproveModal({ open, onClose, onConfirm, transactionCount, totalAmount }: BulkApproveModalProps) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const bulkJob = useDashboardStore((s) => s.bulkJob);

  const handleConfirm = async () => {
    if (!checked) return;
    setSubmitting(true);
    try { await onConfirm(); }
    finally { setSubmitting(false); setChecked(false); }
  };

  const isProcessing = bulkJob && ['queued', 'processing'].includes(bulkJob.status);
  const progress = bulkJob ? Math.round((bulkJob.processed / Math.max(bulkJob.total, 1)) * 100) : 0;

  return (
    <Modal open={open} onClose={onClose} title="Approve Transactions" size="sm">
      {isProcessing ? (
        <div className={styles.processing}>
          <p className={styles.processingLabel}>Syncing to QuickBooks…</p>
          <ProgressBar value={progress} label={`${bulkJob!.processed} / ${bulkJob!.total}`} showPercent animated />
          <p className={styles.processingHint}>This may take up to 30 seconds. You can navigate away.</p>
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span>Transactions</span>
              <strong>{transactionCount}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Total net payout</span>
              <strong><MoneyDisplay amount={totalAmount} /></strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Destination</span>
              <strong>QuickBooks Online</strong>
            </div>
          </div>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              id="review-confirm-checkbox"
            />
            I have reviewed the categorization and amounts above
          </label>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              variant="success"
              onClick={handleConfirm}
              disabled={!checked}
              loading={submitting}
              id="confirm-bulk-approve-btn"
            >
              Approve {transactionCount} Transactions
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
