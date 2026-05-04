'use client';
import { useState } from 'react';
import { ClientRow } from './ClientRow';
import type { ClientAggregate } from '@/types';
import styles from './ClientTable.module.css';

type SortKey = 'name' | 'pending' | 'status' | 'lastSync';
type SortDir = 'asc' | 'desc';

interface ClientTableProps { aggregates: ClientAggregate[]; }

export function ClientTable({ aggregates }: ClientTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('pending');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...aggregates].sort((a, b) => {
    let diff = 0;
    if (sortKey === 'name')     diff = a.clientName.localeCompare(b.clientName);
    if (sortKey === 'pending')  diff = a.pendingCount - b.pendingCount;
    if (sortKey === 'lastSync') diff = (a.lastSyncDate ?? '').localeCompare(b.lastSyncDate ?? '');
    if (sortKey === 'status') {
      const order = { error: 0, pending_review: 1, idle: 2, synced: 3 };
      diff = (order[a.syncStatus] ?? 4) - (order[b.syncStatus] ?? 4);
    }
    return sortDir === 'asc' ? diff : -diff;
  });

  const ColHeader = ({ col, label }: { col: SortKey; label: string }) => {
    const isSorted = sortKey === col;
    const ariaSort = isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    
    return (
      <th 
        className={styles.th} 
        onClick={() => toggle(col)} 
        role="columnheader" 
        aria-sort={ariaSort}
        tabIndex={0} 
        onKeyDown={(e) => e.key === 'Enter' && toggle(col)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          {label} {isSorted ? (sortDir === 'asc' ? '↑' : '↓') : <span className={styles.sortInactive} aria-hidden="true">↕</span>}
        </div>
      </th>
    );
  };

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headerRow}>
            <ColHeader col="name"     label="Client" />
            <ColHeader col="pending"  label="Pending" />
            <ColHeader col="status"   label="Sync Status" />
            <th className={styles.th}>OAuth Health</th>
            <ColHeader col="lastSync" label="Last Sync" />
            <th className={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((agg) => <ClientRow key={agg.clientId} aggregate={agg} />)}
        </tbody>
      </table>
    </div>
  );
}
