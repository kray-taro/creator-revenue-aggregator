import type { PlatformName, TransactionStatus, QbSyncStatus, SourceHierarchy } from './transaction';

export type AccountingMode = 'accrual' | 'cash';

export interface Client {
  id: string;
  name: string;
  email: string;
  accountingMode: AccountingMode;
  qbCompanyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientAggregate {
  clientId: string;
  clientName: string;
  clientEmail: string;
  accountingMode: AccountingMode;
  pendingCount: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  syncStatus: 'synced' | 'pending_review' | 'error' | 'idle';
  oauthHealth: OAuthHealthSummary;
  lastSyncDate?: string;
  qbCompanyId?: string;
}

export interface OAuthHealthSummary {
  status: 'healthy' | 'warning' | 'critical';
  connectedPlatforms: PlatformName[];
  expiringPlatforms: PlatformExpiry[];
  expiredPlatforms: PlatformExpiry[];
}

export interface PlatformExpiry {
  platform: PlatformName;
  expiresAt: string;
  daysUntilExpiry: number;
}

export interface PlatformConnection {
  id: string;
  clientId: string;
  platform: PlatformName;
  status: 'connected' | 'expiring' | 'expired' | 'pending' | 'disconnected' | 'error';
  expiresAt?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  scopes?: string[];
}

export interface COAAccount {
  id: string;
  name: string;
  accountNumber?: string;
  type: string;
  subType?: string;
}

export interface COAMapping {
  id: string;
  clientId: string;
  platformCategory: string;
  platform: PlatformName;
  qbAccountId: string;
  qbAccountName: string;
  createdAt: string;
}
