import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireWorkspaceRole } from '../lib/rbac.js';
import { recordAuditLog } from '../lib/audit.js';

const createPlaybookSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(2).max(300),
  triggerType: z.enum(['AT_RISK_HIGH_LTV', 'EXPANSION_READY', 'UNINVOICED_PAID', 'HIGH_REFUND_RISK']),
  actionType: z.enum(['TAG_VIP_RESCUE', 'FLAG_UPSELL', 'AUTO_INVOICE', 'DISPATCH_DIGEST']),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const patchPlaybookSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  enabled: z.boolean().optional(),
});

export async function playbooksRoutes(app: FastifyInstance) {
  const readGuard = requireWorkspaceRole(['OWNER', 'ADMIN', 'ANALYST']);
  const writeGuard = requireWorkspaceRole(['OWNER', 'ADMIN']);

  app.get(
    '/api/playbooks',
    {
      preHandler: [readGuard],
      schema: { tags: ['Playbooks'], summary: 'List automated revenue playbooks and recent run logs' },
    },
    async (request) => {
      const { workspaceId } = request.workspaceCtx!;
      const [playbooks, runs] = await Promise.all([
        prisma.playbook.findMany({
          where: { workspaceId },
          include: { _count: { select: { runs: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.playbookRun.findMany({
          where: { workspaceId },
          include: { playbook: { select: { name: true, triggerType: true, actionType: true } } },
          orderBy: { executedAt: 'desc' },
          take: 20,
        }),
      ]);

      return {
        playbooks: playbooks.map((p) => ({
          ...p,
          config: (() => {
            try {
              return JSON.parse(p.configJson) as Record<string, unknown>;
            } catch {
              return {};
            }
          })(),
          runsCount: p._count.runs,
        })),
        runs: runs.map((r) => ({
          ...r,
          affected: (() => {
            try {
              return JSON.parse(r.affectedJson) as string[];
            } catch {
              return [];
            }
          })(),
        })),
      };
    },
  );

  app.post(
    '/api/playbooks',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Playbooks'], summary: 'Create a new revenue automation playbook' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = createPlaybookSchema.parse(request.body);

      const playbook = await prisma.playbook.create({
        data: {
          workspaceId,
          name: body.name.trim(),
          description: body.description.trim(),
          triggerType: body.triggerType,
          actionType: body.actionType,
          configJson: JSON.stringify(body.config ?? {}),
          enabled: body.enabled ?? true,
        },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'PLAYBOOK_CREATED',
        targetType: 'Playbook',
        targetId: playbook.id,
        detail: { name: playbook.name, triggerType: playbook.triggerType, actionType: playbook.actionType },
      });

      return reply.status(201).send({ playbook });
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/playbooks/:id',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Playbooks'], summary: 'Enable/disable or rename a playbook' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = patchPlaybookSchema.parse(request.body);

      const existing = await prisma.playbook.findFirst({ where: { id: request.params.id, workspaceId } });
      if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Playbook not found.' });

      const playbook = await prisma.playbook.update({ where: { id: existing.id }, data: body });
      return reply.send({ playbook });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/playbooks/:id',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Playbooks'], summary: 'Delete a playbook' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const existing = await prisma.playbook.findFirst({ where: { id: request.params.id, workspaceId } });
      if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Playbook not found.' });

      await prisma.playbook.delete({ where: { id: existing.id } });
      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'PLAYBOOK_DELETED',
        targetType: 'Playbook',
        targetId: existing.id,
        detail: { name: existing.name },
      });

      return reply.send({ deleted: true, id: existing.id });
    },
  );

  // Execute Playbook against live workspace data!
  app.post<{ Params: { id: string } }>(
    '/api/playbooks/:id/run',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Playbooks'], summary: 'Execute a revenue playbook against real workspace records' },
    },
    async (request, reply) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const started = Date.now();
      const pb = await prisma.playbook.findFirst({ where: { id: request.params.id, workspaceId } });
      if (!pb) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Playbook not found.' });

      const isCn = currency === 'CNY';
      let matchedCount = 0;
      let affected: string[] = [];
      let summary = '';

      if (pb.actionType === 'TAG_VIP_RESCUE' || pb.triggerType === 'AT_RISK_HIGH_LTV') {
        const targets = await prisma.customer.findMany({
          where: { workspaceId, status: 'AT_RISK', healthScore: { lte: 68 } },
          orderBy: { ltv: 'desc' },
          take: 15,
        });
        const tagLabel = isCn ? 'VIP挽留' : 'VIP Rescue';
        for (const c of targets) {
          const tags: string[] = (() => {
            try {
              return JSON.parse(c.tagsJson);
            } catch {
              return [];
            }
          })();
          if (!tags.includes(tagLabel)) {
            tags.unshift(tagLabel);
            await prisma.customer.update({ where: { id: c.id }, data: { tagsJson: JSON.stringify(tags.slice(0, 6)) } });
          }
        }
        matchedCount = targets.length;
        affected = targets.slice(0, 5).map((c) => c.companyName);
        summary = isCn
          ? `扫描命中 ${matchedCount} 家高危预警企业，已自动附加「${tagLabel}」跟进标签`
          : `Matched ${matchedCount} at-risk high-LTV accounts and applied "${tagLabel}" tag`;
      } else if (pb.actionType === 'FLAG_UPSELL' || pb.triggerType === 'EXPANSION_READY') {
        const targets = await prisma.customer.findMany({
          where: { workspaceId, status: 'ACTIVE', planTier: { in: ['STARTER', 'PRO'] }, healthScore: { gte: 85 } },
          orderBy: { healthScore: 'desc' },
          take: 15,
        });
        const tagLabel = isCn ? '高潜增购' : 'Expansion Ready';
        for (const c of targets) {
          const tags: string[] = (() => {
            try {
              return JSON.parse(c.tagsJson);
            } catch {
              return [];
            }
          })();
          if (!tags.includes(tagLabel)) {
            tags.unshift(tagLabel);
            await prisma.customer.update({ where: { id: c.id }, data: { tagsJson: JSON.stringify(tags.slice(0, 6)) } });
          }
        }
        matchedCount = targets.length;
        affected = targets.slice(0, 5).map((c) => c.companyName);
        summary = isCn
          ? `识别 ${matchedCount} 家高健康度非企业版账户，已标记「${tagLabel}」进入增购线索池`
          : `Identified ${matchedCount} healthy Pro/Starter accounts and tagged "${tagLabel}"`;
      } else if (pb.actionType === 'AUTO_INVOICE' || pb.triggerType === 'UNINVOICED_PAID') {
        const uninvoiced = await prisma.order.findMany({
          where: { workspaceId, status: 'PAID', invoiced: false },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        if (uninvoiced.length > 0) {
          await prisma.order.updateMany({
            where: { id: { in: uninvoiced.map((o) => o.id) } },
            data: { invoiced: true },
          });
        }
        matchedCount = uninvoiced.length;
        affected = uninvoiced.slice(0, 5).map((o) => o.orderCode);
        summary = isCn
          ? `已批量自动开票核销 ${matchedCount} 笔已结算订单`
          : `Automatically invoiced ${matchedCount} settled PAID orders`;
      } else {
        const since30 = new Date(Date.now() - 30 * 86400 * 1000);
        const refunds = await prisma.order.findMany({
          where: { workspaceId, status: 'REFUNDED', createdAt: { gte: since30 } },
          include: { customer: { select: { companyName: true } } },
          take: 15,
        });
        matchedCount = refunds.length;
        affected = refunds.slice(0, 5).map((r) => `${r.orderCode} (${r.customer.companyName})`);
        summary = isCn
          ? `已汇总近 30 日 ${matchedCount} 笔退款异常并生成风控派发摘要`
          : `Compiled ${matchedCount} 30-day refund events into risk escalation digest`;
      }

      const durationMs = Math.max(8, Date.now() - started);

      const [run] = await Promise.all([
        prisma.playbookRun.create({
          data: {
            workspaceId,
            playbookId: pb.id,
            status: matchedCount > 0 ? 'SUCCESS' : 'NO_MATCH',
            matchedCount,
            affectedJson: JSON.stringify(affected),
            summary,
            durationMs,
          },
          include: { playbook: { select: { name: true, triggerType: true, actionType: true } } },
        }),
        prisma.playbook.update({ where: { id: pb.id }, data: { lastRunAt: new Date() } }),
      ]);

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'PLAYBOOK_EXECUTED',
        targetType: 'Playbook',
        targetId: pb.id,
        detail: { name: pb.name, matchedCount, durationMs },
      });

      return reply.send({
        run: { ...run, affected },
      });
    },
  );
}
