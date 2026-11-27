import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../lib/rbac.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2).max(60),
  workspaceName: z.string().min(2).max(80).optional(),
  currency: z.enum(['CNY', 'USD']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function getUserWorkspaces(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { workspace: { createdAt: 'asc' } },
  });

  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    currency: m.workspace.currency,
    role: m.role,
  }));
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/api/auth/register',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Register a new user account and workspace',
      },
    },
    async (request, reply) => {
      const parsed = registerSchema.parse(request.body);
      const email = parsed.email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.status(409).send({
          error: 'EMAIL_EXISTS',
          message: 'An account with this email already exists.',
        });
      }

      const passwordHash = await bcrypt.hash(parsed.password, 10);
      const slugBase = (parsed.workspaceName || parsed.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'workspace';
      const slug = `${slugBase}-${Date.now().toString(36)}`;

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: parsed.name.trim(),
        },
      });

      const workspace = await prisma.workspace.create({
        data: {
          name: parsed.workspaceName?.trim() || `${parsed.name.trim()} Workspace`,
          slug,
          currency: parsed.currency ?? 'CNY',
        },
      });

      await prisma.membership.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          role: 'OWNER',
        },
      });

      const token = app.jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        { expiresIn: '7d' },
      );

      const workspaces = await getUserWorkspaces(user.id);

      return reply.status(201).send({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
        workspaces,
      });
    },
  );

  app.post(
    '/api/auth/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign in with email and password',
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.parse(request.body);
      const email = parsed.email.toLowerCase().trim();

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return reply.status(401).send({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        });
      }

      const valid = await bcrypt.compare(parsed.password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        });
      }

      const token = app.jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        { expiresIn: '7d' },
      );

      const workspaces = await getUserWorkspaces(user.id);

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
        workspaces,
      });
    },
  );

  app.get(
    '/api/auth/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Get authenticated user profile and accessible workspaces',
      },
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.authUser!.id },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      if (!user) {
        return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'User not found.' });
      }

      const workspaces = await getUserWorkspaces(user.id);
      return reply.send({ user, workspaces });
    },
  );
}
