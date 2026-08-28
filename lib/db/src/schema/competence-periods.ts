import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const competencePeriodStatusEnum = pgEnum("competence_period_status", ["open", "closed"]);

/**
 * A period is selected by the work date, while deadlineAt is the last instant
 * a manager may submit it. deadlineAt is an instant (timestamptz); clients
 * present and administrators configure it in America/Sao_Paulo.
 */
export const competenceRegistrationPeriodsTable = pgTable("competence_registration_periods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  workStartDate: date("work_start_date", { mode: "string" }).notNull(),
  workEndDate: date("work_end_date", { mode: "string" }).notNull(),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
  observations: text("observations"),
  status: competencePeriodStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
});

export const competencePeriodReleasesTable = pgTable(
  "competence_period_releases",
  {
    id: serial("id").primaryKey(),
    periodId: integer("period_id").notNull().references(() => competenceRegistrationPeriodsTable.id, { onDelete: "cascade" }),
    managerId: integer("manager_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    active: boolean("active").notNull().default(true),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: integer("cancelled_by").references(() => usersTable.id, { onDelete: "set null" }),
  },
  (table) => [uniqueIndex("competence_release_unique_window").on(table.periodId, table.managerId, table.startsAt, table.expiresAt)],
);

export const insertCompetenceRegistrationPeriodSchema = createInsertSchema(
  competenceRegistrationPeriodsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompetenceRegistrationPeriod = z.infer<typeof insertCompetenceRegistrationPeriodSchema>;
export type CompetenceRegistrationPeriod = typeof competenceRegistrationPeriodsTable.$inferSelect;

export const insertCompetencePeriodReleaseSchema = createInsertSchema(competencePeriodReleasesTable).omit({
  id: true,
  createdAt: true,
  cancelledAt: true,
  cancelledBy: true,
});
export type InsertCompetencePeriodRelease = z.infer<typeof insertCompetencePeriodReleaseSchema>;
export type CompetencePeriodRelease = typeof competencePeriodReleasesTable.$inferSelect;