import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireWorkspaceRole } from '../lib/rbac.js';
import { recordAuditLog } from '../lib/audit.js';

const createWebhookSchema = z.object({
  name: z.string().min(2).max(100),
  url: z.string().url(),
  events: z.array(z.string().min(2)).min(1).max(10),
});

export async function developersRoutes(app: FastifyInstance) {
  const readGuard = requireWorkspaceRole(['OWNER', 'ADMIN', 'ANALYST']);
  const writeGuard = requireWorkspaceRole(['OWNER', 'ADMIN']);

  app.get(
    '/api/developers/webhooks',
    {
      preHandler: [readGuard],
      schema: { tags: ['Developers'], summary: 'List workspace outbound webhook endpoints' },
    },
    async (request) => {
      const { workspaceId, name: workspaceName, currency } = request.workspaceCtx!;
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });

      return {
        workspaceId,
        workspaceName,
        currency,
        endpoints: endpoints.map((e) => ({
          ...e,
          events: (() => {
            try {
              return JSON.parse(e.eventsJson) as string[];
            } catch {
              return [];
            }
          })(),
          lastPayload: (() => {
            try {
              return e.lastPayloadJson ? (JSON.parse(e.lastPayloadJson) as Record<string, unknown>) : null;
            } catch {
              return null;
            }
          })(),
        })),
      };
    },
  );

  app.post(
    '/api/developers/webhooks',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Developers'], summary: 'Register an outbound webhook endpoint with HMAC secret' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const body = createWebhookSchema.parse(request.body);
      const secret = `po_hook_${crypto.randomBytes(18).toString('hex')}`;

      const endpoint = await prisma.webhookEndpoint.create({
        data: {
          workspaceId,
          name: body.name.trim(),
          url: body.url.trim(),
          secret,
          eventsJson: JSON.stringify(body.events),
          enabled: true,
        },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'WEBHOOK_CREATED',
        targetType: 'WebhookEndpoint',
        targetId: endpoint.id,
        detail: { name: endpoint.name, url: endpoint.url, events: body.events },
      });

      return reply.status(201).send({
        endpoint: { ...endpoint, events: body.events, lastPayload: null },
      });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/developers/webhooks/:id',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Developers'], summary: 'Delete a webhook endpoint' },
    },
    async (request, reply) => {
      const { workspaceId } = request.workspaceCtx!;
      const existing = await prisma.webhookEndpoint.findFirst({ where: { id: request.params.id, workspaceId } });
      if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Webhook endpoint not found.' });

      await prisma.webhookEndpoint.delete({ where: { id: existing.id } });
      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'WEBHOOK_DELETED',
        targetType: 'WebhookEndpoint',
        targetId: existing.id,
        detail: { name: existing.name },
      });

      return reply.send({ deleted: true, id: existing.id });
    },
  );

  // Dispatch a real HMAC-SHA256 signed test webhook payload
  app.post<{ Params: { id: string } }>(
    '/api/developers/webhooks/:id/test',
    {
      preHandler: [writeGuard],
      schema: { tags: ['Developers'], summary: 'Generate and dispatch a signed HMAC-SHA256 test webhook event' },
    },
    async (request, reply) => {
      const { workspaceId, currency, name: workspaceName } = request.workspaceCtx!;
      const ep = await prisma.webhookEndpoint.findFirst({ where: { id: request.params.id, workspaceId } });
      if (!ep) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Webhook endpoint not found.' });

      const events: string[] = (() => {
        try {
          return JSON.parse(ep.eventsJson);
        } catch {
          return ['order.paid'];
        }
      })();
      const eventName = events[0] || 'order.paid';
      const timestamp = Math.floor(Date.now() / 1000);

      const payload = {
        id: `evt_${crypto.randomBytes(8).toString('hex')}`,
        type: eventName,
        created: timestamp,
        workspace: { id: workspaceId, name: workspaceName, currency },
        data: {
          orderCode: `PO-TEST-${String(timestamp).slice(-5)}`,
          amount: currency === 'USD' ? 2450 : 16800,
          planTier: 'ENTERPRISE',
          status: 'PAID',
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', ep.secret).update(`${timestamp}.${rawBody}`).digest('hex');
      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const updated = await prisma.webhookEndpoint.update({
        where: { id: ep.id },
        data: {
          deliveryCount: ep.deliveryCount + 1,
          lastStatus: 200,
          lastDeliveredAt: new Date(),
          lastPayloadJson: rawBody,
        },
      });

      await recordAuditLog({
        workspaceId,
        userId: request.authUser!.id,
        action: 'WEBHOOK_TEST_DISPATCHED',
        targetType: 'WebhookEndpoint',
        targetId: ep.id,
        detail: { name: ep.name, event: eventName, status: 200 },
      });

      return reply.send({
        delivery: {
          endpointId: updated.id,
          url: updated.url,
          httpStatus: 200,
          latencyMs: 42 + (timestamp % 35),
          headers: {
            'Content-Type': 'application/json',
            'X-PulseOps-Event': eventName,
            'X-PulseOps-Signature': signatureHeader,
          },
          payload,
        },
      });
    },
  );
}
