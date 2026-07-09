import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action").notNull(),
  userId: integer("user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({
  id: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
