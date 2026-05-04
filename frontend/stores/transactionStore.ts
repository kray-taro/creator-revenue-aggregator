'use client';
import { create } from 'zustand';
import type { Transaction, ReviewTab, ReviewQueueCounts, BulkApproveJob, TransactionGroup } from '@/types';
import { getTransactionTab } from '@/utils/confidenceHelpers';

interface UndoEntry {
  transactionIds: string[];
  previousStatuses: Record<string, Transaction['status']>;
  expiresAt: number;
}

interface TransactionState {
  transactions: Transaction[];
  activeTab: ReviewTab;
  isLoading: boolean;
  error: string | null;

  // Undo buffer for bulk approvals (5-minute window)
  undoBuffer: UndoEntry | null;

  setTransactions: (txs: Transaction[]) => void;
  addTransactions: (txs: Transaction[]) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  setActiveTab: (tab: ReviewTab) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Review actions
  approveTransactions: (ids: string[]) => void;
  rejectTransaction: (id: string) => void;
  setUndoBuffer: (entry: UndoEntry | null) => void;
  undoBulkApproval: () => void;

  // Derived selectors
  getCounts: () => ReviewQueueCounts;
  getByTab: (tab: ReviewTab) => Transaction[];
  getGreenGroups: () => TransactionGroup[];
  getByClientId: (clientId: string) => Transaction[];
}

export const useTransactionStore = create<TransactionState>()((set, get) => ({
  transactions: [],
  activeTab: 'green',
  isLoading: false,
  error: null,
  undoBuffer: null,

  setTransactions: (transactions) => set({ transactions }),
  addTransactions: (txs) =>
    set((s) => {
      const existing = new Set(s.transactions.map((t) => t.id));
      const newOnes = txs.filter((t) => !existing.has(t.id));
      return { transactions: [...s.transactions, ...newOnes] };
    }),
  updateTransaction: (id, patch) =>
    set((s) => ({
      transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  setActiveTab: (activeTab) => set({ activeTab }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  approveTransactions: (ids) => {
    const { transactions } = get();
    const previousStatuses: Record<string, Transaction['status']> = {};
    ids.forEach((id) => {
      const tx = transactions.find((t) => t.id === id);
      if (tx) previousStatuses[id] = tx.status;
    });

    set((s) => ({
      transactions: s.transactions.map((t) =>
        ids.includes(t.id) ? { ...t, status: 'approved' as const } : t
      ),
      undoBuffer: {
        transactionIds: ids,
        previousStatuses,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      },
    }));
  },

  rejectTransaction: (id) =>
    set((s) => ({
      transactions: s.transactions.map((t) =>
        t.id === id ? { ...t, status: 'rejected' as const } : t
      ),
    })),

  setUndoBuffer: (undoBuffer) => set({ undoBuffer }),

  undoBulkApproval: () => {
    const { undoBuffer } = get();
    if (!undoBuffer || Date.now() > undoBuffer.expiresAt) return;
    set((s) => ({
      transactions: s.transactions.map((t) =>
        undoBuffer.transactionIds.includes(t.id)
          ? { ...t, status: undoBuffer.previousStatuses[t.id] ?? t.status }
          : t
      ),
      undoBuffer: null,
    }));
  },

  getCounts: () => {
    const pending = get().transactions.filter((t) =>
      ['pending_review', 'error'].includes(t.status)
    );
    const green = pending.filter((t) => getTransactionTab(t) === 'green').length;
    const yellow = pending.filter((t) => getTransactionTab(t) === 'yellow').length;
    const red = pending.filter((t) => getTransactionTab(t) === 'red').length;
    return { green, yellow, red, total: green + yellow + red };
  },

  getByTab: (tab) =>
    get().transactions.filter(
      (t) => ['pending_review', 'error'].includes(t.status) && getTransactionTab(t) === tab
    ),

  getGreenGroups: () => {
    const greenTxs = get().getByTab('green');
    const groupMap = new Map<string, TransactionGroup>();

    for (const tx of greenTxs) {
      const key = `${tx.platform}-${tx.suggestedCategory ?? 'Uncategorized'}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.transactions.push(tx);
        existing.totalGross += tx.grossRevenue;
        existing.totalFees += tx.platformFee;
        existing.totalNet += tx.netPayout;
        existing.avgConfidence =
          (existing.avgConfidence * (existing.transactions.length - 1) + (tx.confidenceScore ?? 0)) /
          existing.transactions.length;
      } else {
        groupMap.set(key, {
          category: tx.suggestedCategory ?? 'Uncategorized',
          platform: tx.platform,
          transactions: [tx],
          totalGross: tx.grossRevenue,
          totalFees: tx.platformFee,
          totalNet: tx.netPayout,
          avgConfidence: tx.confidenceScore ?? 0,
          confidenceReasons: tx.confidenceReasons,
        });
      }
    }

    return Array.from(groupMap.values()).sort((a, b) => b.totalNet - a.totalNet);
  },

  getByClientId: (clientId) =>
    get().transactions.filter((t) => t.clientId === clientId),
}));
