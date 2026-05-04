'use client';
import { useState, useEffect } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { useTransactionStore } from '@/stores/transactionStore';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '@/stores/uiStore';
import { GreenTab } from './GreenTab';
import { YellowTab } from './YellowTab';
import { RedTab } from './RedTab';
import { Badge } from '@/components/ui/Badge';
import styles from './ReviewQueue.module.css';
import type { ReviewTab } from '@/types';

interface ReviewQueueProps { clientId: string; }

export function ReviewQueue({ clientId }: ReviewQueueProps) {
  const activeTab    = useTransactionStore((s) => s.activeTab);
  const setActiveTab = useTransactionStore((s) => s.setActiveTab);
  const counts       = useTransactionStore(useShallow((s) => s.getCounts()));
  const setPageHeader = useUIStore((s) => s.setPageHeader);

  // Keyboard shortcuts: G=green, Y=yellow, R=red
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'g' || e.key === 'G') setActiveTab('green');
      if (e.key === 'y' || e.key === 'Y') setActiveTab('yellow');
      if (e.key === 'r' || e.key === 'R') setActiveTab('red');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveTab]);

  useEffect(() => {
    // Only set header if this is the global queue (otherwise let the parent page set it)
    if (clientId === 'global') {
      const hint = <span className={styles.hint}>(G/Y/R to switch tabs)</span>;
      setPageHeader('Review Queue', <>{counts.total} transactions awaiting review {hint}</>);
      return () => setPageHeader(null, null);
    }
  }, [clientId, counts.total, setPageHeader]);

  const tabs: { id: ReviewTab; label: string; count: number; badgeVariant: 'green' | 'yellow' | 'red' }[] = [
    { id: 'green',  label: 'High Confidence', count: counts.green,  badgeVariant: 'green'  },
    { id: 'yellow', label: 'Needs Review',    count: counts.yellow, badgeVariant: 'yellow' },
    { id: 'red',    label: 'Errors',          count: counts.red,    badgeVariant: 'red'    },
  ];

  return (
    <div className={styles.queue}>
      {/* Header moved to navbar */}

      <RadixTabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as ReviewTab)}>
        <RadixTabs.List className={styles.tabList} aria-label="Review queue tabs">
          {tabs.map((tab) => (
            <RadixTabs.Trigger key={tab.id} value={tab.id} className={styles.tab} data-state-variant={tab.id}>
              <span className={styles.tabLabel}>{tab.label}</span>
              <Badge variant={tab.badgeVariant} size="sm">{tab.count}</Badge>
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>

        <RadixTabs.Content value="green" className={styles.panel}>
          <GreenTab clientId={clientId} />
        </RadixTabs.Content>
        <RadixTabs.Content value="yellow" className={styles.panel}>
          <YellowTab clientId={clientId} />
        </RadixTabs.Content>
        <RadixTabs.Content value="red" className={styles.panel}>
          <RedTab clientId={clientId} />
        </RadixTabs.Content>
      </RadixTabs.Root>
    </div>
  );
}
