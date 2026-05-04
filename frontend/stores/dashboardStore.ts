'use client';
import { create } from 'zustand';
import type { DashboardAggregates, ClientAggregate } from '@/types';

export type BulkJobStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';

export interface BulkJobProgress {
  jobId: string;
  status: BulkJobStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  clientProgress: Record<string, 'pending' | 'processing' | 'done' | 'error'>;
  startedAt?: string;
  completedAt?: string;
  errors?: { transactionId: string; message: string }[];
}

interface DashboardState {
  aggregates: DashboardAggregates | null;
  bulkJob: BulkJobProgress | null;
  isLoadingAggregates: boolean;
  lastRefreshedAt: string | null;

  setAggregates: (agg: DashboardAggregates) => void;
  setBulkJob: (job: BulkJobProgress | null) => void;
  updateBulkJobProgress: (patch: Partial<BulkJobProgress>) => void;
  setClientProgress: (clientId: string, status: BulkJobProgress['clientProgress'][string]) => void;
  setLoadingAggregates: (loading: boolean) => void;
  resetBulkJob: () => void;
}

export const useDashboardStore = create<DashboardState>()((set, get) => ({
  aggregates: null,
  bulkJob: null,
  isLoadingAggregates: false,
  lastRefreshedAt: null,

  setAggregates: (aggregates) =>
    set({ aggregates, lastRefreshedAt: new Date().toISOString() }),

  setBulkJob: (bulkJob) => set({ bulkJob }),

  updateBulkJobProgress: (patch) =>
    set((s) => ({ bulkJob: s.bulkJob ? { ...s.bulkJob, ...patch } : null })),

  setClientProgress: (clientId, status) =>
    set((s) => ({
      bulkJob: s.bulkJob
        ? {
            ...s.bulkJob,
            clientProgress: { ...s.bulkJob.clientProgress, [clientId]: status },
          }
        : null,
    })),

  setLoadingAggregates: (isLoadingAggregates) => set({ isLoadingAggregates }),
  resetBulkJob: () => set({ bulkJob: null }),
}));
