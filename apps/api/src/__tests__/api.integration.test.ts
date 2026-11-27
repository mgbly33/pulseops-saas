import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { seedDatabase } from '../../prisma/seed.js';

describe('PulseOps API Integration Suite', () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let analystToken: string;
  let wsCnId: string;
  let wsUsId: string;

  beforeAll(async () => {
    await seedDatabase(prisma);
    app = await buildApp({ logger: false });
    await app.ready();

    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@pulseops.io', password: 'PulseOwner2026!' },
    });
    expect(ownerLogin.statusCode).toBe(200);
    const ownerData = ownerLogin.json();
    ownerToken = ownerData.token;
    wsCnId = ownerData.workspaces.find((w: { slug: string }) => w.slug === 'nebula-cn').id;
    wsUsId = ownerData.workspaces.find((w: { slug: string }) => w.slug === 'nebula-us').id;

    const analystLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'analyst@pulseops.io', password: 'PulseView2026!' },
    });
    expect(analystLogin.statusCode).toBe(200);
    analystToken = analystLogin.json().token;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('serves OpenAPI documentation at /api/docs/json', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toBeDefined();
    expect(spec.info.title).toContain('PulseOps');
  });

  it('enforces multi-tenant workspace isolation between accounts and workspaces', async () => {
    // Register an external user with their own workspace
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'outsider@example.com',
        password: 'OutsiderPassword1!',
        name: 'External Founder',
        workspaceName: 'Isolated Tenant Co',
      },
    });
    expect(reg.statusCode).toBe(201);
    const outsiderToken = reg.json().token;

    // External user attempting to read Nebula CN must get 403
    const forbiddenRes = await app.inject({
      method: 'GET',
      url: '/api/analytics/overview?range=30d',
      headers: {
        authorization: `Bearer ${outsiderToken}`,
        'x-workspace-id': wsCnId,
      },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // Owner comparing CN vs US workspaces sees isolated currency and distinct order codes
    const [cnOrders, usOrders] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/orders?page=1&pageSize=10',
        headers: { authorization: `Bearer ${ownerToken}`, 'x-workspace-id': wsCnId },
      }),
      app.inject({
        method: 'GET',
        url: '/api/orders?page=1&pageSize=10',
        headers: { authorization: `Bearer ${ownerToken}`, 'x-workspace-id': wsUsId },
      }),
    ]);

    expect(cnOrders.json().currency).toBe('CNY');
    expect(usOrders.json().currency).toBe('USD');
    expect(cnOrders.json().items[0].orderCode).toContain('PO-CN-');
    expect(usOrders.json().items[0].orderCode).toContain('PO-US-');
  });

  it('blocks ANALYST role from all write operations with 403 FORBIDDEN', async () => {
    const ordersRes = await app.inject({
      method: 'GET',
      url: '/api/orders?page=1&pageSize=5',
      headers: { authorization: `Bearer ${analystToken}`, 'x-workspace-id': wsCnId },
    });
    expect(ordersRes.statusCode).toBe(200);
    const firstOrderId = ordersRes.json().items[0].id;

    const writeAttempts = await Promise.all([
      app.inject({
        method: 'PATCH',
        url: `/api/orders/${firstOrderId}`,
        headers: { authorization: `Bearer ${analystToken}`, 'x-workspace-id': wsCnId },
        payload: { status: 'REFUNDED' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/customers',
        headers: { authorization: `Bearer ${analystToken}`, 'x-workspace-id': wsCnId },
        payload: {
          companyName: 'Blocked Corp',
          contactName: 'Test',
          email: 'blocked@corp.io',
          planTier: 'PRO',
          channel: 'ORGANIC',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/api/alerts/rules',
        headers: { authorization: `Bearer ${analystToken}`, 'x-workspace-id': wsCnId },
        payload: {
          name: 'Blocked Rule',
          metric: 'REFUND_RATE',
          operator: 'GT',
          threshold: 5,
          severity: 'CRITICAL',
        },
      }),
      app.inject({
        method: 'POST',
        url: '/api/webhooks/simulate-order',
        headers: { authorization: `Bearer ${analystToken}`, 'x-workspace-id': wsCnId },
      }),
    ]);

    for (const res of writeAttempts) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('FORBIDDEN');
    }
  });

  it('computes accurate multi-dimensional analytics (overview, timeseries, channels, funnel, cohorts)', async () => {
    const headers = { authorization: `Bearer ${ownerToken}`, 'x-workspace-id': wsCnId };

    const [overview, timeseries, channels, funnel, cohorts] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/analytics/overview?range=90d', headers }),
      app.inject({ method: 'GET', url: '/api/analytics/timeseries?range=90d&granularity=week', headers }),
      app.inject({ method: 'GET', url: '/api/analytics/channels?range=90d', headers }),
      app.inject({ method: 'GET', url: '/api/analytics/funnel?range=90d', headers }),
      app.inject({ method: 'GET', url: '/api/analytics/cohorts', headers }),
    ]);

    expect(overview.statusCode).toBe(200);
    const ov = overview.json();
    expect(ov.kpis.totalRevenue.value).toBeGreaterThan(0);
    expect(ov.kpis.mrr.value).toBeGreaterThan(0);
    expect(ov.kpis.totalRevenue.sparkline).toHaveLength(7);
    expect(ov.kpis.conversionRate.value).toBeGreaterThan(0);

    expect(timeseries.statusCode).toBe(200);
    expect(timeseries.json().series.length).toBeGreaterThan(5);

    expect(channels.statusCode).toBe(200);
    const chData = channels.json();
    const totalShare = chData.channels.reduce((s: number, c: { sharePct: number }) => s + c.sharePct, 0);
    expect(totalShare).toBeGreaterThan(99);
    expect(totalShare).toBeLessThanOrEqual(100.5);

    expect(funnel.statusCode).toBe(200);
    const stages = funnel.json().stages;
    expect(stages).toHaveLength(4);
    expect(stages[0].count).toBeGreaterThan(stages[1].count);
    expect(stages[1].count).toBeGreaterThan(stages[2].count);
    expect(stages[2].count).toBeGreaterThan(stages[3].count);

    expect(cohorts.statusCode).toBe(200);
    expect(cohorts.json().cohorts).toHaveLength(6);
    expect(cohorts.json().cohorts[0].retention[0]).toBe(100);
  });

  it('exports valid UTF-8 BOM CSV with applied filters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/orders/export.csv?status=PAID',
      headers: { authorization: `Bearer ${ownerToken}`, 'x-workspace-id': wsCnId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const body = res.body;
    expect(body.startsWith('\uFEFF')).toBe(true);
    const lines = body.slice(1).split('\r\n');
    expect(lines[0]).toContain('Order Code');
    expect(lines.length).toBeGreaterThan(20);
    // Every exported row must match status=PAID
    for (const row of lines.slice(1, 10)) {
      expect(row).toContain(',PAID,');
    }
  });

  it('simulates real-time order, updates KPIs, and records audit log', async () => {
    const headers = { authorization: `Bearer ${ownerToken}`, 'x-workspace-id': wsUsId };

    const beforeOv = (await app.inject({ method: 'GET', url: '/api/analytics/overview?range=7d', headers })).json();
    const simRes = await app.inject({ method: 'POST', url: '/api/webhooks/simulate-order', headers });
    expect(simRes.statusCode).toBe(201);
    const simOrder = simRes.json().order;
    expect(simOrder.status).toBe('PAID');

    const afterOv = (await app.inject({ method: 'GET', url: '/api/analytics/overview?range=7d', headers })).json();
    expect(afterOv.kpis.totalRevenue.value).toBeCloseTo(beforeOv.kpis.totalRevenue.value + simOrder.amount, 1);

    const logsRes = await app.inject({ method: 'GET', url: '/api/audit-logs?action=LIVE_ORDER_SIMULATED', headers });
    expect(logsRes.statusCode).toBe(200);
    expect(logsRes.json().items.length).toBeGreaterThanOrEqual(1);
  });

  it('creates an alert rule, evaluates trailing 7d metrics, triggers event, and resolves it', async () => {
    const headers = { authorization: `Bearer ${ownerToken}`, 'x-workspace-id': wsCnId };

    // Create a guaranteed-to-trigger rule: DAILY_REVENUE > 0
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/alerts/rules',
      headers,
      payload: {
        name: 'Vitest Trigger Check',
        metric: 'DAILY_REVENUE',
        operator: 'GT',
        threshold: 1,
        severity: 'INFO',
        enabled: true,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdRuleId = createRes.json().rule.id;

    const evalRes = await app.inject({ method: 'POST', url: '/api/alerts/evaluate', headers });
    expect(evalRes.statusCode).toBe(200);
    const evalData = evalRes.json();
    expect(evalData.triggeredCount).toBeGreaterThanOrEqual(1);

    const matchedEvent = evalData.triggeredEvents.find((e: { ruleId: string }) => e.ruleId === createdRuleId);
    expect(matchedEvent).toBeDefined();
    expect(matchedEvent.resolved).toBe(false);

    const resolveRes = await app.inject({
      method: 'PATCH',
      url: `/api/alerts/events/${matchedEvent.id}/resolve`,
      headers,
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().event.resolved).toBe(true);

    // Cleanup test rule
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/alerts/rules/${createdRuleId}`,
      headers,
    });
    expect(delRes.statusCode).toBe(200);
  });

  it('supports v2 insights, tier breakdown, live feed, forecast simulator, bulk orders, team invite, and workspace creation', async () => {
    const headers = { authorization: `Bearer ${ownerToken}`, 'x-workspace-id': wsCnId };

    const [insights, tiers, feed, forecast, telemetry] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/analytics/insights?range=30d', headers }),
      app.inject({ method: 'GET', url: '/api/analytics/tier-breakdown', headers }),
      app.inject({ method: 'GET', url: '/api/analytics/live-feed', headers }),
      app.inject({
        method: 'GET',
        url: '/api/analytics/forecast?growthBoostPct=10&churnReductionPct=2&arpuLiftPct=12',
        headers,
      }),
      app.inject({ method: 'GET', url: '/api/alerts/telemetry', headers }),
    ]);

    expect(insights.statusCode).toBe(200);
    expect(insights.json().insights).toHaveLength(4);

    expect(tiers.statusCode).toBe(200);
    expect(tiers.json().monthly).toHaveLength(6);

    expect(feed.statusCode).toBe(200);
    expect(feed.json().feed.length).toBeGreaterThan(0);

    expect(forecast.statusCode).toBe(200);
    const fc = forecast.json();
    expect(fc.points).toHaveLength(12);
    expect(fc.summary.projectedArr).toBeGreaterThan(fc.summary.currentArr);
    expect(fc.summary.incrementalLift6m).toBeGreaterThan(0);

    expect(telemetry.statusCode).toBe(200);
    expect(telemetry.json().metrics.DAILY_REVENUE).toBeGreaterThan(0);

    // Bulk mark invoiced on 2 orders
    const ordList = (await app.inject({ method: 'GET', url: '/api/orders?page=1&pageSize=2', headers })).json();
    expect(ordList.summary.totalAmount).toBeGreaterThan(0);
    const bulkRes = await app.inject({
      method: 'POST',
      url: '/api/orders/bulk-action',
      headers,
      payload: {
        orderIds: ordList.items.map((o: { id: string }) => o.id),
        action: 'MARK_INVOICED',
      },
    });
    expect(bulkRes.statusCode).toBe(200);

    // Invite a member (OWNER allowed, ANALYST blocked)
    const inviteBlocked = await app.inject({
      method: 'POST',
      url: '/api/team/invite',
      headers: { authorization: `Bearer ${analystToken}`, 'x-workspace-id': wsCnId },
      payload: { name: 'Nope', email: 'nope@pulseops.io', role: 'ANALYST' },
    });
    expect(inviteBlocked.statusCode).toBe(403);

    const inviteOk = await app.inject({
      method: 'POST',
      url: '/api/team/invite',
      headers,
      payload: { name: 'Grace Lin', email: 'grace.test@pulseops.io', role: 'ADMIN' },
    });
    expect(inviteOk.statusCode).toBe(201);

    // Create a brand new isolated workspace
    const wsRes = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'APAC Expansion Hub', currency: 'USD' },
    });
    expect(wsRes.statusCode).toBe(201);
    expect(wsRes.json().workspace.role).toBe('OWNER');
  });

  it('runs v3 PulseAI Copilot, Playbooks Automation, Custom BI Reports, MRR Bridge, Risk Matrix, Global Rollup, and Signed Webhooks', async () => {
    const ownerHeaders = { authorization: `Bearer ${ownerToken}`, 'x-workspace-id': wsCnId };
    const analystHeaders = { authorization: `Bearer ${analystToken}`, 'x-workspace-id': wsCnId };

    // 1. PulseAI Copilot multi-intent queries
    const [askRisk, askChannel] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/copilot/ask',
        headers: ownerHeaders,
        payload: { question: '哪些高价值企业客户有流失风险？', lang: 'zh' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/copilot/ask',
        headers: analystHeaders,
        payload: { question: 'Which acquisition channel has the best ROI?', lang: 'en' },
      }),
    ]);
    expect(askRisk.statusCode).toBe(200);
    expect(askRisk.json().intent).toBe('AT_RISK_DIAGNOSTIC');
    expect(askRisk.json().table.rows.length).toBeGreaterThan(0);

    expect(askChannel.statusCode).toBe(200);
    expect(askChannel.json().intent).toBe('CHANNEL_ROI');

    // 2. Automated Revenue Playbooks (real execution + RBAC check)
    const pbList = (await app.inject({ method: 'GET', url: '/api/playbooks', headers: ownerHeaders })).json();
    expect(pbList.playbooks.length).toBeGreaterThanOrEqual(4);
    const firstPbId = pbList.playbooks[0].id;

    const analystRun = await app.inject({
      method: 'POST',
      url: `/api/playbooks/${firstPbId}/run`,
      headers: analystHeaders,
    });
    expect(analystRun.statusCode).toBe(403);

    const ownerRun = await app.inject({
      method: 'POST',
      url: `/api/playbooks/${firstPbId}/run`,
      headers: ownerHeaders,
    });
    expect(ownerRun.statusCode).toBe(200);
    expect(ownerRun.json().run.durationMs).toBeGreaterThan(0);

    // 3. Custom BI Report Builder (ad-hoc query, save, CSV export, delete)
    const biQuery = await app.inject({
      method: 'POST',
      url: '/api/reports/query',
      headers: ownerHeaders,
      payload: { dataset: 'ORDERS', dimension: 'channel', metric: 'SUM_REVENUE', range: '90d' },
    });
    expect(biQuery.statusCode).toBe(200);
    expect(biQuery.json().rows.length).toBeGreaterThan(0);

    const biSave = await app.inject({
      method: 'POST',
      url: '/api/reports',
      headers: ownerHeaders,
      payload: {
        name: 'Vitest BI Report',
        dataset: 'CUSTOMERS',
        dimension: 'planTier',
        metric: 'AVG_HEALTH',
        chartType: 'BAR',
        range: '12m',
      },
    });
    expect(biSave.statusCode).toBe(201);
    const savedId = biSave.json().report.id;

    const biCsv = await app.inject({
      method: 'GET',
      url: `/api/reports/${savedId}/export.csv`,
      headers: ownerHeaders,
    });
    expect(biCsv.statusCode).toBe(200);
    expect(biCsv.body.startsWith('\uFEFF')).toBe(true);

    const biDel = await app.inject({ method: 'DELETE', url: `/api/reports/${savedId}`, headers: ownerHeaders });
    expect(biDel.statusCode).toBe(200);

    // 4. MRR Waterfall Bridge, Customer Risk Matrix & Global Consolidated Rollup
    const [bridge, riskMatrix, globalRollup] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/analytics/mrr-bridge', headers: ownerHeaders }),
      app.inject({ method: 'GET', url: '/api/customers/risk-matrix', headers: ownerHeaders }),
      app.inject({ method: 'GET', url: '/api/analytics/global-rollup', headers: { authorization: `Bearer ${ownerToken}` } }),
    ]);

    expect(bridge.statusCode).toBe(200);
    expect(bridge.json().steps).toHaveLength(6);

    expect(riskMatrix.statusCode).toBe(200);
    expect(riskMatrix.json().points.length).toBeGreaterThan(20);

    expect(globalRollup.statusCode).toBe(200);
    expect(globalRollup.json().totals.workspacesCount).toBeGreaterThanOrEqual(2);
    expect(globalRollup.json().totals.consolidatedArrCny).toBeGreaterThan(0);

    // 5. Developers Webhook creation & HMAC-SHA256 signed test dispatch
    const whCreate = await app.inject({
      method: 'POST',
      url: '/api/developers/webhooks',
      headers: ownerHeaders,
      payload: { name: 'Vitest Hook', url: 'https://hooks.example.com/test', events: ['order.paid'] },
    });
    expect(whCreate.statusCode).toBe(201);
    const whId = whCreate.json().endpoint.id;
    expect(whCreate.json().endpoint.secret).toMatch(/^po_hook_/);

    const whTest = await app.inject({
      method: 'POST',
      url: `/api/developers/webhooks/${whId}/test`,
      headers: ownerHeaders,
    });
    expect(whTest.statusCode).toBe(200);
    expect(whTest.json().delivery.headers['X-PulseOps-Signature']).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);

    const whDel = await app.inject({ method: 'DELETE', url: `/api/developers/webhooks/${whId}`, headers: ownerHeaders });
    expect(whDel.statusCode).toBe(200);
  });
});
