import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireWorkspaceRole } from '../lib/rbac.js';
import { recordAuditLog } from '../lib/audit.js';
import { resolveDateRange } from '../lib/dateRange.js';

interface OrdersQuery {
  page?: string;
  pageSize?: string;
  status?: string;
  channel?: string;
  planTier?: string;
  search?: string;
  range?: string;
  sortBy?: string;
  sortDir?: string;
}

const patchOrderSchema = z.object({
  status: z.enum(['PAID', 'PENDING', 'REFUNDED', 'FAILED']).optional(),
  note: z.string().max(500).nullable().optional(),
  invoiced: z.boolean().optional(),
});

const bulkOrderActionSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['MARK_INVOICED', 'MARK_REFUNDED', 'MARK_PAID']),
});

function buildOrdersWhere(workspaceId: string, q: OrdersQuery) {
  const where: Record<string, unknown> = { workspaceId };

  if (q.status && q.status !== 'ALL') {
    where.status = q.status;
  }
  if (q.channel && q.channel !== 'ALL') {
    where.channel = q.channel;
  }
  if (q.planTier && q.planTier !== 'ALL') {
    where.planTier = q.planTier;
  }
  if (q.range && q.range !== 'ALL') {
    const resolved = resolveDateRange(q.range);
    where.createdAt = { gte: resolved.start, lte: resolved.end };
  }
  if (q.search && q.search.trim().length > 0) {
    const term = q.search.trim();
    where.OR = [
      { orderCode: { contains: term } },
      { note: { contains: term } },
      { customer: { companyName: { contains: term } } },
      { customer: { contactName: { contains: term } } },
      { customer: { email: { contains: term } } },
    ];
  }

  return where;
}

function escapeCsvCell(val: unknown): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function ordersRoutes(app: FastifyInstance) {
  const readGuard = requireWorkspaceRole(['OWNER', 'ADMIN', 'ANALYST']);
  const writeGuard = requireWorkspaceRole(['OWNER', 'ADMIN']);

  // List Orders with server-side pagination, filtering & sorting
  app.get<{ Querystring: OrdersQuery }>(
    '/api/orders',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Orders'],
        summary: 'Paginated order list with filters, search, and sorting',
      },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const q = request.query;
      const page = Math.max(1, Number(q.page) || 1);
      const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 15));

      const allowedSortFields = new Set(['createdAt', 'amount', 'status', 'orderCode']);
      const sortBy = q.sortBy && allowedSortFields.has(q.sortBy) ? q.sortBy : 'createdAt';
      const sortDir = q.sortDir === 'asc' ? 'asc' : 'desc';

      const where = buildOrdersWhere(workspaceId, q);

      const [total, items, statusAgg] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          include: {
            customer: {
              select: {
                id: true,
                companyName: true,
                contactName: true,
                email: true,
                planTier: true,
                healthScore: true,
              },
            },
          },
          orderBy: { [sortBy]: sortDir },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.order.groupBy({
          by: ['status'],
          where,
          _sum: { amount: true },
          _count: { _all: true },
        }),
      ]);

      const summary = {
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        refundedAmount: 0,
        paidCount: 0,
        refundedCount: 0,
      };
      for (const row of statusAgg) {
        const amt = Math.round((row._sum.amount ?? 0) * 100) / 100;
        summary.totalAmount = Math.round((summary.totalAmount + amt) * 100) / 100;
        if (row.status === 'PAID') {
          summary.paidAmount = amt;
          summary.paidCount = row._count._all;
        } else if (row.status === 'PENDING') {
          summary.pendingAmount = amt;
        } else if (row.status === 'REFUNDED') {
          summary.refundedAmount = amt;
          summary.refundedCount = row._count._all;
        }
      }

      return {
        currency,
        summary,
        items,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  // UTF-8 BOM CSV export matching current filters
  app.get<{ Querystring: OrdersQuery }>(
    '/api/orders/export.csv',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Orders'],
        summary: 'Export filtered orders as UTF-8 BOM CSV',
      },
    },
    async (request, reply) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const where = buildOrdersWhere(workspaceId, request.query);

      const orders = await prisma.order.findMany({
        where,
        include: {
          customer: {
            select: { companyName: true, contactName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });

      const headers = [
        'Order Code',
        'Company',
        'Contact',
        'Email',
        'Plan Tier',
        'Channel',
        'Status',
        `Amount (${currency})`,
        'Invoiced',
        'Note',
        'Created At (UTC)',
      ];

      const lines = [headers.map(escapeCsvCell).join(',')];
      for (const o of orders) {
        lines.push(
          [
            o.orderCode,
            o.customer.companyName,
            o.customer.contactName,
            o.customer.email,
            o.planTier,
            o.channel,
            o.status,
            o.amount.toFixed(2),
            o.invoiced ? 'YES' : 'NO',
            o.note ?? '',
            o.createdAt.toISOString(),
          ]
            .map(escapeCsvCell)
            .join(','),
        );
      }

      const bomCsv = '\uFEFF' + lines.join('\r\n');
      const stamp = new Date().toISOString().slice(0, 10);

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="pulseops-orders-${stamp}.csv"`)
        .send(bomCsv);
    },
  );

  // Order detail + audit timeline
  app.get<{ Params: { id: string } }>(
    '/api/orders/:id',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Orders'],
        summary: 'Get order detail and audit timeline',
      },
    },
    async (request, reply) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const order = await prisma.order.findFirst({
        where: { id: request.params.id, workspaceId },
        include: {
          customer: true,
        },
      });

      if (!order) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Order not found.' });
      }

      const logs = await prisma.auditLog.findMany({
        where: {
          workspaceId,
          targetType: 'Order',
          targetId: { in: [order.id, order.orderCode] },
        },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });

      return { currency, order, timeline: logs };
    },
  );

  // Update order status / invoiced / note (OWNER | ADMIN only)
  app.patch<{ Params: { id: string } }>(
    '/api/orders/:id',
    {
      preHandler: [writeGuard],
      schema: {
        tags: ['Orders'],
        summary: 'Update order status (e.g. refund), invoice flag, or note',
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = patchOrderSchema.parse(request.body);

      const existing = await prisma.order.findFirst({
        where: { id: request.params.id, workspaceId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Order not found.' });
      }

      const updated = await prisma.order.update({
        where: { id: existing.id },
        data: {
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
          ...(body.invoiced !== undefined ? { invoiced: body.invoiced } : {}),
        },
        include: {
          customer: {
            select: {
              id: true,
              companyName: true,
              contactName: true,
              email: true,
              planTier: true,
              healthScore: true,
            },
          },
        },
      });

      // Keep customer LTV consistent if payment status changed
      if (body.status && body.status !== existing.status) {
        let ltvDelta = 0;
        if (existing.status === 'PAID' && body.status !== 'PAID') {
          ltvDelta = -existing.amount;
        } else if (existing.status !== 'PAID' && body.status === 'PAID') {
          ltvDelta = existing.amount;
        }
        if (ltvDelta !== 0) {
          const customer = await prisma.customer.findUnique({ where: { id: existing.customerId } });
          if (customer) {
            await prisma.customer.update({
              where: { id: existing.customerId },
              data: { ltv: Math.max(0, Math.round((customer.ltv + ltvDelta) * 100) / 100) },
            });
          }
        }
      }

      const action =
        body.status === 'REFUNDED' && existing.status !== 'REFUNDED'
          ? 'ORDER_REFUNDED'
          : body.invoiced === true && !existing.invoiced
            ? 'ORDER_INVOICED'
            : 'ORDER_UPDATED';

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action,
        targetType: 'Order',
        targetId: existing.orderCode,
        detail: {
          orderId: existing.id,
          previousStatus: existing.status,
          newStatus: updated.status,
          invoiced: updated.invoiced,
          note: updated.note,
        },
      });

      return reply.send({ order: updated });
    },
  );

  // Bulk order operations (OWNER | ADMIN only)
  app.post(
    '/api/orders/bulk-action',
    {
      preHandler: [writeGuard],
      schema: {
        tags: ['Orders'],
        summary: 'Execute bulk invoice or status updates across selected orders',
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = bulkOrderActionSchema.parse(request.body);

      const targets = await prisma.order.findMany({
        where: { workspaceId, id: { in: body.orderIds } },
      });

      if (targets.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'No matching orders found.' });
      }

      let updatedCount = 0;
      for (const ord of targets) {
        if (body.action === 'MARK_INVOICED') {
          if (!ord.invoiced) {
            await prisma.order.update({ where: { id: ord.id }, data: { invoiced: true } });
            updatedCount++;
          }
        } else {
          const targetStatus = body.action === 'MARK_REFUNDED' ? 'REFUNDED' : 'PAID';
          if (ord.status !== targetStatus) {
            await prisma.order.update({ where: { id: ord.id }, data: { status: targetStatus } });
            const delta =
              ord.status === 'PAID' && targetStatus !== 'PAID'
                ? -ord.amount
                : ord.status !== 'PAID' && targetStatus === 'PAID'
                  ? ord.amount
                  : 0;
            if (delta !== 0) {
              const cust = await prisma.customer.findUnique({ where: { id: ord.customerId } });
              if (cust) {
                await prisma.customer.update({
                  where: { id: cust.id },
                  data: { ltv: Math.max(0, Math.round((cust.ltv + delta) * 100) / 100) },
                });
              }
            }
            updatedCount++;
          }
        }
      }

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: `BULK_${body.action}`,
        targetType: 'Order',
        targetId: `${targets.length}-orders`,
        detail: { action: body.action, requested: body.orderIds.length, updatedCount },
      });

      return reply.send({ updatedCount, action: body.action });
    },
  );
}
