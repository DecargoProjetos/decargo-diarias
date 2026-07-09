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

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  decargoId: text("decargo_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  // role: "admin" | "gestor" | "prestador"
  role: text("role").notNull().default("prestador"),
  teamId: integer("team_id").references(() => teamsTable.id, {
    onDelete: "set null",
  }),
  avatarUrl: text("avatar_url"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
