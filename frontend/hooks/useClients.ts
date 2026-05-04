import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientService } from '@/services/clientService';
import type { Client, ClientAggregate } from '@/types';

export const useClients = () => {
  return useQuery<Client[], Error>({
    queryKey: ['clients'],
    queryFn: () => clientService.list(),
    staleTime: 5 * 60 * 1000
  });
};

export const useClientAggregates = () => {
  return useQuery<ClientAggregate[], Error>({
    queryKey: ['clientAggregates'],
    queryFn: () => clientService.listAggregates(),
    staleTime: 60 * 1000 // 1 minute
  });
};

export const useClient = (clientId: string) => {
  return useQuery<Client, Error>({
    queryKey: ['client', clientId],
    queryFn: () => clientService.get(clientId),
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateClient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; email: string; accountingMode: 'accrual' | 'cash' }) =>
      clientService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clientAggregates'] });
    },
  });
};

export const useUpdateClient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, patch }: { clientId: string; patch: Partial<Pick<Client, 'name' | 'accountingMode' | 'qbCompanyId'>> }) =>
      clientService.update(clientId, patch),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', variables.clientId] });
    },
  });
};
