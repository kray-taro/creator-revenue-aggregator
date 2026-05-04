'use client';
import { useState, useEffect, useMemo } from 'react';
import { useTransactionStore } from '@/stores/transactionStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useUIStore } from '@/stores/uiStore';
import { useShallow } from 'zustand/react/shallow';
import { transactionService } from '@/services/transactionService';
import { socketService } from '@/services/socketService';
import { BulkApproveModal } from './BulkApproveModal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { MoneyDisplay } from '@/components/shared/MoneyDisplay';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { MdCheckCircleOutline, MdCheck } from 'react-icons/md';
import styles from './GreenTab.module.css';
import type { TransactionGroup } from '@/types';
import { confidencePercent } from '@/utils/confidenceHelpers';

interface GreenTabProps { clientId: string; }

export function GreenTab({ clientId }: GreenTabProps) {
  const approveTransactions = useTransactionStore((s) => s.approveTransactions);
  const undoBulkApproval    = useTransactionStore((s) => s.undoBulkApproval);
  const undoBuffer          = useTransactionStore((s) => s.undoBuffer);
  const transactions        = useTransactionStore(useShallow((s) => s.transactions));
  const { setBulkJob, bulkJob } = useDashboardStore(useShallow((s) => ({ setBulkJob: s.setBulkJob, bulkJob: s.bulkJob })));
  const showToast = useUIStore((s) => s.showToast);

  const [modalOpen, setModalOpen] = useState(false);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);

  const groups     = useMemo(() => useTransactionStore.getState().getGreenGroups(), [transactions]);
  const counts     = useMemo(() => useTransactionStore.getState().getCounts(), [transactions]);
  const allGreenIds = useMemo(() => groups.flatMap((g) => g.transactions.map((t) => t.id)), [groups]);
  const totalNet    = useMemo(() => groups.reduce((s, g) => s + g.totalNet, 0), [groups]);

  // Undo countdown timer
  useEffect(() => {
    if (!undoBuffer) { setUndoSecondsLeft(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((undoBuffer.expiresAt - Date.now()) / 1000));
      setUndoSecondsLeft(left);
      if (left === 0) useTransactionStore.getState().setUndoBuffer(null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [undoBuffer]);

  const handleBulkApprove = async () => {
    try {
      approveTransactions(allGreenIds); // optimistic update
      let job;
      if (clientId === 'global') {
        job = await transactionService.bulkApproveAll();
      } else {
        job = await transactionService.bulkApprove(clientId, allGreenIds);
      }
      setBulkJob({ ...job, clientProgress: { [clientId]: 'processing' } });
      socketService.subscribeToBulkJob(job.jobId);
      setModalOpen(false);
      showToast({ type: 'success', title: `${allGreenIds.length} transactions approved`, message: 'Syncing to QuickBooks…' });
    } catch {
      showToast({ type: 'error', title: 'Approval failed', message: 'Please try again.' });
    }
  };

  const handleUndo = async () => {
    if (!undoBuffer) return;
    undoBulkApproval();
    showToast({ type: 'info', title: 'Bulk approval undone', message: 'Transactions returned to review queue.' });
  };

  if (groups.length === 0) {
    return (
      <div className={styles.empty}>
        <MdCheckCircleOutline className={styles.emptyIcon} />
        <h3>No high-confidence transactions</h3>
        <p>All done! Check the Yellow or Red tabs for items needing attention.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* Summary banner */}
      <div className={styles.banner}>
        <div className={styles.bannerLeft}>
          <span className={styles.bannerCount}>{counts.green} transactions</span>
          <span className={styles.bannerNet}><MoneyDisplay amount={totalNet} size="lg" /></span>
          <span className={styles.bannerLabel}>ready to approve</span>
        </div>
        <div className={styles.bannerActions}>
          {undoBuffer && (
            <Button variant="warning" size="sm" onClick={handleUndo} tooltip="Undo bulk approval">
              Undo Approval
            </Button>
          )}
          <Button variant="success" onClick={() => setModalOpen(true)} id="bulk-approve-btn" icon={<MdCheck />} tooltip="Approve all high confidence transactions">
            Bulk Approve
          </Button>
        </div>
      </div>

      {/* Transaction groups */}
      <div className={styles.groups}>
        {groups.map((group) => (
          <TransactionGroupCard key={`${group.platform}-${group.category}`} group={group} />
        ))}
      </div>

      <BulkApproveModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleBulkApprove}
        transactionCount={allGreenIds.length}
        totalAmount={totalNet}
      />
    </div>
  );
}

function TransactionGroupCard({ group }: { group: TransactionGroup }) {
  const [expanded, setExpanded] = useState(false);
  const avgPct = confidencePercent(group.avgConfidence);

  return (
    <Card className={styles.groupCard} padding="none">
      <div className={styles.groupHeader} onClick={() => setExpanded((e) => !e)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}>
        <div className={styles.groupLeft}>
          <PlatformIcon platform={group.platform} size="md" />
          <div>
            <div className={styles.groupCategory}>{group.category}</div>
            <div className={styles.groupMeta}>
              {group.transactions.length} transaction{group.transactions.length !== 1 ? 's' : ''}
              {group.confidenceReasons?.[0] && (
                <span className={styles.groupReason}>· {group.confidenceReasons[0].label}: {group.confidenceReasons[0].description}</span>
              )}
            </div>
          </div>
        </div>
        <div className={styles.groupRight}>
          <Badge variant="green" size="sm">{avgPct}% confidence</Badge>
          <div className={styles.groupAmounts}>
            <MoneyDisplay amount={group.totalNet} size="md" />
            <span className={styles.groupFees}>({<MoneyDisplay amount={group.totalFees} size="sm" muted />} fees)</span>
          </div>
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div className={styles.groupBody}>
          {group.transactions.map((tx) => (
            <div key={tx.id} className={styles.txRow}>
              <span className={styles.txDate}>{tx.transactionDate}</span>
              <span className={styles.txDesc}>{tx.description}</span>
              <MoneyDisplay amount={tx.netPayout} size="sm" />
              {tx.receiptSnapshotUrl && (
                <button
                  className={styles.viewSourceBtn}
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const { url } = await transactionService.getReceiptUrl(tx.id);
                      window.open(url, '_blank');
                    } catch { /* toast handled globally */ }
                  }}
                  title="View receipt snapshot (PDF)"
                >
                  View Source
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
