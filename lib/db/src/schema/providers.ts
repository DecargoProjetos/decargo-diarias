import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";

export const providersTable = pgTable("providers", {
  id: serial("id").primaryKey(),
  // External id_prestador only for People records. Local-only links use
  // manual-* (legacy) or local-user:<users.id>; never export those references.
  // Uniqueness also enforces at most one explicitly enabled link per local user.
  decargoId: text("decargo_id").notNull().unique(),
  // Reconciliation replaces decargoId with a verified People id_prestador,
  // retaining the original local namespace for stable ownership/history.
  localReference: text("local_reference").unique(),
  name: text("name").notNull(),
  email: text("email"),
  teamId: integer("team_id").references(() => teamsTable.id, {
    onDelete: "set null",
  }),
  // Valor padrão da diária deste prestador. Opcional: prestadores
  // sincronizados do DECARGO People não trazem esse valor, então fica nulo
  // até um admin preenchê-lo manualmente em Pessoas.
  cnpj: text("cnpj"),
  dailyRate: numeric("daily_rate", { precision: 10, scale: 2 }),
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
