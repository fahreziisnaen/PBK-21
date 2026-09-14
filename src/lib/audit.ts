import { prisma } from '@/lib/prisma';

/** Spec §7 — setiap pembatalan, penonaktifan, dan pengarsipan dicatat. */
export async function writeAudit(input: {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      meta: (input.meta ?? undefined) as never,
    },
  });
}
