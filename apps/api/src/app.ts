import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { authRoutes } from './routes/auth.js';
import { analyticsRoutes } from './routes/analytics.js';
import { ordersRoutes } from './routes/orders.js';
import { customersRoutes } from './routes/customers.js';
import { webhooksRoutes } from './routes/webhooks.js';
import { alertsRoutes } from './routes/alerts.js';
import { teamRoutes } from './routes/team.js';
import { copilotRoutes } from './routes/copilot.js';
import { playbooksRoutes } from './routes/playbooks.js';
import { reportsRoutes } from './routes/reports.js';
import { developersRoutes } from './routes/developers.js';

export async function buildApp(options?: { logger?: boolean }) {
  const app = Fastify({
    logger: options?.logger ?? process.env.NODE_ENV !== 'test',
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
    exposedHeaders: ['Content-Disposition'],
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'pulseops-dev-jwt-secret-2026-secure',
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'PulseOps Commercial Growth & RevOps API',
        description:
          'Multi-tenant B2B SaaS analytics, revenue operations, CRM, intelligent alerting, and RBAC audit platform.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Healthcheck
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'pulseops-api',
    timestamp: new Date().toISOString(),
  }));

  // Global error handler for Zod & Fastify errors
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request payload.',
        details: error.flatten().fieldErrors,
      });
    }

    const errObj = error as { statusCode?: number; message?: string };
    const statusCode = typeof errObj?.statusCode === 'number' ? errObj.statusCode : 500;

    if (statusCode >= 500) {
      app.log.error(error);
    }

    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
      message: errObj?.message || 'Unexpected error occurred.',
    });
  });

  // Register domain routes
  await app.register(authRoutes);
  await app.register(analyticsRoutes);
  await app.register(ordersRoutes);
  await app.register(customersRoutes);
  await app.register(webhooksRoutes);
  await app.register(alertsRoutes);
  await app.register(teamRoutes);
  await app.register(copilotRoutes);
  await app.register(playbooksRoutes);
  await app.register(reportsRoutes);
  await app.register(developersRoutes);

  return app;
}
