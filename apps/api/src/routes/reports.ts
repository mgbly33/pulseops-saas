import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireWorkspaceRole } from '../lib/rbac.js';
import { recordAuditLog } from '../lib/audit.js';
import { resolveDateRange } from '../lib/dateRange.js';

const reportQuerySchema = z.object({
  dataset: z.enum(['ORDERS', 'CUSTOMERS', 'FUNNEL']),
  dimension: z.enum(['channel', 'planTier', 'status', 'month']),
  metric: z.enum(['SUM_REVENUE', 'COUNT', 'AVG_AMOUNT', 'AVG_HEALTH', 'PAID_USERS']),
  range: z.enum(['7d', '30d', '90d', '12m']).default('90d'),
});

const saveReportSchema = reportQuerySchema.extend({
  name: z.string().min(2).max(120),
  description: z.string().max(300).optional(),
  chartType: z.enum(['BAR', 'AREA', 'PIE', 'TABLE']).default('BAR'),
  pinned: z.boolean().optional(),
});

async function executeReportQuery(
  workspaceId: string,
  spec: z.infer<typeof reportQuerySchema>,
) {
  const resolved = resolveDateRange(spec.range);

  if (spec.dataset === 'ORDERS') {
    const orders = await prisma.order.findMany({
      where: { workspaceId, createdAt: { gte: resolved.start, lte: resolved.end } },
      select: { amount: true, status: true, channel: true, planTier: true, createdAt: true },
    });

    const groups = new Map<string, { sum: number; count: number; paidSum: number; paidCount: number }>();
    for (const o of orders) {
      const key =
        spec.dimension === 'month'
          ? `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, '0')}`
          : spec.dimension === 'channel'
            ? o.channel
            : spec.dimension === 'planTier'
              ? o.planTier
              : o.status;
      const g = groups.get(key) ?? { sum: 0, count: 0, paidSum: 0, paidCount: 0 };
      g.sum += o.amount;
      g.count += 1;
      if (o.status === 'PAID') {
        g.paidSum += o.amount;
        g.paidCount += 1;
      }
      groups.set(key, g);
    }

    const rows = Array.from(groups.entries()).map(([label, g]) => {
      const value =
        spec.metric === 'COUNT'
          ? g.count
          : spec.metric === 'AVG_AMOUNT'
            ? g.paidCount > 0
              ? Math.round((g.paidSum / g.paidCount) * 100) / 100
              : 0
            : Math.round(g.paidSum * 100) / 100;
      return { label, value, count: g.count };
    });

    return spec.dimension === 'month'
      ? rows.sort((a, b) => a.label.localeCompare(b.label))
      : rows.sort((a, b) => b.value - a.value);
  }

  if (spec.dataset === 'CUSTOMERS') {
    const custs = await prisma.customer.findMany({
      where: { workspaceId },
      select: { channel: true, planTier: true, status: true, ltv: true, healthScore: true, createdAt: true },
    });

    const groups = new Map<string, { ltvSum: number; healthSum: number; count: number }>();
    for (const c of custs) {
      const key =
        spec.dimension === 'month'
          ? `${c.createdAt.getUTCFullYear()}-${String(c.createdAt.getUTCMonth() + 1).padStart(2, '0')}`
          : spec.dimension === 'channel'
            ? c.channel
            : spec.dimension === 'planTier'
              ? c.planTier
              : c.status;
      const g = groups.get(key) ?? { ltvSum: 0, healthSum: 0, count: 0 };
      g.ltvSum += c.ltv;
      g.healthSum += c.healthScore;
      g.count += 1;
      groups.set(key, g);
    }

    const rows = Array.from(groups.entries()).map(([label, g]) => {
      const value =
        spec.metric === 'COUNT'
          ? g.count
          : spec.metric === 'AVG_HEALTH'
            ? Math.round((g.healthSum / Math.max(1, g.count)) * 10) / 10
            : spec.metric === 'AVG_AMOUNT'
              ? Math.round((g.ltvSum / Math.max(1, g.count)) * 100) / 100
              : Math.round(g.ltvSum * 100) / 100;
      return { label, value, count: g.count };
    });

    return spec.dimension === 'month'
      ? rows.sort((a, b) => a.label.localeCompare(b.label))
      : rows.sort((a, b) => b.value - a.value);
  }

  // FUNNEL dataset
  const funnel = await prisma.funnelStat.findMany({
    where: { workspaceId, date: { gte: resolved.start, lte: resolved.end } },
    select: { channel: true, date: true, visitors: true, signups: true, trials: true, paidUsers: true },
  });

  const groups = new Map<string, { visitors: number; paidUsers: number; count: number }>();
  for (const f of funnel) {
    const key =
      spec.dimension === 'month'
        ? `${f.date.getUTCFullYear()}-${String(f.date.getUTCMonth() + 1).padStart(2, '0')}`
        : f.channel;
    const g = groups.get(key) ?? { visitors: 0, paidUsers: 0, count: 0 };
    g.visitors += f.visitors;
    g.paidUsers += f.paidUsers;
    g.count += 1;
    groups.set(key, g);
  }

  const rows = Array.from(groups.entries()).map(([label, g]) => ({
    label,
    value: spec.metric === 'COUNT' ? g.visitors : g.paidUsers,
    count: g.visitors,
  }));

  return spec.dimension === 'month'
    ? rows.sort((a, b) => a.label.localeCompare(b.label))
    : rows.sort((a, b) => b.value - a.value);
}

export async function reportsRoutes(app: FastifyInstance) {
  const readGuard = requireWorkspaceRole(['OWNER', 'ADMIN', 'ANALYST']);
  const writeGuard = requireWorkspaceRole(['OWNER', 'ADMIN']);

  app.get(
    '/api/reports',
    {
      preHandler: [readGuard],
      schema: { tags: ['Reports'], summary: 'List saved custom BI reports' },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const reports = await prisma.savedReport.findMany({
        where: { workspaceId },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      });
      return { currency, reports };
    },
  );

  app.post(
    '/api/reports/query',
    {
      preHandler: [readGuard],
      schema: { tags: ['Reports'], summary: 'Run an ad-hoc SQL-free multi-dimensional BI query' },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const spec = reportQuerySchema.parse(request.body);
      const rows = await executeReportQuery(workspaceId, spec);
      const total = Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100;
      return { currency, spec, total, rows };
    },
  );

  app.post(
    '/api/reports',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Reports'], summary: 'Save a custom BI report to workspace library' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = saveReportSchema.parse(request.body);

      const report = await prisma.savedReport.create({
        data: {
          workspaceId,
          name: body.name.trim(),
          description: (body.description ?? '').trim(),
          dataset: body.dataset,
          dimension: body.dimension,
          metric: body.metric,
          chartType: body.chartType,
          range: body.range,
          pinned: body.pinned ?? false,
        },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'BI_REPORT_SAVED',
        targetType: 'SavedReport',
        targetId: report.id,
        detail: { name: report.name, dataset: report.dataset, dimension: report.dimension, metric: report.metric },
      });

      return reply.status(201).send({ report });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/reports/:id',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Reports'], summary: 'Delete a saved BI report' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const existing = await prisma.savedReport.findFirst({ where: { id: request.params.id, workspaceId } });
      if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Report not found.' });

      await prisma.savedReport.delete({ where: { id: existing.id } });
      return reply.send({ deleted: true, id: existing.id });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/reports/:id/export.csv',
    {
      preHandler: [readGuard],
      schema: { tags: ['Reports'], summary: 'Export saved BI report data as UTF-8 BOM CSV' },
    },
    async (request, reply) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const report = await prisma.savedReport.findFirst({ where: { id: request.params.id, workspaceId } });
      if (!report) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Report not found.' });

      const rows = await executeReportQuery(workspaceId, {
        dataset: report.dataset as 'ORDERS' | 'CUSTOMERS' | 'FUNNEL',
        dimension: report.dimension as 'channel' | 'planTier' | 'status' | 'month',
        metric: report.metric as 'SUM_REVENUE' | 'COUNT' | 'AVG_AMOUNT' | 'AVG_HEALTH' | 'PAID_USERS',
        range: report.range as '7d' | '30d' | '90d' | '12m',
      });

      const lines = [`Dimension (${report.dimension}),Value (${report.metric} / ${currency}),Records`];
      for (const r of rows) {
        lines.push(`"${r.label.replace(/"/g, '""')}",${r.value},${r.count}`);
      }
      const csv = '\uFEFF' + lines.join('\r\n');
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="pulseops-report-${report.id.slice(0, 8)}.csv"`)
        .send(csv);
    },
  );
}
