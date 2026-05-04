'use client';
import { useState } from 'react';
import { useTransactionStore } from '@/stores/transactionStore';
import { useUIStore } from '@/stores/uiStore';
import { useClient } from '@/hooks/useClients';
import { useShallow } from 'zustand/react/shallow';
import { clientService } from '@/services/clientService';
import { Button } from '@/components/ui/Button';
import { getPlatformName } from '@/utils/platformMeta';
import { formatDate } from '@/utils/formatDate';
import { formatCurrency } from '@/utils/formatCurrency';
import { MdWarningAmber, MdSyncProblem, MdOutlineCloudOff, MdReceiptLong, MdContentCopy, MdOutlineMonetizationOn, MdDateRange, MdCheckCircleOutline } from 'react-icons/md';
import type { Transaction } from '@/types';
import type { PlatformName } from '@/types';
import styles from './RedTab.module.css';

interface RedTabProps { clientId: string; }

export function RedTab({ clientId }: RedTabProps) {
  const { data: client } = useClient(clientId);
  const transactions = useTransactionStore(useShallow((s) => s.getByTab('red')));
  const showToast = useUIStore((s) => s.showToast);

  if (transactions.length === 0) {
    return (
      <div className={styles.empty}>
        <MdCheckCircleOutline className={styles.emptyIcon} />
        <h3>No Blocking Errors</h3>
        <p>All platform connections are healthy and data is valid.</p>
      </div>
    );
  }

  // --- Grouping Logic for Systemic Bottlenecks (Primary Column) ---
  const oauthBlocked = transactions.filter((t) => t.redFlag === 'oauth_expired' || t.redFlag === 'oauth_expiring');
  const apiBlocked = transactions.filter((t) => t.redFlag === 'api_failure');
  const syncFailures = transactions.filter((t) => t.redFlag === 'sync_failed');

  const groupedOauth = oauthBlocked.reduce((acc, tx) => {
    if (!acc[tx.platform]) acc[tx.platform] = [];
    acc[tx.platform].push(tx);
    return acc;
  }, {} as Record<PlatformName, Transaction[]>);

  const groupedApi = apiBlocked.reduce((acc, tx) => {
    if (!acc[tx.platform]) acc[tx.platform] = [];
    acc[tx.platform].push(tx);
    return acc;
  }, {} as Record<PlatformName, Transaction[]>);

  // --- Data Inconsistencies (Secondary Column) ---
  // In a real app, these would be specific flag strings. Mapping validation_error to mock data for UI demo.
  const validationErrors = transactions.filter((t) => t.redFlag === 'validation_error');

  const clientName = client?.name || 'Client';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Blocking Errors</h2>
        <p className={styles.subtitle}>Review and resolve critical issues halting financial synchronization.</p>
      </div>

      <div className={styles.grid}>
        {/* Left Column: Systemic Bottlenecks */}
        <div className={styles.columnPrimary}>
          {Object.entries(groupedOauth).map(([platform, txs]) => (
            <OAuthCard
              key={platform}
              platform={platform as PlatformName}
              clientName={clientName}
              clientId={clientId}
              txs={txs}
              showToast={showToast}
            />
          ))}

          {Object.entries(groupedApi).map(([platform, txs]) => (
            <ApiOutageCard
              key={platform}
              platform={platform as PlatformName}
              txs={txs}
              showToast={showToast}
            />
          ))}

          {syncFailures.map((tx) => (
            <SyncFailureCard key={tx.id} clientName={clientName} />
          ))}
        </div>

        {/* Right Column: Data Inconsistencies */}
        <div className={styles.columnSecondary}>
          {validationErrors.map((tx, idx) => (
            <DataInconsistencyCard key={tx.id} tx={tx} index={idx} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OAuthCard({ platform, clientName, clientId, txs, showToast }: { platform: PlatformName; clientName: string; clientId: string; txs: Transaction[]; showToast: any; }) {
  const [sending, setSending] = useState(false);
  const isExpired = txs.some(t => t.redFlag === 'oauth_expired');

  const handleSendRenewal = async () => {
    setSending(true);
    try {
      await clientService.sendRenewal(clientId, platform);
      showToast({ type: 'success', title: 'Renewal reminder sent', message: `Email sent to client for ${getPlatformName(platform)} re-authorization.` });
    } catch {
      showToast({ type: 'error', title: 'Failed to send renewal' });
    } finally { setSending(false); }
  };

  const displayTxs = txs.slice(0, 2);
  const hiddenCount = txs.length - displayTxs.length;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <MdWarningAmber className={styles.iconRed} />
          OAuth {isExpired ? 'Expired' : 'Expiring'}: {clientName} ({getPlatformName(platform)})
        </div>
        <span className={isExpired ? styles.badgeCritical : styles.badgeWarning}>
          {isExpired ? 'CRITICAL' : 'WARNING'}
        </span>
      </div>
      <p className={styles.cardDesc}>
        Authentication token has {isExpired ? 'expired' : 'been revoked'}. {txs.length} transactions are currently blocked.
      </p>

      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Transaction ID</th>
            <th className={styles.amountCell}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {displayTxs.map((tx) => (
            <tr key={tx.id}>
              <td>{formatDate(tx.transactionDate, { short: true })}</td>
              <td>{tx.platformTransactionId || tx.id.slice(0, 8).toUpperCase()}</td>
              <td className={styles.amountCell}>{formatCurrency(tx.netPayout)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hiddenCount > 0 && <div className={styles.moreText}>+ {hiddenCount} more</div>}

      <div className={styles.primaryActions}>
        <Button variant="accent" onClick={handleSendRenewal} loading={sending} id={`send-renewal-${platform}`} tooltip="Send email reminder">
          Send Renewal Link
        </Button>
      </div>
    </div>
  );
}

function ApiOutageCard({ platform, txs, showToast }: { platform: PlatformName; txs: Transaction[]; showToast: any; }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = () => {
    setRetrying(true);
    setTimeout(() => {
      setRetrying(false);
      showToast({ type: 'success', title: 'Sync retried', message: 'The platform API is still unresponsive. Try again later.' });
    }, 1500);
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <MdOutlineCloudOff className={styles.iconGray} />
          API Service Outage: {getPlatformName(platform)}
        </div>
        <span className={styles.badgeWarning}>WARNING</span>
      </div>
      <p className={styles.cardDesc}>
        The {getPlatformName(platform)} API is currently unresponsive. {txs.length} transaction{txs.length !== 1 ? 's' : ''} pending.
      </p>
      <div className={styles.primaryActions}>
        <Button variant="secondary" onClick={handleRetry} loading={retrying} tooltip="Retry fetching data">
          Retry Sync
        </Button>
      </div>
    </div>
  );
}

function SyncFailureCard({ clientName }: { clientName: string }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <MdSyncProblem className={styles.iconRed} />
          Sync Failure: {clientName} (QuickBooks)
        </div>
        <span className={styles.badgeError}>ERROR</span>
      </div>
      <p className={styles.cardDesc}>
        API authentication failure with QuickBooks due to invalid credentials.
      </p>
      <div className={styles.primaryActions}>
        <Button variant="accent" tooltip="Map to QB account">
          Re-authenticate
        </Button>
      </div>
    </div>
  );
}

function DataInconsistencyCard({ tx, index }: { tx: Transaction; index: number }) {
  // Rotate through the mock error types from the screenshot to show variety
  const types = [
    { title: 'Payout Mismatch', icon: <MdReceiptLong className={styles.iconRed} />, action: 'Review Details', desc: `Gross - Fees != Net for a ${formatCurrency(tx.netPayout)} transaction.` },
    { title: 'Duplicate Conflict', icon: <MdContentCopy className={styles.iconRed} />, action: 'Resolve Conflict', desc: `Stripe vs. Gumroad: Two sources for the same ${formatCurrency(tx.netPayout)} ID.` },
    { title: 'Currency Error', icon: <MdOutlineMonetizationOn className={styles.iconGray} />, action: 'Update Rate', desc: 'Missing spot rate for a EUR payout.' },
    { title: 'Invalid Date', icon: <MdDateRange className={styles.iconGray} />, action: 'Fix Format', desc: 'System unable to parse a date from Substack.' }
  ];

  const type = types[index % types.length];

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          {type.icon}
          {type.title}
        </div>
      </div>
      <p className={styles.cardDesc}>
        {type.desc}
      </p>
      <div className={styles.secondaryActions}>
        <button className={styles.linkBtn}>
          {type.action}
        </button>
      </div>
    </div>
  );
}
