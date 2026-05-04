export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: ApiError;
}

export interface SearchQuery {
  q: string;
  platform?: string;
  clientId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  page?: number;
  pageSize?: number;
}

export interface ActivityEvent {
  id: string;
  type: 'sync' | 'approval' | 'oauth' | 'error' | 'client_added';
  clientId: string;
  clientName: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface DashboardAggregates {
  totalPending: number;
  totalSynced: number;
  totalErrors: number;
  oauthHealthy: number;
  oauthWarning: number;
  oauthCritical: number;
  lastSyncAt?: string;
  recentActivity: ActivityEvent[];
}
