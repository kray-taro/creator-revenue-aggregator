import { apiClient } from './apiClient';
import type { Client, ClientAggregate, PaginatedResponse, PlatformConnection, COAAccount, COAMapping } from '@/types';

export const clientService = {
  /** List all clients for the current bookkeeper */
  list(): Promise<Client[]> {
    return apiClient.get<Client[]>('/clients');
  },

  /** Fetch dashboard aggregates (pending counts, OAuth health) for all clients */
  listAggregates(): Promise<ClientAggregate[]> {
    return apiClient.get<ClientAggregate[]>('/clients/aggregates');
  },

  /** Get a single client by ID */
  get(clientId: string): Promise<Client> {
    return apiClient.get<Client>(`/clients/${clientId}`);
  },

  /** Create a new client and send invite email */
  create(data: { name: string; email: string; accountingMode: 'accrual' | 'cash' }): Promise<Client> {
    return apiClient.post<Client>('/clients', data);
  },

  /** Update client settings */
  update(clientId: string, patch: Partial<Pick<Client, 'name' | 'accountingMode' | 'qbCompanyId'>>): Promise<Client> {
    return apiClient.patch<Client>(`/clients/${clientId}`, patch);
  },

  /** Get OAuth platform connections for a client */
  getConnections(clientId: string): Promise<PlatformConnection[]> {
    return apiClient.get<PlatformConnection[]>(`/clients/${clientId}/connections`);
  },

  /** Send OAuth renewal reminder email to client for a specific platform */
  sendRenewal(clientId: string, platform: string): Promise<void> {
    return apiClient.post<void>(`/clients/${clientId}/connections/${platform}/send-renewal`);
  },

  /** Get QB Chart of Accounts for a client */
  getCOA(clientId: string): Promise<COAAccount[]> {
    return apiClient.get<COAAccount[]>(`/clients/${clientId}/coa`);
  },

  /** Get all COA mappings for a client */
  getMappings(clientId: string): Promise<COAMapping[]> {
    return apiClient.get<COAMapping[]>(`/clients/${clientId}/coa-mappings`);
  },

  /** Save a COA mapping */
  saveMapping(clientId: string, data: Omit<COAMapping, 'id' | 'clientId' | 'createdAt'>): Promise<COAMapping> {
    return apiClient.post<COAMapping>(`/clients/${clientId}/coa-mappings`, data);
  },
};
