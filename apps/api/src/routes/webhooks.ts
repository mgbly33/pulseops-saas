import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireWorkspaceRole } from '../lib/rbac.js';
import { recordAuditLog } from '../lib/audit.js';

export async function webhooksRoutes(app: FastifyInstance) {
  const writeGuard = requireWorkspaceRole(['OWNER', 'ADMIN']);

  app.post(
    '/api/webhooks/simulate-order',
    {
      preHandler: [writeGuard],
      schema: {
        tags: ['Webhooks'],
        summary: 'Inject a realistic real-time order event and refresh customer LTV',
      },
    },
    async (request, reply) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const body = (request.body as { customerId?: string } | null) ?? {};

      let customer = body.customerId
        ? await prisma.customer.findFirst({ where: { id: body.customerId, workspaceId } })
        : null;

      if (!customer) {
        const candidates = await prisma.customer.findMany({
          where: { workspaceId, status: { in: ['ACTIVE', 'AT_RISK'] } },
          take: 40,
        });

        if (candidates.length === 0) {
          return reply.status(400).send({
            error: 'NO_CUSTOMERS',
            message: 'No active customers exist in this workspace to simulate an order.',
          });
        }
        customer = candidates[Math.floor(Math.random() * candidates.length)];
      }
      const isCny = currency === 'CNY';

      const baseAmountMap: Record<string, number> = isCny
        ? { STARTER: 2200, PRO: 7600, ENTERPRISE: 26800 }
        : { STARTER: 349, PRO: 1180, ENTERPRISE: 3890 };

      const base = baseAmountMap[customer.planTier] ?? (isCny ? 6800 : 990);
      const amount = Math.round(base * (0.9 + Math.random() * 0.45));
      const prefix = isCny ? 'CN' : 'US';
      const orderCode = `PO-${prefix}-LIVE-${Date.now().toString().slice(-6)}`;

      const order = await prisma.order.create({
        data: {
          orderCode,
          workspaceId,
          customerId: customer.id,
          amount,
          status: 'PAID',
          channel: customer.channel,
          planTier: customer.planTier,
          note: isCny ? '实时交易脉冲注入 · 企业续费/扩容订单' : 'Live telemetry order · Subscription expansion',
          invoiced: true,
          createdAt: new Date(),
        },
        include: {
          customer: {
            select: {
              id: true,
              companyName: true,
              contactName: true,
              email: true,
              planTier: true,
            },
          },
        },
      });

      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          ltv: Math.round((customer.ltv + amount) * 100) / 100,
          lastLoginAt: new Date(),
          healthScore: Math.min(100, customer.healthScore + 2),
        },
      });

      // Also bump today's funnel paidUsers for consistency
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayStat = await prisma.funnelStat.findFirst({
        where: {
          workspaceId,
          channel: customer.channel,
          date: { gte: todayStart },
        },
      });
      if (todayStat) {
        await prisma.funnelStat.update({
          where: { id: todayStat.id },
          data: { paidUsers: todayStat.paidUsers + 1, trials: todayStat.trials + 1 },
        });
      }

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'LIVE_ORDER_SIMULATED',
        targetType: 'Order',
        targetId: order.orderCode,
        detail: {
          companyName: customer.companyName,
          amount,
          currency,
          planTier: customer.planTier,
        },
      });

      return reply.status(201).send({ currency, order });
    },
  );
}
