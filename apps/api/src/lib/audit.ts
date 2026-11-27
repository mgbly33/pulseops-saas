import { prisma } from './prisma.js';

export interface AuditInput {
  workspaceId: string;
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: Record<string, unknown>;
}

export async function recordAuditLog(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      detailJson: JSON.stringify(input.detail ?? {}),
    },
  });
}
