import type { Client, ClientAggregate, DashboardAggregates } from '@/types';

export const mockClients: Client[] = [
  {
    id: 'client-001', name: 'Jane Doe', email: 'jane@example.com',
    accountingMode: 'accrual', qbCompanyId: 'QB-COMP-001',
    createdAt: '2026-01-15T10:00:00Z', updatedAt: '2026-04-01T02:34:00Z',
  },
  {
    id: 'client-002', name: 'John Smith', email: 'john@example.com',
    accountingMode: 'cash', qbCompanyId: 'QB-COMP-002',
    createdAt: '2026-01-20T10:00:00Z', updatedAt: '2026-04-02T09:10:00Z',
  },
  {
    id: 'client-003', name: 'Emma Lee', email: 'emma@example.com',
    accountingMode: 'accrual', qbCompanyId: 'QB-COMP-003',
    createdAt: '2026-02-01T10:00:00Z', updatedAt: '2026-03-28T18:00:00Z',
  },
];

export const mockAggregates: ClientAggregate[] = [
  {
    clientId: 'client-001', clientName: 'Jane Doe', clientEmail: 'jane@example.com',
    accountingMode: 'accrual', pendingCount: 9, greenCount: 5, yellowCount: 3, redCount: 2,
    syncStatus: 'pending_review', lastSyncDate: '2026-04-01T02:34:00Z',
    qbCompanyId: 'QB-COMP-001',
    oauthHealth: {
      status: 'warning',
      connectedPlatforms: ['youtube', 'patreon', 'gumroad', 'substack', 'shopify'],
      expiringPlatforms: [{ platform: 'youtube', expiresAt: '2026-05-05T00:00:00Z', daysUntilExpiry: 5 }],
      expiredPlatforms: [],
    },
  },
  {
    clientId: 'client-002', clientName: 'John Smith', clientEmail: 'john@example.com',
    accountingMode: 'cash', pendingCount: 0, greenCount: 0, yellowCount: 0, redCount: 0,
    syncStatus: 'synced', lastSyncDate: '2026-04-02T09:10:00Z',
    qbCompanyId: 'QB-COMP-002',
    oauthHealth: {
      status: 'healthy',
      connectedPlatforms: ['youtube', 'patreon', 'stripe'],
      expiringPlatforms: [],
      expiredPlatforms: [],
    },
  },
  {
    clientId: 'client-003', clientName: 'Emma Lee', clientEmail: 'emma@example.com',
    accountingMode: 'accrual', pendingCount: 23, greenCount: 0, yellowCount: 0, redCount: 1,
    syncStatus: 'error', lastSyncDate: '2026-03-28T18:00:00Z',
    qbCompanyId: 'QB-COMP-003',
    oauthHealth: {
      status: 'critical',
      connectedPlatforms: ['youtube', 'gumroad'],
      expiringPlatforms: [],
      expiredPlatforms: [{ platform: 'patreon', expiresAt: '2026-03-28T00:00:00Z', daysUntilExpiry: -4 }],
    },
  },
];

export const mockDashboardAggregates: DashboardAggregates = {
  totalPending: 32,
  totalSynced: 148,
  totalErrors: 3,
  oauthHealthy: 1,
  oauthWarning: 1,
  oauthCritical: 1,
  lastSyncAt: '2026-04-02T09:10:00Z',
  recentActivity: [
    { id: 'act-001', type: 'approval', clientId: 'client-002', clientName: 'John Smith', description: '23 transactions bulk approved and synced to QuickBooks', timestamp: '2026-04-02T09:10:00Z' },
    { id: 'act-002', type: 'oauth', clientId: 'client-001', clientName: 'Jane Doe', description: 'YouTube OAuth expiration warning sent (5 days remaining)', timestamp: '2026-04-01T08:00:00Z' },
    { id: 'act-003', type: 'sync', clientId: 'client-002', clientName: 'John Smith', description: 'Nightly sync completed — 23 transactions ingested from 3 platforms', timestamp: '2026-04-01T02:34:00Z' },
    { id: 'act-004', type: 'error', clientId: 'client-003', clientName: 'Emma Lee', description: 'Patreon OAuth expired — 23 transactions pending authorization', timestamp: '2026-03-28T18:00:00Z' },
    { id: 'act-005', type: 'client_added', clientId: 'client-001', clientName: 'Jane Doe', description: 'New client onboarded — 5 platforms connected', timestamp: '2026-01-15T10:00:00Z' },
  ],
};
