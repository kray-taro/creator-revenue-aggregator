import { apiClient } from './apiClient';
import type { DashboardAggregates, SearchQuery, PaginatedResponse, Transaction } from '@/types';

export const searchService = {
  /** Unified cross-client search */
  search(query: SearchQuery): Promise<PaginatedResponse<Transaction>> {
    return apiClient.get<PaginatedResponse<Transaction>>('/search', query as unknown as Record<string, string | number>);
  },

  /** Get dashboard aggregates */
  getDashboardAggregates(): Promise<DashboardAggregates> {
    return apiClient.get<DashboardAggregates>('/dashboard/aggregates');
  },

  /** Trigger combined CSV report download for all clients */
  requestCsvExport(params: { dateFrom?: string; dateTo?: string; clientIds?: string[] }): Promise<{ downloadUrl: string }> {
    return apiClient.post('/reports/combined-csv', params);
  },
};
