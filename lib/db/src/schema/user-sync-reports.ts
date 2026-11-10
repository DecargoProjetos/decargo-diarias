import { pgTable, uuid, serial, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Only counters and conflict evidence, never raw People responses or credentials.
export const userSyncReportsTable = pgTable("user_sync_reports", {
  id: uuid("id").primaryKey(),
  runOrder: serial("run_order").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  result: jsonb("result").notNull(),
}, table => [
  index("user_sync_reports_completed_idx").on(table.completedAt),
  index("user_sync_reports_expires_idx").on(table.expiresAt),
]);

export const insertUserSyncReportSchema = createInsertSchema(userSyncReportsTable).omit({ runOrder: true });
export type InsertUserSyncReport = z.infer<typeof insertUserSyncReportSchema>;
export type UserSyncReportRow = typeof userSyncReportsTable.$inferSelect;
