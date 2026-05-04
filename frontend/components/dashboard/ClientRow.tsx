'use client';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { formatDate } from '@/utils/formatDate';
import type { ClientAggregate } from '@/types';
import { MdCheckCircleOutline, MdWarningAmber, MdClose } from 'react-icons/md';
import styles from './ClientRow.module.css';
import { cn } from '@/utils/cn';

interface ClientRowProps { aggregate: ClientAggregate; }

function rowVariant(agg: ClientAggregate) {
  if (agg.oauthHealth.status === 'critical' || agg.redCount > 0) return 'red';
  if (agg.yellowCount > 0 || agg.oauthHealth.status === 'warning') return 'yellow';
  if (agg.syncStatus === 'synced' && agg.pendingCount === 0) return 'green';
  return 'default';
}

export function ClientRow({ aggregate: agg }: ClientRowProps) {
  const variant = rowVariant(agg);
  return (
    <tr className={cn(styles.row, styles[variant])}>
      {/* Client name */}
      <td className={styles.cell}>
        <Link href={`/clients/${agg.clientId}`} className={styles.clientLink}>
          <div className={styles.clientAvatar}>{agg.clientName.charAt(0)}</div>
          <div>
            <div className={styles.clientName}>{agg.clientName}</div>
            <div className={styles.clientMode}>{agg.accountingMode === 'accrual' ? 'Accrual' : 'Cash'} basis</div>
          </div>
        </Link>
      </td>

      {/* Pending */}
      <td className={styles.cell}>
        {agg.pendingCount > 0 ? (
          <div className={styles.pendingGroup}>
            {agg.greenCount > 0 && <Badge variant="green" size="sm" dot>{agg.greenCount} ready</Badge>}
            {agg.yellowCount > 0 && <Badge variant="yellow" size="sm" dot>{agg.yellowCount} review</Badge>}
            {agg.redCount > 0 && <Badge variant="red" size="sm" dot>{agg.redCount} errors</Badge>}
          </div>
        ) : (
          <Badge variant="default" size="sm">No pending</Badge>
        )}
      </td>

      {/* Sync status */}
      <td className={styles.cell}>
        {agg.syncStatus === 'synced' && <Badge variant="green"><MdCheckCircleOutline /> Synced</Badge>}
        {agg.syncStatus === 'pending_review' && <Badge variant="yellow"><MdWarningAmber /> Review Needed</Badge>}
        {agg.syncStatus === 'error' && <Badge variant="red"><MdClose /> Auth Expired</Badge>}
        {agg.syncStatus === 'idle' && <Badge variant="default">Idle</Badge>}
      </td>

      {/* OAuth health */}
      <td className={styles.cell}>
        <div className={styles.platformList}>
          {agg.oauthHealth.connectedPlatforms.map((p) => {
            const expiring = agg.oauthHealth.expiringPlatforms.find((e) => e.platform === p);
            const expired = agg.oauthHealth.expiredPlatforms.find((e) => e.platform === p);
            return (
              <span key={p} className={cn(styles.platformBadge, expired && styles.expired, expiring && styles.expiring)} title={expired ? `Expired` : expiring ? `Expires in ${expiring.daysUntilExpiry}d` : 'Connected'}>
                <PlatformIcon platform={p} size="sm" />
              </span>
            );
          })}
        </div>
      </td>

      {/* Last sync */}
      <td className={styles.cell}>
        <span className={styles.date}>{agg.lastSyncDate ? formatDate(agg.lastSyncDate, { relative: true }) : '—'}</span>
      </td>

      {/* Actions */}
      <td className={styles.cell}>
        <Link href={`/clients/${agg.clientId}`} className={styles.actionLink}>
          {agg.pendingCount > 0 ? 'Review →' : 'View →'}
        </Link>
      </td>
    </tr>
  );
}
