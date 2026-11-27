import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireWorkspaceRole } from '../lib/rbac.js';
import { recordAuditLog } from '../lib/audit.js';

interface CustomersQuery {
  page?: string;
  pageSize?: string;
  status?: string;
  planTier?: string;
  channel?: string;
  search?: string;
  sortBy?: string;
  sortDir?: string;
}

const createCustomerSchema = z.object({
  companyName: z.string().min(2).max(100),
  contactName: z.string().min(2).max(60),
  email: z.string().email(),
  planTier: z.enum(['STARTER', 'PRO', 'ENTERPRISE']),
  channel: z.enum(['ORGANIC', 'PAID_SEARCH', 'SOCIAL', 'PARTNER']),
  healthScore: z.number().int().min(0).max(100).optional(),
  status: z.enum(['ACTIVE', 'AT_RISK', 'CHURNED']).optional(),
  tags: z.array(z.string().min(1).max(24)).max(8).optional(),
});

const patchCustomerSchema = z.object({
  companyName: z.string().min(2).max(100).optional(),
  contactName: z.string().min(2).max(60).optional(),
  planTier: z.enum(['STARTER', 'PRO', 'ENTERPRISE']).optional(),
  healthScore: z.number().int().min(0).max(100).optional(),
  status: z.enum(['ACTIVE', 'AT_RISK', 'CHURNED']).optional(),
  tags: z.array(z.string().min(1).max(24)).max(8).optional(),
});

export async function customersRoutes(app: FastifyInstance) {
  const readGuard = requireWorkspaceRole(['OWNER', 'ADMIN', 'ANALYST']);
  const writeGuard = requireWorkspaceRole(['OWNER', 'ADMIN']);

  // Account Health vs. LTV Risk Quadrant Scatter Matrix
  app.get(
    '/api/customers/risk-matrix',
    {
      preHandler: [readGuard],
      schema: { tags: ['Customers'], summary: 'Customer Health Score vs LTV quadrant scatter dataset' },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const customers = await prisma.customer.findMany({
        where: { workspaceId },
        select: {
          id: true,
          companyName: true,
          planTier: true,
          healthScore: true,
          status: true,
          ltv: true,
        },
        orderBy: { ltv: 'desc' },
        take: 100,
      });

      const medianLtv =
        customers.length > 0
          ? Math.round(customers[Math.floor(customers.length / 2)].ltv)
          : currency === 'USD'
            ? 4000
            : 25000;

      return {
        currency,
        medianLtv,
        healthThreshold: 65,
        points: customers,
      };
    },
  );

  app.get<{ Querystring: CustomersQuery }>(
    '/api/customers',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Customers'],
        summary: 'Paginated enterprise customer directory with health score and LTV',
      },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const q = request.query;
      const page = Math.max(1, Number(q.page) || 1);
      const pageSize = Math.min(100, Math.max(6, Number(q.pageSize) || 12));

      const where: Record<string, unknown> = { workspaceId };
      if (q.status && q.status !== 'ALL') where.status = q.status;
      if (q.planTier && q.planTier !== 'ALL') where.planTier = q.planTier;
      if (q.channel && q.channel !== 'ALL') where.channel = q.channel;
      if (q.search && q.search.trim().length > 0) {
        const term = q.search.trim();
        where.OR = [
          { companyName: { contains: term } },
          { contactName: { contains: term } },
          { email: { contains: term } },
          { tagsJson: { contains: term } },
        ];
      }

      const allowedSort = new Set(['ltv', 'healthScore', 'createdAt', 'lastLoginAt', 'companyName']);
      const sortBy = q.sortBy && allowedSort.has(q.sortBy) ? q.sortBy : 'ltv';
      const sortDir = q.sortDir === 'asc' ? 'asc' : 'desc';

      const [total, rawItems, summaryAgg] = await Promise.all([
        prisma.customer.count({ where }),
        prisma.customer.findMany({
          where,
          include: {
            _count: { select: { orders: true } },
          },
          orderBy: { [sortBy]: sortDir },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.customer.groupBy({
          by: ['status'],
          where: { workspaceId },
          _count: { _all: true },
        }),
      ]);

      const items = rawItems.map((c) => ({
        ...c,
        tags: (() => {
          try {
            return JSON.parse(c.tagsJson) as string[];
          } catch {
            return [];
          }
        })(),
        ordersCount: c._count.orders,
      }));

      const summary = {
        ACTIVE: 0,
        AT_RISK: 0,
        CHURNED: 0,
      };
      for (const row of summaryAgg) {
        if (row.status === 'ACTIVE' || row.status === 'AT_RISK' || row.status === 'CHURNED') {
          summary[row.status] = row._count._all;
        }
      }

      return {
        currency,
        items,
        summary,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  app.post(
    '/api/customers',
    {
      preHandler: [writeGuard],
      schema: {
        tags: ['Customers'],
        summary: 'Create a new enterprise customer',
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = createCustomerSchema.parse(request.body);

      const healthScore = body.healthScore ?? 88;
      const status =
        body.status ?? (healthScore >= 70 ? 'ACTIVE' : healthScore >= 40 ? 'AT_RISK' : 'CHURNED');

      const created = await prisma.customer.create({
        data: {
          workspaceId,
          companyName: body.companyName.trim(),
          contactName: body.contactName.trim(),
          email: body.email.toLowerCase().trim(),
          planTier: body.planTier,
          channel: body.channel,
          healthScore,
          status,
          ltv: 0,
          tagsJson: JSON.stringify(body.tags ?? []),
          lastLoginAt: new Date(),
        },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'CUSTOMER_CREATED',
        targetType: 'Customer',
        targetId: created.id,
        detail: {
          companyName: created.companyName,
          planTier: created.planTier,
          channel: created.channel,
        },
      });

      return reply.status(201).send({
        customer: {
          ...created,
          tags: body.tags ?? [],
          ordersCount: 0,
        },
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/customers/:id',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Customers'],
        summary: 'Get customer profile and order history',
      },
    },
    async (request, reply) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const customer = await prisma.customer.findFirst({
        where: { id: request.params.id, workspaceId },
        include: {
          orders: {
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      });

      if (!customer) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Customer not found.' });
      }

      const tags = (() => {
        try {
          return JSON.parse(customer.tagsJson) as string[];
        } catch {
          return [];
        }
      })();

      const paidCount = customer.orders.filter((o) => o.status === 'PAID').length;
      const refundedCount = customer.orders.filter((o) => o.status === 'REFUNDED').length;

      return {
        currency,
        customer: {
          ...customer,
          tags,
          paidCount,
          refundedCount,
        },
      };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/customers/:id',
    {
      preHandler: [writeGuard],
      schema: {
        tags: ['Customers'],
        summary: 'Update customer tags, tier, health score, or status',
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = patchCustomerSchema.parse(request.body);

      const existing = await prisma.customer.findFirst({
        where: { id: request.params.id, workspaceId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Customer not found.' });
      }

      const updated = await prisma.customer.update({
        where: { id: existing.id },
        data: {
          ...(body.companyName !== undefined ? { companyName: body.companyName.trim() } : {}),
          ...(body.contactName !== undefined ? { contactName: body.contactName.trim() } : {}),
          ...(body.planTier !== undefined ? { planTier: body.planTier } : {}),
          ...(body.healthScore !== undefined ? { healthScore: body.healthScore } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.tags !== undefined ? { tagsJson: JSON.stringify(body.tags) } : {}),
        },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'CUSTOMER_UPDATED',
        targetType: 'Customer',
        targetId: existing.id,
        detail: {
          companyName: updated.companyName,
          status: updated.status,
          tags: body.tags,
        },
      });

      return reply.send({
        customer: {
          ...updated,
          tags: (() => {
            try {
              return JSON.parse(updated.tagsJson) as string[];
            } catch {
              return [];
            }
          })(),
        },
      });
    },
  );
}
