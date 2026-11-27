import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireWorkspaceRole } from '../lib/rbac.js';
import { recordAuditLog } from '../lib/audit.js';

const updateRoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'ANALYST']),
});

const inviteMemberSchema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'ANALYST']),
});

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(80),
  currency: z.enum(['CNY', 'USD']),
});

interface AuditLogsQuery {
  page?: string;
  pageSize?: string;
  action?: string;
  targetType?: string;
  search?: string;
}

export async function teamRoutes(app: FastifyInstance) {
  const readGuard = requireWorkspaceRole(['OWNER', 'ADMIN', 'ANALYST']);
  const ownerGuard = requireWorkspaceRole(['OWNER']);

  app.get(
    '/api/team/members',
    {
      preHandler: [readGuard],
      schema: { tags: ['Team'], summary: 'List workspace team members and RBAC roles' },
    },
    async (request) => {
      const { workspaceId } = request.workspaceCtx!;

      const memberships = await prisma.membership.findMany({
        where: { workspaceId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatarUrl: true,
              createdAt: true,
            },
          },
        },
        orderBy: { role: 'desc' },
      });

      const rank: Record<string, number> = { OWNER: 1, ADMIN: 2, ANALYST: 3 };
      const members = memberships
        .map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          name: m.user.name,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl,
          joinedAt: m.user.createdAt,
        }))
        .sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9));

      return { members };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/team/members/:id/role',
    {
      preHandler: [ownerGuard],
      schema: { tags: ['Team'], summary: 'Update a member RBAC role (OWNER only)' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = updateRoleSchema.parse(request.body);

      const target = await prisma.membership.findFirst({
        where: { id: request.params.id, workspaceId },
        include: { user: { select: { email: true, name: true } } },
      });

      if (!target) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Team member not found.' });
      }

      // Prevent removing the last OWNER in a workspace
      if (target.role === 'OWNER' && body.role !== 'OWNER') {
        const ownerCount = await prisma.membership.count({
          where: { workspaceId, role: 'OWNER' },
        });
        if (ownerCount <= 1) {
          return reply.status(400).send({
            error: 'LAST_OWNER',
            message: 'Workspace must have at least one OWNER.',
          });
        }
      }

      const updated = await prisma.membership.update({
        where: { id: target.id },
        data: { role: body.role },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'TEAM_ROLE_UPDATED',
        targetType: 'Membership',
        targetId: target.id,
        detail: {
          memberName: target.user.name,
          memberEmail: target.user.email,
          previousRole: target.role,
          newRole: body.role,
        },
      });

      return reply.send({
        member: {
          id: updated.id,
          userId: updated.userId,
          role: updated.role,
          name: target.user.name,
          email: target.user.email,
        },
      });
    },
  );

  app.get<{ Querystring: AuditLogsQuery }>(
    '/api/audit-logs',
    {
      preHandler: [readGuard],
      schema: { tags: ['Team'], summary: 'Paginated workspace audit log trail' },
    },
    async (request) => {
      const { workspaceId } = request.workspaceCtx!;
      const q = request.query;
      const page = Math.max(1, Number(q.page) || 1);
      const pageSize = Math.min(100, Math.max(10, Number(q.pageSize) || 20));

      const where: Record<string, unknown> = { workspaceId };
      if (q.action && q.action !== 'ALL') where.action = q.action;
      if (q.targetType && q.targetType !== 'ALL') where.targetType = q.targetType;
      if (q.search && q.search.trim().length > 0) {
        const term = q.search.trim();
        where.OR = [
          { action: { contains: term } },
          { targetId: { contains: term } },
          { detailJson: { contains: term } },
          { user: { name: { contains: term } } },
          { user: { email: { contains: term } } },
        ];
      }

      const [total, rawLogs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      const items = rawLogs.map((l) => ({
        id: l.id,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        detail: (() => {
          try {
            return JSON.parse(l.detailJson) as Record<string, unknown>;
          } catch {
            return {};
          }
        })(),
        user: l.user,
        createdAt: l.createdAt,
      }));

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  // Invite or attach a team member to current workspace (OWNER only)
  app.post(
    '/api/team/invite',
    {
      preHandler: [ownerGuard],
      schema: { tags: ['Team'], summary: 'Invite a team member to this workspace (OWNER only)' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = inviteMemberSchema.parse(request.body);
      const email = body.email.toLowerCase().trim();

      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        const passwordHash = await bcrypt.hash('PulseInvite2026!', 10);
        user = await prisma.user.create({
          data: { email, name: body.name.trim(), passwordHash },
        });
      }

      const existingMembership = await prisma.membership.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId } },
      });

      if (existingMembership) {
        return reply.status(409).send({
          error: 'ALREADY_MEMBER',
          message: 'This user is already a member of the workspace.',
        });
      }

      const membership = await prisma.membership.create({
        data: { userId: user.id, workspaceId, role: body.role },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'TEAM_MEMBER_INVITED',
        targetType: 'Membership',
        targetId: membership.id,
        detail: { name: user.name, email: user.email, role: body.role },
      });

      return reply.status(201).send({
        member: {
          id: membership.id,
          userId: user.id,
          role: membership.role,
          name: user.name,
          email: user.email,
          joinedAt: user.createdAt,
        },
      });
    },
  );

  // Create a brand new isolated multi-tenant workspace
  app.post(
    '/api/workspaces',
    {
      preHandler: [authenticate],
      schema: { tags: ['Workspaces'], summary: 'Create a new isolated workspace for the current user' },
    },
    async (request, reply) => {
      const body = createWorkspaceSchema.parse(request.body);
      const slugBase =
        body.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'workspace';
      const slug = `${slugBase}-${Date.now().toString(36)}`;

      const ws = await prisma.workspace.create({
        data: {
          name: body.name.trim(),
          slug,
          currency: body.currency,
        },
      });

      await prisma.membership.create({
        data: {
          userId: request.authUser!.id,
          workspaceId: ws.id,
          role: 'OWNER',
        },
      });

      await recordAuditLog({
        workspaceId: ws.id,
        userId: request.authUser!.id,
        action: 'WORKSPACE_CREATED',
        targetType: 'Workspace',
        targetId: ws.id,
        detail: { name: ws.name, currency: ws.currency },
      });

      return reply.status(201).send({
        workspace: {
          id: ws.id,
          name: ws.name,
          slug: ws.slug,
          currency: ws.currency,
          role: 'OWNER',
        },
      });
    },
  );
}
