import { pgTable, uuid, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const peopleSyncSessionsTable = pgTable("people_sync_sessions", {
  id: uuid("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  encryptedToken: text("encrypted_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("people_sync_sessions_expires_idx").on(table.expiresAt)]);