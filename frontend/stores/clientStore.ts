'use client';
import { create } from 'zustand';
import type { Client, ClientAggregate } from '@/types';

interface ClientState {
  clients: Client[];
  aggregates: ClientAggregate[];
  activeClientId: string | null;
  isLoading: boolean;
  error: string | null;

  setClients: (clients: Client[]) => void;
  setAggregates: (aggregates: ClientAggregate[]) => void;
  setActiveClient: (id: string | null) => void;
  addClient: (client: Client) => void;
  updateClient: (id: string, patch: Partial<Client>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Derived selectors
  getActiveClient: () => Client | undefined;
  getActiveAggregate: () => ClientAggregate | undefined;
  getClientById: (id: string) => Client | undefined;
  getAggregateById: (id: string) => ClientAggregate | undefined;
}

export const useClientStore = create<ClientState>()((set, get) => ({
  clients: [],
  aggregates: [],
  activeClientId: null,
  isLoading: false,
  error: null,

  setClients: (clients) => set({ clients }),
  setAggregates: (aggregates) => set({ aggregates }),
  setActiveClient: (id) => set({ activeClientId: id }),
  addClient: (client) => set((s) => ({ clients: [...s.clients, client] })),
  updateClient: (id, patch) =>
    set((s) => ({
      clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  getActiveClient: () => {
    const { clients, activeClientId } = get();
    return clients.find((c) => c.id === activeClientId);
  },
  getActiveAggregate: () => {
    const { aggregates, activeClientId } = get();
    return aggregates.find((a) => a.clientId === activeClientId);
  },
  getClientById: (id) => get().clients.find((c) => c.id === id),
  getAggregateById: (id) => get().aggregates.find((a) => a.clientId === id),
}));
