import { http, HttpResponse, delay } from 'msw';
import { mockClients, mockAggregates, mockDashboardAggregates } from './data/clients';
import { mockTransactions } from './data/transactions';
import { mockConnections } from './data/connections';
import type { BulkApproveJob, Transaction } from '@/types';

const BASE = '/api';

export const handlers = [
  // ── Clients 
  http.get(`${BASE}/clients`, async () => {
    await delay(200);
    return HttpResponse.json(mockClients);
  }),

  http.get(`${BASE}/clients/aggregates`, async () => {
    await delay(300);
    return HttpResponse.json(mockAggregates);
  }),

  http.get(`${BASE}/clients/:clientId`, async ({ params }) => {
    await delay(150);
    const client = mockClients.find((c) => c.id === params.clientId);
    if (!client) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Client not found' }, { status: 404 });
    return HttpResponse.json(client);
  }),

  http.post(`${BASE}/clients`, async ({ request }) => {
    await delay(400);
    const body = await request.json() as { name: string; email: string; accountingMode: string };
    const newClient = {
      id: `client-${Date.now()}`, name: body.name, email: body.email,
      accountingMode: body.accountingMode, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(newClient, { status: 201 });
  }),

  // ── Transactions 
  http.get(`${BASE}/transactions`, async ({ request }) => {
    await delay(250);
    const url = new URL(request.url);
    const tab = url.searchParams.get('tab');
    let txs = mockTransactions;

    if (tab === 'green') txs = txs.filter((t) => (t.confidenceScore ?? 0) >= 0.95 && !t.yellowFlag && !t.redFlag);
    else if (tab === 'yellow') txs = txs.filter((t) => t.yellowFlag);
    else if (tab === 'red') txs = txs.filter((t) => t.redFlag || t.status === 'error');

    return HttpResponse.json({ data: txs, total: txs.length, page: 1, pageSize: 100, hasMore: false });
  }),

  http.get(`${BASE}/clients/:clientId/transactions`, async ({ params, request }) => {
    await delay(250);
    const url = new URL(request.url);
    const tab = url.searchParams.get('tab');
    let txs = mockTransactions.filter((t) => t.clientId === params.clientId);

    if (tab === 'green') txs = txs.filter((t) => (t.confidenceScore ?? 0) >= 0.95 && !t.yellowFlag && !t.redFlag);
    else if (tab === 'yellow') txs = txs.filter((t) => t.yellowFlag);
    else if (tab === 'red') txs = txs.filter((t) => t.redFlag || t.status === 'error');

    return HttpResponse.json({ data: txs, total: txs.length, page: 1, pageSize: 100, hasMore: false });
  }),

  // Review action
  http.post(`${BASE}/transactions/:txId/review`, async ({ params, request }) => {
    await delay(300);
    const body = await request.json() as { action: string };
    const tx = mockTransactions.find((t) => t.id === params.txId);
    if (!tx) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Transaction not found' }, { status: 404 });
    const updated = { ...tx, status: body.action === 'approve' ? 'approved' : tx.status };
    return HttpResponse.json(updated);
  }),

  // Map account
  http.patch(`${BASE}/transactions/:txId/map-account`, async ({ params, request }) => {
    await delay(200);
    const body = await request.json() as { qbAccountId: string };
    const tx = mockTransactions.find((t) => t.id === params.txId);
    if (!tx) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    return HttpResponse.json({ ...tx, qbAccountId: body.qbAccountId, status: 'approved' });
  }),

  // Resolve duplicate
  http.post(`${BASE}/transactions/:txId/resolve-duplicate`, async ({ params, request }) => {
    await delay(250);
    const body = await request.json() as { resolution: string };
    const tx = mockTransactions.find((t) => t.id === params.txId);
    if (!tx) return HttpResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    return HttpResponse.json({ ...tx, status: 'approved', yellowFlag: undefined });
  }),

  // Bulk approve
  http.post(`${BASE}/transactions/bulk-approve`, async () => {
    await delay(400);
    const job: BulkApproveJob = {
      jobId: `job-${Date.now()}`, status: 'queued',
      total: 5, processed: 0, succeeded: 0, failed: 0,
      startedAt: new Date().toISOString(),
    };
    return HttpResponse.json(job, { status: 202 });
  }),

  http.get(`${BASE}/transactions/bulk-approve/:jobId`, async () => {
    await delay(100);
    const job: BulkApproveJob = {
      jobId: 'job-mock', status: 'completed',
      total: 5, processed: 5, succeeded: 5, failed: 0,
      startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    };
    return HttpResponse.json(job);
  }),

  // ── Dashboard 
  http.get(`${BASE}/dashboard/aggregates`, async () => {
    await delay(300);
    return HttpResponse.json(mockDashboardAggregates);
  }),

  // ── COA 
  http.get(`${BASE}/clients/:clientId/coa`, async () => {
    await delay(200);
    return HttpResponse.json([
      { id: '4100', name: 'Advertising Income', accountNumber: '4100', type: 'Income' },
      { id: '4200', name: 'Subscription Revenue', accountNumber: '4200', type: 'Income' },
      { id: '4300', name: 'Product Sales', accountNumber: '4300', type: 'Income' },
      { id: '4400', name: 'Affiliate Income', accountNumber: '4400', type: 'Income' },
      { id: '4500', name: 'Other Revenue', accountNumber: '4500', type: 'Income' },
    ]);
  }),

  // ── OAuth renewals 
  http.post(`${BASE}/clients/:clientId/connections/:platform/send-renewal`, async () => {
    await delay(300);
    return new HttpResponse(null, { status: 204 });
  }),

  // ── Search 
  http.get(`${BASE}/search`, async ({ request }) => {
    await delay(300);
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const results = mockTransactions.filter(
      (t) =>
        t.description?.toLowerCase().includes(q) ||
        t.platform.includes(q) ||
        t.platformTransactionId.toLowerCase().includes(q)
    );
    return HttpResponse.json({ data: results, total: results.length, page: 1, pageSize: 100, hasMore: false });
  }),

  // ── Reports 
  http.post(`${BASE}/reports/combined-csv`, async () => {
    await delay(500);
    return HttpResponse.json({ downloadUrl: '/mock-report.csv' });
  }),

  // ── OAuth: Platform Connections (Sprint 2) 
  // PRD US-101 AC #5: "Dashboard shows: Client A: YouTube ✓, Patreon ✓, Gumroad ⏳"
  http.get(`${BASE}/clients/:clientId/connections`, async ({ params }) => {
    await delay(200);
    const connections = mockConnections[params.clientId as string] ?? [];
    return HttpResponse.json(connections);
  }),

  // PRD US-101 AC #2-3: Initiate OAuth flow — returns mock auth URL
  http.post(`${BASE}/oauth/initiate`, async ({ request }) => {
    await delay(300);
    const body = await request.json() as { clientId: string; platform: string };
    const authUrl = `/auth/callback/${body.platform}?code=mock-auth-code-${Date.now()}&state=mock-state-${Date.now()}`;
    return HttpResponse.json({ authUrl });
  }),

  // PRD US-101 AC #4: Exchange code for tokens (mock always succeeds)
  http.post(`${BASE}/oauth/callback`, async ({ request }) => {
    await delay(500);
    const body = await request.json() as { platform: string; code: string; state: string };
    return HttpResponse.json({ success: true, platform: body.platform });
  }),

  // PRD US-304: Send renewal reminder email
  http.post(`${BASE}/clients/:clientId/send-renewal`, async () => {
    await delay(300);
    return new HttpResponse(null, { status: 204 });
  }),

  // PRD §9: Bulk send renewals for all expiring connections
  http.post(`${BASE}/oauth/send-renewals`, async () => {
    await delay(400);
    return HttpResponse.json({ sent: 2 });
  }),

  // PRD §9: OAuth health check per client
  http.get(`${BASE}/oauth/health/:clientId`, async ({ params }) => {
    await delay(200);
    const connections = mockConnections[params.clientId as string] ?? [];
    const healthy = connections.filter((c) => c.status === 'connected').length;
    const expiring = connections.filter((c) => c.status === 'expiring').length;
    const expired = connections.filter((c) => c.status === 'expired').length;
    return HttpResponse.json({
      clientId: params.clientId,
      checkedAt: new Date().toISOString(),
      summary: { healthy, expiring, expired, total: connections.length },
    });
  }),
];
