import { apiClient } from './apiClient';
import type { PlatformConnection } from '@/types/client';
import type { PlatformName } from '@/types';

/**
 * OAuth-related API service.
 *
 * Maps to PRD:
 * - US-101: OAuth Connection Setup
 * - PRD §9: OAuth Health Monitoring
 * - US-304: Red Tab Send Renewal
 */
export const oauthService = {
  /**
   * Get all platform connections for a client.
   * PRD US-101 AC #5: "Dashboard shows: Client A: YouTube ✓, Patreon ✓, Gumroad ⏳"
   */
  async getConnections(clientId: string): Promise<PlatformConnection[]> {
    return apiClient.get<PlatformConnection[]>(`/clients/${clientId}/connections`);
  },

  /**
   * Initiate OAuth flow for a client + platform.
   * PRD US-101 AC #2-3: Generate auth URL and redirect client
   */
  async initiateAuth(clientId: string, platform: PlatformName): Promise<{ authUrl: string }> {
    return apiClient.post<{ authUrl: string }>('/oauth/initiate', { clientId, platform });
  },

  /**
   * Handle OAuth callback — exchange code for tokens.
   * PRD US-101 AC #4: "After approval, token stored encrypted"
   */
  async handleCallback(platform: string, code: string, state: string): Promise<{ success: boolean; platform: string }> {
    return apiClient.post<{ success: boolean; platform: string }>('/oauth/callback', { platform, code, state });
  },

  /**
   * Send OAuth renewal reminder email.
   * PRD US-304 AC: "Send Renewal → Emails client with Auth Proxy Portal link"
   */
  async sendRenewal(clientId: string, platform: string): Promise<void> {
    return apiClient.post<void>(`/clients/${clientId}/send-renewal`, { platform });
  },

  /**
   * Send bulk renewals for all expiring connections.
   * PRD §9: Day 30/14/7 warning workflow
   */
  async sendAllRenewals(): Promise<{ sent: number }> {
    return apiClient.post<{ sent: number }>('/oauth/send-renewals');
  },
};
