import { db, auditLogsTable, type User } from "@workspace/db";

export type AuditActor = Pick<User, "id" | "name">;

interface AuditParams {
  entityType: string;
  entityId: number;
  action: string;
  actor: AuditActor | null;
  oldValues?: unknown;
  newValues?: unknown;
}

export async function logAudit(params: AuditParams): Promise<void> {
  await db.insert(auditLogsTable).values({
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    userId: params.actor?.id ?? null,
    userNameAtAction: params.actor?.name ?? null,
    timestamp: new Date(),
    oldValues: params.oldValues ?? null,
    newValues: params.newValues ?? null,
  });
}
