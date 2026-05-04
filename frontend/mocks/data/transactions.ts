import type { Transaction } from '@/types';

export const mockTransactions: Transaction[] = [
  // ── GREEN: YouTube AdSense (high confidence) 
  {
    id: 'tx-001', clientId: 'client-001', platform: 'youtube',
    platformTransactionId: 'YT-2026-03-001', transactionDate: '2026-03-01',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 1818.18, platformFee: 818.18, netPayout: 1000.00,
    description: 'YouTube AdSense — March 2026', suggestedCategory: 'YouTube AdSense Revenue',
    confidenceScore: 0.97, status: 'pending_review', sourceHierarchy: 'primary',
    deduplicationHash: 'abc001',
    confidenceReasons: [
      { label: 'Pattern match', description: 'Matched 23 prior YouTube AdSense entries', score: 0.97 },
      { label: 'Amount variance', description: 'Within 1.4% of February average', score: 0.98 },
    ],
  },
  {
    id: 'tx-002', clientId: 'client-001', platform: 'youtube',
    platformTransactionId: 'YT-2026-03-002', transactionDate: '2026-03-15',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 363.64, platformFee: 163.64, netPayout: 200.00,
    description: 'YouTube Super Chat — March 2026', suggestedCategory: 'YouTube Super Chat',
    confidenceScore: 0.96, status: 'pending_review', sourceHierarchy: 'primary',
    deduplicationHash: 'abc002',
    confidenceReasons: [
      { label: 'Pattern match', description: 'Matched 11 prior Super Chat entries', score: 0.96 },
    ],
  },
  // GREEN: Patreon
  {
    id: 'tx-003', clientId: 'client-001', platform: 'patreon',
    platformTransactionId: 'PAT-2026-03-001', transactionDate: '2026-03-05',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 2500.00, platformFee: 237.50, netPayout: 2262.50,
    description: 'Patreon Pledges — March 2026', suggestedCategory: 'Patreon Subscription Revenue',
    confidenceScore: 0.98, status: 'pending_review', sourceHierarchy: 'primary',
    deduplicationHash: 'abc003',
    confidenceReasons: [
      { label: 'Exact platform match', description: 'Platform=patreon, desc contains "Pledges"', score: 0.98 },
      { label: 'Historical match', description: 'Last 8 Patreon payouts → Account 4200', score: 0.99 },
    ],
  },
  // GREEN: Substack
  {
    id: 'tx-004', clientId: 'client-001', platform: 'substack',
    platformTransactionId: 'SUB-2026-03-001', transactionDate: '2026-03-01',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 890.00, platformFee: 89.00, netPayout: 801.00,
    description: 'Substack Paid Subscriptions — March 2026',
    suggestedCategory: 'Substack Subscription Revenue',
    confidenceScore: 0.95, status: 'pending_review', sourceHierarchy: 'primary',
    deduplicationHash: 'abc004',
  },
  // GREEN: Shopify
  {
    id: 'tx-005', clientId: 'client-001', platform: 'shopify',
    platformTransactionId: 'SHOP-2026-03-001', transactionDate: '2026-03-10',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 4250.00, platformFee: 127.50, netPayout: 4122.50,
    description: 'Shopify Product Sales — March 2026', suggestedCategory: 'Product Sales Revenue',
    confidenceScore: 0.96, status: 'pending_review', sourceHierarchy: 'primary',
    deduplicationHash: 'abc005',
  },

  // ── YELLOW: First-time source 
  {
    id: 'tx-006', clientId: 'client-001', platform: 'gumroad',
    platformTransactionId: 'GUM-2026-03-001', transactionDate: '2026-03-22',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 450.00, platformFee: 45.00, netPayout: 405.00,
    description: 'Gumroad — "Advanced Creator Guide" digital product',
    suggestedCategory: 'Digital Product Sales',
    confidenceScore: 0.88, status: 'pending_review', sourceHierarchy: 'primary',
    yellowFlag: 'first_time_source',
    deduplicationHash: 'abc006',
  },

  // YELLOW: Potential duplicate (Gumroad + Stripe same transaction)
  {
    id: 'tx-007', clientId: 'client-001', platform: 'gumroad',
    platformTransactionId: 'GUM-2026-03-002', transactionDate: '2026-03-15',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 500.00, platformFee: 50.00, netPayout: 450.00,
    description: 'Gumroad — "YouTube Growth Playbook"',
    suggestedCategory: 'Digital Product Sales',
    confidenceScore: 0.82, status: 'pending_review', sourceHierarchy: 'primary',
    yellowFlag: 'potential_duplicate', deduplicationHash: 'abc007',
  },
  {
    id: 'tx-008', clientId: 'client-001', platform: 'stripe',
    platformTransactionId: 'STR-2026-03-001', transactionDate: '2026-03-15',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 500.00, platformFee: 14.50, netPayout: 485.50,
    description: 'Stripe — Gumroad processor payout',
    suggestedCategory: 'Digital Product Sales',
    confidenceScore: 0.82, status: 'pending_review', sourceHierarchy: 'processor',
    yellowFlag: 'potential_duplicate', deduplicationHash: 'abc007', duplicateOf: 'tx-007',
  },

  // YELLOW: Amount variance
  {
    id: 'tx-009', clientId: 'client-001', platform: 'patreon',
    platformTransactionId: 'PAT-2026-03-002', transactionDate: '2026-03-31',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 2350.00, platformFee: 223.25, netPayout: 2126.75,
    description: 'Patreon Pledges — Late March 2026 (variance)',
    suggestedCategory: 'Patreon Subscription Revenue',
    confidenceScore: 0.81, status: 'pending_review', sourceHierarchy: 'primary',
    yellowFlag: 'amount_variance', deduplicationHash: 'abc009',
  },

  // ── RED: OAuth expiring 
  {
    id: 'tx-010', clientId: 'client-001', platform: 'youtube',
    platformTransactionId: 'YT-ERR-001', transactionDate: '2026-04-01',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 0, platformFee: 0, netPayout: 0,
    description: 'YouTube auth expires in 5 days — 18 transactions pending',
    suggestedCategory: '', confidenceScore: 0, status: 'error',
    sourceHierarchy: 'primary', redFlag: 'oauth_expiring', deduplicationHash: '',
  },

  // RED: Validation error
  {
    id: 'tx-011', clientId: 'client-001', platform: 'patreon',
    platformTransactionId: 'PAT-ERR-001', transactionDate: '2026-03-28',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 1000.00, platformFee: 120.00, netPayout: 900.00,
    description: 'Patreon payout: Gross ($1,000) − Fees ($120) ≠ Net ($900). Diff: $20.',
    suggestedCategory: 'Patreon Subscription Revenue',
    confidenceScore: 0.40, status: 'error', sourceHierarchy: 'primary',
    redFlag: 'validation_error', deduplicationHash: 'abc011',
  },

  // CLIENT 002 — all synced
  {
    id: 'tx-020', clientId: 'client-002', platform: 'youtube',
    platformTransactionId: 'YT-2026-03-020', transactionDate: '2026-03-01',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-02T09:10:00Z',
    grossRevenue: 3636.36, platformFee: 1636.36, netPayout: 2000.00,
    description: 'YouTube AdSense — March 2026',
    suggestedCategory: 'YouTube AdSense Revenue',
    confidenceScore: 0.99, status: 'synced', sourceHierarchy: 'primary',
    deduplicationHash: 'abc020', qbEntryId: 'QB-10001', qbSyncStatus: 'synced',
  },

  // CLIENT 003 — OAuth expired
  {
    id: 'tx-030', clientId: 'client-003', platform: 'patreon',
    platformTransactionId: 'PAT-ERR-030', transactionDate: '2026-04-01',
    createdAt: '2026-04-01T02:34:00Z', updatedAt: '2026-04-01T02:34:00Z',
    grossRevenue: 0, platformFee: 0, netPayout: 0,
    description: 'Patreon auth expired Mar 28. 23 transactions pending.',
    suggestedCategory: '', confidenceScore: 0, status: 'error',
    sourceHierarchy: 'primary', redFlag: 'oauth_expired', deduplicationHash: '',
  },
];
