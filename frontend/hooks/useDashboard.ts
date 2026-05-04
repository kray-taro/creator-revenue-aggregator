import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchService } from '@/services/searchService';
import type { DashboardAggregates, SearchQuery, PaginatedResponse, Transaction } from '@/types';

export const useDashboardAggregates = () => {
  return useQuery<DashboardAggregates, Error>({
    queryKey: ['dashboardAggregates'],
    queryFn: () => searchService.getDashboardAggregates(),
    staleTime: 60 * 1000 // 1 minute
  });
};

export const useSearchTransactions = (query: SearchQuery) => {
  return useQuery<PaginatedResponse<Transaction>, Error>({
    queryKey: ['search', query],
    queryFn: () => searchService.search(query),
    // keepPreviousData is removed in v5, use placeholderData: keepPreviousData instead, but for simplicity we will omit it or use placeholderData
    staleTime: 60 * 1000,
  });
};

export const useRequestCsvExport = () => {
  return useMutation({
    mutationFn: (params: { dateFrom?: string; dateTo?: string; clientIds?: string[] }) =>
      searchService.requestCsvExport(params)
  });
};
