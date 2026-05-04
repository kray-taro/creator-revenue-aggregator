import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { oauthService } from '@/services/oauthService';
import type { PlatformConnection } from '@/types/client';
import type { PlatformName } from '@/types';

/**
 * Hook to fetch all OAuth connections for a given client.
 * Uses React Query for caching, stale‑time control and SSR hydration.
 */
export const useConnections = (clientId: string) => {
  return useQuery<PlatformConnection[], Error>({
    queryKey: ['connections', clientId],
    queryFn: () => oauthService.getConnections(clientId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
};

/**
 * Hook to initiate the OAuth flow for a client/platform.
 * Returns a mutation that resolves with the authorization URL.
 */
export const useInitiateAuth = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, platform }: { clientId: string; platform: PlatformName }) =>
      oauthService.initiateAuth(clientId, platform),
    onSuccess: (data) => {
      // Immediately redirect the user to the auth URL.
      window.location.href = data.authUrl;
    },
  });
};

/**
 * Hook to handle the OAuth callback (exchange code for tokens).
 * Expects the callback parameters to be passed in.
 */
export const useHandleCallback = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ platform, code, state }: { platform: string; code: string; state: string }) =>
      oauthService.handleCallback(platform, code, state),
    onSuccess: () => {
      // Invalidate connections cache to reflect newly linked platform.
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
};

/**
 * Hook to send a renewal reminder for a specific client/platform.
 */
export const useSendRenewal = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, platform }: { clientId: string; platform: string }) =>
      oauthService.sendRenewal(clientId, platform),
    onSuccess: () => {
      // Optionally refresh data.
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
};

/**
 * Hook to trigger bulk renewal for all expiring connections.
 */
export const useSendAllRenewals = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => oauthService.sendAllRenewals(),
    onSuccess: () => {
      // Refresh any UI that displays renewal status.
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
};
