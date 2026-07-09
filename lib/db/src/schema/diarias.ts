import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { providersTable } from "./providers";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

export const diariaStatusEnum = pgEnum("diaria_status", [
  "pendente_aprovacao",
  "em_analise",
  "aprovada",
  "rejeitada",
  "solicitacao_correcao",
  "disponivel_exportacao",
  "exportada",
  "paga",
  "cancelada",
]);

export const diariasTable = pgTable("diarias", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id")
    .notNull()
    .references(() => providersTable.id),
  teamId: integer("team_id")
    .notNull()
    .references(() => teamsTable.id),
  managerId: integer("manager_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  workDate: date("work_date").notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  paymentDate: date("payment_date"),
  observations: text("observations"),
  status: diariaStatusEnum("status").notNull().default("pendente_aprovacao"),
  actionNote: text("action_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => usersTable.id),
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  exportedAt: timestamp("exported_at"),
  exportedBy: integer("exported_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  integrationId: text("integration_id"),
  paidAt: timestamp("paid_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: integer("cancelled_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDiariaSchema = createInsertSchema(diariasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  approvedAt: true,
  approvedBy: true,
  exportedAt: true,
  exportedBy: true,
  integrationId: true,
  paidAt: true,
  cancelledAt: true,
  cancelledBy: true,
  actionNote: true,
});
export type InsertDiaria = z.infer<typeof insertDiariaSchema>;
export type Diaria = typeof diariasTable.$inferSelect;
