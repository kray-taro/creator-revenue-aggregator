'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTransactionStore } from '@/stores/transactionStore';
import { useUIStore, type UIState } from '@/stores/uiStore';
import { useShallow } from 'zustand/react/shallow';
import { transactionService } from '@/services/transactionService';
import { clientService } from '@/services/clientService';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { MoneyDisplay } from '@/components/shared/MoneyDisplay';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { MdWarningAmber } from 'react-icons/md';
import { yellowFlagLabel } from '@/utils/confidenceHelpers';
import { formatDate } from '@/utils/formatDate';
import type { Transaction, COAAccount } from '@/types';
import styles from './YellowTab.module.css';

type ShowToast = UIState['showToast'];

interface YellowTabProps { clientId: string; }

export function YellowTab({ clientId }: YellowTabProps) {
  const transactions = useTransactionStore(useShallow((s) => s.getByTab('yellow')));
  const updateTransaction = useTransactionStore((s) => s.updateTransaction);
  const showToast = useUIStore((s) => s.showToast);

  // Fetch QB Chart of Accounts for COA mapping dropdown (PRD US-303)
  const { data: coaAccounts = [] } = useQuery({
    queryKey: ['coa', clientId],
    queryFn: () => clientService.getCOA(clientId),
    staleTime: 10 * 60 * 1000,
  });

  const firstTime = transactions.filter((t) => t.yellowFlag === 'first_time_source');
  const duplicates = transactions.filter((t) => t.yellowFlag === 'potential_duplicate' && !t.duplicateOf);
  const variances = transactions.filter((t) => t.yellowFlag === 'amount_variance');

  if (transactions.length === 0) {
    return (
      <div className={styles.empty}>
        <MdWarningAmber className={styles.emptyIcon} />
        <h3>No items need review</h3>
        <p>All flagged transactions have been resolved.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {firstTime.length > 0 && (
        <section>
          <h3 className={styles.sectionTitle}>First-Time Revenue Sources ({firstTime.length})</h3>
          {firstTime.map((tx) => <FirstTimeCard key={tx.id} tx={tx} accounts={coaAccounts} onResolve={updateTransaction} showToast={showToast} />)}
        </section>
      )}
      {duplicates.length > 0 && (
        <section>
          <h3 className={styles.sectionTitle}>Potential Duplicates ({duplicates.length})</h3>
          {duplicates.map((tx) => <DuplicateCard key={tx.id} tx={tx} allTxs={transactions} onResolve={updateTransaction} showToast={showToast} />)}
        </section>
      )}
      {variances.length > 0 && (
        <section>
          <h3 className={styles.sectionTitle}>Amount Variances ({variances.length})</h3>
          {variances.map((tx) => <VarianceCard key={tx.id} tx={tx} onResolve={updateTransaction} showToast={showToast} />)}
        </section>
      )}
    </div>
  );
}

function FirstTimeCard({ tx, accounts, onResolve, showToast }: { tx: Transaction; accounts: COAAccount[]; onResolve: (id: string, p: Partial<Transaction>) => void; showToast: ShowToast; }) {
  const [qbAccountId, setQbAccountId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!qbAccountId) return;
    setSaving(true);
    try {
      await transactionService.mapAccount(tx.id, qbAccountId);
      onResolve(tx.id, { status: 'approved', qbAccountId, yellowFlag: undefined });
      showToast({ type: 'success', title: 'Account mapped', message: `${tx.platform} → QB Account ${qbAccountId}` });
    } catch {
      showToast({ type: 'error', title: 'Failed to save mapping' });
    } finally { setSaving(false); }
  };

  return (
    <Card variant="yellow" className={styles.card} padding="md">
      <div className={styles.cardHeader}>
        <PlatformIcon platform={tx.platform} size="md" showName />
        <Badge variant="yellow" size="sm">First-Time Source</Badge>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.txInfo}>
          <span className={styles.txDesc}>{tx.description}</span>
          <MoneyDisplay amount={tx.netPayout} size="md" />
        </div>
        <div className={styles.mapRow}>
          <span className={styles.mapLabel}>Map to QuickBooks account:</span>
          <select className={styles.select} value={qbAccountId} onChange={(e) => setQbAccountId(e.target.value)}>
            <option value="">Select account…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountNumber ? `${a.accountNumber} – ${a.name}` : a.name}</option>)}
          </select>
          <Button variant="accent" size="sm" onClick={handleSave} disabled={!qbAccountId} loading={saving}>
            Save & Approve
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DuplicateCard({ tx, allTxs, onResolve, showToast }: { tx: Transaction; allTxs: Transaction[]; onResolve: (id: string, p: Partial<Transaction>) => void; showToast: ShowToast; }) {
  const peer = allTxs.find((t) => t.duplicateOf === tx.id);
  const [choice, setChoice] = useState<'keep_primary' | 'keep_processor' | 'keep_both'>('keep_primary');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await transactionService.resolveDuplicate(tx.id, choice);
      onResolve(tx.id, { status: 'approved', yellowFlag: undefined });
      if (peer) onResolve(peer.id, { status: choice === 'keep_both' ? 'approved' : 'rejected', yellowFlag: undefined });
      showToast({ type: 'success', title: 'Duplicate resolved' });
    } catch {
      showToast({ type: 'error', title: 'Failed to resolve duplicate' });
    } finally { setSaving(false); }
  };

  return (
    <Card variant="yellow" className={styles.card} padding="md">
      <div className={styles.cardHeader}>
        <Badge variant="yellow" size="sm" dot>Potential Duplicate</Badge>
      </div>
      <div className={styles.dupeRow}>
        <div className={styles.dupeSide}>
          <PlatformIcon platform={tx.platform} size="sm" showName />
          <MoneyDisplay amount={tx.netPayout} size="md" />
          <span className={styles.dateSmall}>{formatDate(tx.transactionDate, { short: true })}</span>
          <Badge variant="blue" size="sm">Primary</Badge>
        </div>
        <span className={styles.vs}>vs</span>
        {peer && (
          <div className={styles.dupeSide}>
            <PlatformIcon platform={peer.platform} size="sm" showName />
            <MoneyDisplay amount={peer.netPayout} size="md" />
            <span className={styles.dateSmall}>{formatDate(peer.transactionDate, { short: true })}</span>
            <Badge variant="ghost" size="sm">Processor</Badge>
          </div>
        )}
      </div>
      <div className={styles.radioGroup}>
        {(['keep_primary', 'keep_processor', 'keep_both'] as const).map((v) => (
          <label key={v} className={styles.radioLabel}>
            <input type="radio" value={v} checked={choice === v} onChange={() => setChoice(v)} />
            {v === 'keep_primary' ? `Keep ${tx.platform} (primary)` : v === 'keep_processor' ? `Keep ${peer?.platform ?? 'processor'}` : 'Keep Both (not duplicate)'}
          </label>
        ))}
      </div>
      <Button variant="accent" size="sm" onClick={handleSave} loading={saving}>Save Decision</Button>
    </Card>
  );
}

function VarianceCard({ tx, onResolve, showToast }: { tx: Transaction; onResolve: (id: string, p: Partial<Transaction>) => void; showToast: ShowToast; }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleApprove = async () => {
    setSaving(true);
    try {
      await transactionService.review({ transactionId: tx.id, action: 'approve', note });
      onResolve(tx.id, { status: 'approved', note, yellowFlag: undefined });
      showToast({ type: 'success', title: 'Variance approved' });
    } catch {
      showToast({ type: 'error', title: 'Failed to approve' });
    } finally { setSaving(false); }
  };

  return (
    <Card variant="yellow" className={styles.card} padding="md">
      <div className={styles.cardHeader}>
        <PlatformIcon platform={tx.platform} size="md" showName />
        <Badge variant="yellow" size="sm">Amount Variance</Badge>
      </div>
      <p className={styles.varianceDesc}>{tx.description}</p>
      <div className={styles.varianceAmounts}>
        <MoneyDisplay amount={tx.netPayout} size="md" />
      </div>
      <textarea
        className={styles.noteArea}
        placeholder="Add a note explaining the variance (optional)…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
      <div className={styles.cardActions}>
        <Button variant="warning" size="sm" onClick={handleApprove} loading={saving}>Approve Anyway</Button>
      </div>
    </Card>
  );
}
