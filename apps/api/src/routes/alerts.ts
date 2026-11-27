import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireWorkspaceRole } from '../lib/rbac.js';
import { recordAuditLog } from '../lib/audit.js';

const createRuleSchema = z.object({
  name: z.string().min(2).max(120),
  metric: z.enum(['DAILY_REVENUE', 'REFUND_RATE', 'CONVERSION_RATE']),
  operator: z.enum(['LT', 'GT']),
  threshold: z.number().finite(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  enabled: z.boolean().optional(),
});

const patchRuleSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  metric: z.enum(['DAILY_REVENUE', 'REFUND_RATE', 'CONVERSION_RATE']).optional(),
  operator: z.enum(['LT', 'GT']).optional(),
  threshold: z.number().finite().optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  enabled: z.boolean().optional(),
});

export async function alertsRoutes(app: FastifyInstance) {
  const readGuard = requireWorkspaceRole(['OWNER', 'ADMIN', 'ANALYST']);
  const writeGuard = requireWorkspaceRole(['OWNER', 'ADMIN']);

  app.get(
    '/api/alerts/rules',
    {
      preHandler: [readGuard],
      schema: { tags: ['Alerts'], summary: 'List alert rules for workspace' },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const rules = await prisma.alertRule.findMany({
        where: { workspaceId },
        include: {
          _count: { select: { events: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return { currency, rules };
    },
  );

  app.post(
    '/api/alerts/rules',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Alerts'], summary: 'Create an alert rule' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = createRuleSchema.parse(request.body);

      const rule = await prisma.alertRule.create({
        data: {
          workspaceId,
          name: body.name.trim(),
          metric: body.metric,
          operator: body.operator,
          threshold: body.threshold,
          severity: body.severity,
          enabled: body.enabled ?? true,
        },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'ALERT_RULE_CREATED',
        targetType: 'AlertRule',
        targetId: rule.id,
        detail: {
          name: rule.name,
          metric: rule.metric,
          operator: rule.operator,
          threshold: rule.threshold,
          severity: rule.severity,
        },
      });

      return reply.status(201).send({ rule });
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/alerts/rules/:id',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Alerts'], summary: 'Update or toggle an alert rule' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = patchRuleSchema.parse(request.body);

      const existing = await prisma.alertRule.findFirst({
        where: { id: request.params.id, workspaceId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Alert rule not found.' });
      }

      const rule = await prisma.alertRule.update({
        where: { id: existing.id },
        data: body,
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'ALERT_RULE_UPDATED',
        targetType: 'AlertRule',
        targetId: rule.id,
        detail: { name: rule.name, enabled: rule.enabled, threshold: rule.threshold },
      });

      return reply.send({ rule });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/alerts/rules/:id',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Alerts'], summary: 'Delete an alert rule' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const existing = await prisma.alertRule.findFirst({
        where: { id: request.params.id, workspaceId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Alert rule not found.' });
      }

      await prisma.alertRule.delete({ where: { id: existing.id } });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'ALERT_RULE_DELETED',
        targetType: 'AlertRule',
        targetId: existing.id,
        detail: { name: existing.name },
      });

      return reply.send({ deleted: true, id: existing.id });
    },
  );

  // Evaluate enabled rules against trailing 7 days real data
  app.post(
    '/api/alerts/evaluate',
    {
      preHandler: [writeGuard],
      schema: {
        tags: ['Alerts'],
        summary: 'Evaluate all enabled rules against trailing 7-day metrics',
      },
    },
    async (request, reply) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400 * 1000);

      const [rules, recentOrders, recentFunnel] = await Promise.all([
        prisma.alertRule.findMany({ where: { workspaceId, enabled: true } }),
        prisma.order.findMany({
          where: { workspaceId, createdAt: { gte: sevenDaysAgo, lte: now } },
          select: { amount: true, status: true },
        }),
        prisma.funnelStat.findMany({
          where: { workspaceId, date: { gte: sevenDaysAgo, lte: now } },
          select: { visitors: true, paidUsers: true },
        }),
      ]);

      const paidRevenue7d = recentOrders
        .filter((o) => o.status === 'PAID')
        .reduce((s, o) => s + o.amount, 0);
      const dailyRevenue = Math.round((paidRevenue7d / 7) * 100) / 100;

      const totalOrders7d = recentOrders.length;
      const refunded7d = recentOrders.filter((o) => o.status === 'REFUNDED').length;
      const refundRate = totalOrders7d > 0 ? Math.round((refunded7d / totalOrders7d) * 10000) / 100 : 0;

      const visitors7d = recentFunnel.reduce((s, f) => s + f.visitors, 0);
      const paidUsers7d = recentFunnel.reduce((s, f) => s + f.paidUsers, 0);
      const conversionRate = visitors7d > 0 ? Math.round((paidUsers7d / visitors7d) * 10000) / 100 : 0;

      const metricValues: Record<string, number> = {
        DAILY_REVENUE: dailyRevenue,
        REFUND_RATE: refundRate,
        CONVERSION_RATE: conversionRate,
      };

      const triggeredEvents = [];

      for (const rule of rules) {
        const actual = metricValues[rule.metric] ?? 0;
        const breached =
          (rule.operator === 'GT' && actual > rule.threshold) ||
          (rule.operator === 'LT' && actual < rule.threshold);

        if (breached) {
          const sym = currency === 'CNY' ? '¥' : '$';
          const formattedActual =
            rule.metric === 'DAILY_REVENUE'
              ? `${sym}${actual.toLocaleString()}`
              : `${actual.toFixed(2)}%`;
          const formattedThreshold =
            rule.metric === 'DAILY_REVENUE'
              ? `${sym}${rule.threshold.toLocaleString()}`
              : `${rule.threshold.toFixed(2)}%`;

          const opText = rule.operator === 'GT' ? '>' : '<';
          const message = `[${rule.severity}] ${rule.name}: 7d actual ${formattedActual} ${opText} threshold ${formattedThreshold}`;

          const event = await prisma.alertEvent.create({
            data: {
              workspaceId,
              ruleId: rule.id,
              actualValue: actual,
              message,
              resolved: false,
            },
            include: { rule: true },
          });
          triggeredEvents.push(event);
        }
      }

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'ALERT_EVALUATION_RUN',
        targetType: 'AlertRule',
        targetId: workspaceId,
        detail: {
          evaluatedRules: rules.length,
          triggeredCount: triggeredEvents.length,
          metrics: metricValues,
        },
      });

      return reply.send({
        currency,
        evaluatedRules: rules.length,
        triggeredCount: triggeredEvents.length,
        metrics: metricValues,
        triggeredEvents,
      });
    },
  );

  // Live 7-day telemetry snapshot for Alert Center gauges
  app.get(
    '/api/alerts/telemetry',
    {
      preHandler: [readGuard],
      schema: { tags: ['Alerts'], summary: 'Get real trailing 7-day telemetry metrics for alert gauges' },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400 * 1000);

      const [recentOrders, recentFunnel] = await Promise.all([
        prisma.order.findMany({
          where: { workspaceId, createdAt: { gte: sevenDaysAgo, lte: now } },
          select: { amount: true, status: true },
        }),
        prisma.funnelStat.findMany({
          where: { workspaceId, date: { gte: sevenDaysAgo, lte: now } },
          select: { visitors: true, paidUsers: true },
        }),
      ]);

      const paidRev = recentOrders.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.amount, 0);
      const dailyRevenue = Math.round((paidRev / 7) * 100) / 100;
      const totalOrders = recentOrders.length;
      const refunded = recentOrders.filter((o) => o.status === 'REFUNDED').length;
      const refundRate = totalOrders > 0 ? Math.round((refunded / totalOrders) * 10000) / 100 : 0;
      const visitors = recentFunnel.reduce((s, f) => s + f.visitors, 0);
      const paidUsers = recentFunnel.reduce((s, f) => s + f.paidUsers, 0);
      const conversionRate = visitors > 0 ? Math.round((paidUsers / visitors) * 10000) / 100 : 0;

      return {
        currency,
        metrics: {
          DAILY_REVENUE: dailyRevenue,
          REFUND_RATE: refundRate,
          CONVERSION_RATE: conversionRate,
        },
        sampleOrders7d: totalOrders,
      };
    },
  );

  // Resolve all pending alert events in one click
  app.post(
    '/api/alerts/events/resolve-all',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Alerts'], summary: 'Resolve all unresolved alert events' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const res = await prisma.alertEvent.updateMany({
        where: { workspaceId, resolved: false },
        data: { resolved: true },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'ALERT_EVENTS_RESOLVED_ALL',
        targetType: 'AlertEvent',
        targetId: workspaceId,
        detail: { resolvedCount: res.count },
      });

      return reply.send({ resolvedCount: res.count });
    },
  );

  app.get<{ Querystring: { resolved?: string } }>(
    '/api/alerts/events',
    {
      preHandler: [readGuard],
      schema: { tags: ['Alerts'], summary: 'List alert events and unresolved badge count' },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const resolvedParam = request.query.resolved;

      const where: Record<string, unknown> = { workspaceId };
      if (resolvedParam === 'true') where.resolved = true;
      else if (resolvedParam === 'false') where.resolved = false;

      const [events, unresolvedCount] = await Promise.all([
        prisma.alertEvent.findMany({
          where,
          include: { rule: true },
          orderBy: { triggeredAt: 'desc' },
          take: 100,
        }),
        prisma.alertEvent.count({ where: { workspaceId, resolved: false } }),
      ]);

      return { currency, unresolvedCount, events };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/alerts/events/:id/resolve',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Alerts'], summary: 'Mark an alert event as resolved' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const existing = await prisma.alertEvent.findFirst({
        where: { id: request.params.id, workspaceId },
        include: { rule: true },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Alert event not found.' });
      }

      const event = await prisma.alertEvent.update({
        where: { id: existing.id },
        data: { resolved: true },
        include: { rule: true },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'ALERT_EVENT_RESOLVED',
        targetType: 'AlertEvent',
        targetId: event.id,
        detail: { ruleName: existing.rule.name, actualValue: event.actualValue },
      });

      return reply.send({ event });
    },
  );
}
