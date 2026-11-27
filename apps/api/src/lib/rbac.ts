import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from './prisma.js';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'ANALYST';

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceContext {
  workspaceId: string;
  role: WorkspaceRole;
  currency: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUserPayload;
    workspaceCtx?: WorkspaceContext;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    let token: string | undefined;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (
      request.query &&
      typeof request.query === 'object' &&
      'token' in request.query &&
      typeof (request.query as Record<string, unknown>).token === 'string'
    ) {
      token = (request.query as Record<string, string>).token;
    }

    if (!token) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authentication token is required.',
      });
    }

    const decoded = await request.server.jwt.verify<AuthUserPayload>(token);
    request.authUser = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
    };
  } catch {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired authentication token.',
    });
  }
}

export function requireWorkspaceRole(allowedRoles: WorkspaceRole[]) {
  return async function workspaceRoleGuard(request: FastifyRequest, reply: FastifyReply) {
    await authenticate(request, reply);
    if (reply.sent) return;

    const rawHeader = request.headers['x-workspace-id'];
    const workspaceId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!workspaceId) {
      return reply.status(400).send({
        error: 'MISSING_WORKSPACE',
        message: 'X-Workspace-Id header is required.',
      });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId: request.authUser!.id,
          workspaceId,
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!membership) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You do not have access to this workspace.',
      });
    }

    const role = membership.role as WorkspaceRole;
    if (!allowedRoles.includes(role)) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: `Insufficient permissions. Required role: ${allowedRoles.join(' or ')}. Your role: ${role}.`,
      });
    }

    request.workspaceCtx = {
      workspaceId: membership.workspaceId,
      role,
      currency: membership.workspace.currency,
      name: membership.workspace.name,
    };
  };
}
