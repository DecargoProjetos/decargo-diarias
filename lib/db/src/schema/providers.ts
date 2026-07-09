import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";

export const providersTable = pgTable("providers", {
  id: serial("id").primaryKey(),
  decargoId: text("decargo_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  teamId: integer("team_id").references(() => teamsTable.id, {
    onDelete: "set null",
  }),
  active: boolean("active").notNull().default(true),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProviderSchema = createInsertSchema(providersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providersTable.$inferSelect;
