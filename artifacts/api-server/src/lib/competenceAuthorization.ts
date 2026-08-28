import {
  and,
  eq,
  gte,
  lte,
  gt,
} from "drizzle-orm";
import {
  db,
  competencePeriodReleasesTable,
  competenceRegistrationPeriodsTable,
} from "@workspace/db";

export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

export type RegistrationDecision =
  | { allowed: true; source: "admin" | "no_period" | "period" | "release"; periodId?: number; releaseId?: number; period?: CompetencePeriodMetadata }
  | { allowed: false; source: "closed" | "expired"; periodId: number; message: string; period?: CompetencePeriodMetadata };

export interface CompetencePeriodMetadata {
  id: number;
  name: string;
  workStartDate: string;
  workEndDate: string;
  deadlineAt: Date;
  status: "open" | "closed";
}

export function evaluateCompetenceRegistration(input: {
  role: string;
  period?: CompetencePeriodMetadata;
  release?: { id: number };
  now: Date;
}): RegistrationDecision {
  if (input.role === "admin") return { allowed: true, source: "admin" };
  if (!input.period) return { allowed: true, source: "no_period" };
  if (input.release) return { allowed: true, source: "release", periodId: input.period.id, releaseId: input.release.id, period: input.period };
  if (input.period.status === "closed") {
    return { allowed: false, source: "closed", periodId: input.period.id, period: input.period, message: "O período de competência está fechado para lançamentos." };
  }
  if (input.now > input.period.deadlineAt) {
    return { allowed: false, source: "expired", periodId: input.period.id, period: input.period, message: `O prazo de lançamento encerrou em ${saoPauloNow(input.period.deadlineAt)} (horário de São Paulo).` };
  }
  return { allowed: true, source: "period", periodId: input.period.id, period: input.period };
}

/** Format the operational clock without relying on the host machine timezone. */
export function saoPauloNow(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: SAO_PAULO_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "medium",
  }).format(now);
}

export function isReleaseCurrentlyValid(startsAt: Date, expiresAt: Date, now: Date): boolean {
  return startsAt <= now && now < expiresAt;
}

/**
 * Central registration gate. No configured period deliberately remains
 * permissive, making rollout safe. Administrators always bypass this gate.
 */
export async function authorizeCompetenceRegistration(input: {
  role: string;
  managerId: number;
  workDate: string;
  now?: Date;
}): Promise<RegistrationDecision> {
  const now = input.now ?? new Date();
  if (input.role === "admin") return evaluateCompetenceRegistration({ role: input.role, now });
  const [period] = await db
    .select()
    .from(competenceRegistrationPeriodsTable)
    .where(
      and(
        lte(competenceRegistrationPeriodsTable.workStartDate, input.workDate),
        gte(competenceRegistrationPeriodsTable.workEndDate, input.workDate),
      ),
    )
    .orderBy(competenceRegistrationPeriodsTable.id)
    .limit(1);

  if (!period) {
    return evaluateCompetenceRegistration({ role: input.role, now });
  }

  const [release] = await db
    .select()
    .from(competencePeriodReleasesTable)
    .where(
      and(
        eq(competencePeriodReleasesTable.periodId, period.id),
        eq(competencePeriodReleasesTable.managerId, input.managerId),
        eq(competencePeriodReleasesTable.active, true),
        lte(competencePeriodReleasesTable.startsAt, now),
        gt(competencePeriodReleasesTable.expiresAt, now),
      ),
    )
    .orderBy(competencePeriodReleasesTable.id)
    .limit(1);
  return evaluateCompetenceRegistration({
    role: input.role,
    period: {
      id: period.id,
      name: period.name,
      workStartDate: period.workStartDate,
      workEndDate: period.workEndDate,
      status: period.status,
      deadlineAt: period.deadlineAt,
    },
    release: release ? { id: release.id } : undefined,
    now,
  });
}