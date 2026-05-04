import { apiClient } from './apiClient';
import type { Transaction, ReviewAction, BulkApproveJob, PaginatedResponse } from '@/types';

export interface TransactionFilters {
  status?: string;
  platform?: string;
  dateFrom?: string;
  dateTo?: string;
  tab?: 'green' | 'yellow' | 'red';
  page?: number;
  pageSize?: number;
}

export const transactionService = {
  /** Fetch transactions for a client, optionally filtered */
  listByClient(clientId: string, filters: TransactionFilters = {}): Promise<PaginatedResponse<Transaction>> {
    return apiClient.get<PaginatedResponse<Transaction>>(`/clients/${clientId}/transactions`, filters as Record<string, string | number>);
  },

  /** Fetch transactions across all clients, optionally filtered */
  listAll(filters: TransactionFilters = {}): Promise<PaginatedResponse<Transaction>> {
    return apiClient.get<PaginatedResponse<Transaction>>(`/transactions`, filters as Record<string, string | number>);
  },

  /** Fetch a single transaction */
  get(transactionId: string): Promise<Transaction> {
    return apiClient.get<Transaction>(`/transactions/${transactionId}`);
  },

  /** Perform a single review action (approve/reject/edit/map/resolve) */
  review(action: ReviewAction): Promise<Transaction> {
    return apiClient.post<Transaction>(`/transactions/${action.transactionId}/review`, action);
  },

  /** Bulk approve a set of transaction IDs — returns job for WebSocket tracking */
  bulkApprove(clientId: string, transactionIds: string[]): Promise<BulkApproveJob> {
    return apiClient.post<BulkApproveJob>('/transactions/bulk-approve', { clientId, transactionIds });
  },

  /** Bulk approve ALL high-confidence transactions across all clients */
  bulkApproveAll(): Promise<BulkApproveJob> {
    return apiClient.post<BulkApproveJob>('/transactions/bulk-approve-all');
  },

  /** Get the current status of a bulk approval job */
  getBulkJobStatus(jobId: string): Promise<BulkApproveJob> {
    return apiClient.get<BulkApproveJob>(`/transactions/bulk-approve/${jobId}`);
  },

  /** Undo a bulk approval (within 5-min window) */
  undoBulkApproval(jobId: string): Promise<void> {
    return apiClient.post<void>(`/transactions/bulk-approve/${jobId}/undo`);
  },

  /** Map a transaction's COA account */
  mapAccount(transactionId: string, qbAccountId: string): Promise<Transaction> {
    return apiClient.patch<Transaction>(`/transactions/${transactionId}/map-account`, { qbAccountId });
  },

  /** Resolve a duplicate flag */
  resolveDuplicate(
    transactionId: string,
    resolution: 'keep_primary' | 'keep_processor' | 'keep_both',
    note?: string
  ): Promise<Transaction> {
    return apiClient.post<Transaction>(`/transactions/${transactionId}/resolve-duplicate`, { resolution, note });
  },

  /** Override a validation error and approve anyway */
  overrideValidation(transactionId: string, note: string): Promise<Transaction> {
    return apiClient.post<Transaction>(`/transactions/${transactionId}/override-validation`, { note });
  },

  /** Get signed S3 URL for a receipt PDF */
  getReceiptUrl(transactionId: string): Promise<{ url: string; expiresAt: string }> {
    return apiClient.get(`/transactions/${transactionId}/receipt`);
  },
};
