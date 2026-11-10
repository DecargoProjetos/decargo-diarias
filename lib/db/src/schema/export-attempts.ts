import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// Snapshot contains local IDs and outcomes only, never People credentials.
export const exportAttemptsTable = pgTable("export_attempts", {
  integrationRef: text("integration_ref").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  snapshot: jsonb("snapshot").notNull(),
});
