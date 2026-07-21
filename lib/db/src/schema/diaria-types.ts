import {
  pgTable,
  pgEnum,
  serial,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * exportTarget determina para qual endpoint do DECARGO People esta categoria
 * será roteada na exportação:
 *   diaria_extra → /api/integration/diarias   (Folha Mensal > Diárias Extras)
 *   falta        → /api/integration/descontos  (Folha Mensal > Descontos)
 */
export const diariaTypeExportTargetEnum = pgEnum("diaria_type_export_target", [
  "diaria_extra",
  "falta",
  "none",
]);

export const diariaTypesTable = pgTable("diaria_types", {
  id: serial("id").primaryKey(),
  description: text("description").notNull().unique(),
  exportTarget: diariaTypeExportTargetEnum("export_target")
    .notNull()
    .default("diaria_extra"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDiariaTypeSchema = createInsertSchema(
  diariaTypesTable
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDiariaType = z.infer<typeof insertDiariaTypeSchema>;
export type DiariaType = typeof diariaTypesTable.$inferSelect;
