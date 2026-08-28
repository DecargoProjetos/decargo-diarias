import { Router } from "express";
import {
  db,
  pool,
  competencePeriodReleasesTable,
  competenceRegistrationPeriodsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { authorizeCompetenceRegistration } from "../lib/competenceAuthorization";
import { logAudit } from "../lib/audit";

const router = Router();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const competenceOverlapLock = 14142025;

interface TransactionClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
}

async function inCompetenceOverlapTransaction<T>(work: (client: TransactionClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // A transaction-scoped lock serializes overlap checks with their writes.
    // It needs no schema migration and is released automatically at COMMIT/ROLLBACK.
    await client.query("SELECT pg_advisory_xact_lock($1)", [competenceOverlapLock]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function periodInput(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const workStartDate = typeof body.workStartDate === "string" ? body.workStartDate : "";
  const workEndDate = typeof body.workEndDate === "string" ? body.workEndDate : "";
  const deadlineAt = typeof body.deadlineAt === "string" ? new Date(body.deadlineAt) : new Date("");
  if (!name || !datePattern.test(workStartDate) || !datePattern.test(workEndDate) || workStartDate > workEndDate ||
      Number.isNaN(deadlineAt.getTime())) return null;
  const observations = typeof body.observations === "string" ? body.observations.trim() || null : null;
  return { name, workStartDate, workEndDate, deadlineAt, observations };
}

function idParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/", requireRole("admin"), async (_req, res): Promise<void> => {
  const periods = await db.select().from(competenceRegistrationPeriodsTable)
    .orderBy(competenceRegistrationPeriodsTable.workStartDate);
  res.json(periods);
});

router.post("/", requireRole("admin"), async (req, res): Promise<void> => {
  const input = periodInput(req.body);
  if (!input) { res.status(400).json({ error: "Período inválido. Informe nome, intervalo de trabalho e prazo." }); return; }
  const result = await inCompetenceOverlapTransaction(async (client) => {
    const sameName = await client.query<{ id: number }>("SELECT id FROM competence_registration_periods WHERE name = $1 LIMIT 1", [input.name]);
    if (sameName.rows[0]) return { error: "Já existe um período com este nome." };
    const conflict = await client.query<{ id: number; name: string }>(
      "SELECT id, name FROM competence_registration_periods WHERE work_start_date <= $1 AND work_end_date >= $2 LIMIT 1",
      [input.workEndDate, input.workStartDate],
    );
    if (conflict.rows[0]) return { error: `O intervalo informado sobrepõe o período "${conflict.rows[0].name}".` };
    const inserted = await client.query<{ id: number }>("INSERT INTO competence_registration_periods (name, work_start_date, work_end_date, deadline_at, observations, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *", [input.name, input.workStartDate, input.workEndDate, input.deadlineAt, input.observations, req.currentUser!.id]);
    return { period: inserted.rows[0] };
  });
  if ("error" in result) { res.status(409).json({ error: result.error }); return; }
  const period = result.period;
  await logAudit({ entityType: "competence_period", entityId: period.id, action: "criado", userId: req.currentUser!.id, newValues: period });
  res.status(201).json(period);
});

router.patch("/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const input = periodInput(req.body);
  if (!id || !input) { res.status(400).json({ error: "Período inválido." }); return; }
  const result = await inCompetenceOverlapTransaction(async (client) => {
    const old = await client.query("SELECT * FROM competence_registration_periods WHERE id = $1 LIMIT 1", [id]);
    if (!old.rows[0]) return { notFound: true };
    const sameName = await client.query<{ id: number }>("SELECT id FROM competence_registration_periods WHERE id <> $1 AND name = $2 LIMIT 1", [id, input.name]);
    if (sameName.rows[0]) return { error: "Já existe um período com este nome." };
    const conflict = await client.query<{ name: string }>("SELECT name FROM competence_registration_periods WHERE id <> $1 AND work_start_date <= $2 AND work_end_date >= $3 LIMIT 1", [id, input.workEndDate, input.workStartDate]);
    if (conflict.rows[0]) return { error: `O intervalo informado sobrepõe o período "${conflict.rows[0].name}".` };
    const updated = await client.query("UPDATE competence_registration_periods SET name = $2, work_start_date = $3, work_end_date = $4, deadline_at = $5, observations = $6, updated_at = NOW() WHERE id = $1 RETURNING *", [id, input.name, input.workStartDate, input.workEndDate, input.deadlineAt, input.observations]);
    return { oldPeriod: old.rows[0], period: updated.rows[0] };
  });
  if ("notFound" in result) { res.status(404).json({ error: "Período não encontrado." }); return; }
  if ("error" in result) { res.status(409).json({ error: result.error }); return; }
  const { oldPeriod, period } = result;
  await logAudit({ entityType: "competence_period", entityId: id, action: "atualizado", userId: req.currentUser!.id, oldValues: oldPeriod, newValues: period });
  res.json(period);
});

router.delete("/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  if (!id) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const [period] = await db.delete(competenceRegistrationPeriodsTable).where(eq(competenceRegistrationPeriodsTable.id, id)).returning();
  if (!period) { res.status(404).json({ error: "Período não encontrado." }); return; }
  await logAudit({ entityType: "competence_period", entityId: id, action: "excluido", userId: req.currentUser!.id, oldValues: period });
  res.json({ message: "Período excluído." });
});

router.post("/:id/releases", requireRole("admin"), async (req, res): Promise<void> => {
  const periodId = idParam(req.params.id);
  const managerId = Number(req.body.managerId);
  const startsAt = typeof req.body.startsAt === "string" ? new Date(req.body.startsAt) : new Date("");
  const expiresAt = typeof req.body.expiresAt === "string" ? new Date(req.body.expiresAt) : new Date("");
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() || null : null;
  if (!periodId || !Number.isInteger(managerId) || managerId <= 0 || Number.isNaN(startsAt.getTime()) || Number.isNaN(expiresAt.getTime()) || startsAt >= expiresAt) {
    res.status(400).json({ error: "Liberação inválida." }); return;
  }
  const result = await inCompetenceOverlapTransaction(async (client) => {
    const period = await client.query<{ id: number }>("SELECT id FROM competence_registration_periods WHERE id = $1 LIMIT 1", [periodId]);
    if (!period.rows[0]) return { periodNotFound: true };
    const manager = await client.query<{ id: number }>("SELECT id FROM users WHERE id = $1 AND role = 'gestor' LIMIT 1", [managerId]);
    if (!manager.rows[0]) return { managerNotFound: true };
    const existing = await client.query<{ id: number }>(
      "SELECT id FROM competence_period_releases WHERE period_id = $1 AND manager_id = $2 AND active = true AND starts_at <= $3 AND expires_at >= $4 LIMIT 1",
      [periodId, managerId, expiresAt, startsAt],
    );
    if (existing.rows[0]) return { conflict: true };
    const inserted = await client.query<{ id: number }>(
      "INSERT INTO competence_period_releases (period_id, manager_id, starts_at, expires_at, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [periodId, managerId, startsAt, expiresAt, reason, req.currentUser!.id],
    );
    return { release: inserted.rows[0] };
  });
  if ("periodNotFound" in result) { res.status(404).json({ error: "Período não encontrado." }); return; }
  if ("managerNotFound" in result) { res.status(400).json({ error: "Gestor não encontrado." }); return; }
  if ("conflict" in result) { res.status(409).json({ error: "Já existe uma liberação ativa sobreposta para este gestor." }); return; }
  const release = result.release;
  await logAudit({ entityType: "competence_period_release", entityId: release.id, action: "criado", userId: req.currentUser!.id, newValues: release });
  res.status(201).json(release);
});

router.get("/:id/releases", requireRole("admin"), async (req, res): Promise<void> => {
  const periodId = idParam(req.params.id);
  if (!periodId) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const releases = await db.select({
    id: competencePeriodReleasesTable.id, periodId: competencePeriodReleasesTable.periodId,
    managerId: competencePeriodReleasesTable.managerId, managerName: usersTable.name,
    startsAt: competencePeriodReleasesTable.startsAt, expiresAt: competencePeriodReleasesTable.expiresAt,
    active: competencePeriodReleasesTable.active, reason: competencePeriodReleasesTable.reason,
    createdAt: competencePeriodReleasesTable.createdAt, createdBy: competencePeriodReleasesTable.createdBy,
    cancelledAt: competencePeriodReleasesTable.cancelledAt, cancelledBy: competencePeriodReleasesTable.cancelledBy,
  }).from(competencePeriodReleasesTable).innerJoin(usersTable, eq(usersTable.id, competencePeriodReleasesTable.managerId))
    .where(eq(competencePeriodReleasesTable.periodId, periodId)).orderBy(competencePeriodReleasesTable.startsAt);
  res.json(releases);
});

router.delete("/:id/releases/:releaseId", requireRole("admin"), async (req, res): Promise<void> => {
  const periodId = idParam(req.params.id);
  const releaseId = idParam(req.params.releaseId);
  if (!periodId || !releaseId) { res.status(400).json({ error: "Identificador inválido." }); return; }
  const [release] = await db.update(competencePeriodReleasesTable)
    .set({ active: false, cancelledAt: new Date(), cancelledBy: req.currentUser!.id })
    .where(and(eq(competencePeriodReleasesTable.id, releaseId), eq(competencePeriodReleasesTable.periodId, periodId), eq(competencePeriodReleasesTable.active, true)))
    .returning();
  if (!release) { res.status(404).json({ error: "Liberação ativa não encontrada." }); return; }
  await logAudit({ entityType: "competence_period_release", entityId: releaseId, action: "cancelado", userId: req.currentUser!.id, oldValues: { active: true }, newValues: release });
  res.json({ message: "Liberação cancelada." });
});

router.post("/:id/:status", requireRole("admin"), async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const action = Array.isArray(req.params.status) ? req.params.status[0] : req.params.status;
  if (!id || !["open", "close", "reopen"].includes(action ?? "")) { res.status(400).json({ error: "Ação ou identificador inválido." }); return; }
  const [oldPeriod] = await db.select().from(competenceRegistrationPeriodsTable).where(eq(competenceRegistrationPeriodsTable.id, id));
  if (!oldPeriod) { res.status(404).json({ error: "Período não encontrado." }); return; }
  const status = action === "close" ? "closed" : "open";
  const [period] = await db.update(competenceRegistrationPeriodsTable).set({ status, updatedAt: new Date() })
    .where(eq(competenceRegistrationPeriodsTable.id, id)).returning();
  await logAudit({ entityType: "competence_period", entityId: id, action: action === "close" ? "fechado" : "reaberto", userId: req.currentUser!.id, oldValues: oldPeriod, newValues: period });
  res.json(period);
});

router.get("/status/work-date/:workDate", requireAuth, async (req, res): Promise<void> => {
  const workDate = Array.isArray(req.params.workDate) ? req.params.workDate[0] : req.params.workDate;
  if (!workDate || !datePattern.test(workDate)) { res.status(400).json({ error: "Data de trabalho inválida." }); return; }
  const decision = await authorizeCompetenceRegistration({ role: req.currentUser!.role, managerId: req.currentUser!.id, workDate });
  res.json(decision);
});

export default router;