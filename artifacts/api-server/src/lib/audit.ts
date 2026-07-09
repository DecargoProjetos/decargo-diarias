import { db, auditLogsTable } from "@workspace/db";

interface AuditParams {
  entityType: string;
  entityId: number;
  action: string;
  userId?: number;
  oldValues?: unknown;
  newValues?: unknown;
}

export async function logAudit(params: AuditParams): Promise<void> {
  await db.insert(auditLogsTable).values({
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    userId: params.userId ?? null,
    timestamp: new Date(),
    oldValues: params.oldValues ?? null,
    newValues: params.newValues ?? null,
  });
}
