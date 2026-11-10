import { Router } from "express";
import {
  db,
  pool,
  auditLogsTable,
  diariasTable,
  diariaTypesTable,
  providersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";
import { checkPeopleExportAvailability, pushDiariasToPeople, pushFaltasToPeople } from "../lib/peopleClient";
import { getGestorTeamIds } from "../lib/gestorTeams";
import { buildDiariaFilters, type AnaliseFilterQuery } from "../lib/diariaFilters";
import { authorizeCompetenceRegistration } from "../lib/competenceAuthorization";
import { canSeeDiariaValue } from "../lib/diariaPermissions";
import { linkedProviderSql, hasLocalProviderReference, providerAccessActiveSql } from "../lib/providerIdentity";
import exportRecoveryRouter from "./exportRecovery";
import exportAttemptsRouter from "./exportAttempts";
import { newExportAttempt, createExportAttempt, trackExportAttempt } from "../lib/exportAttempts";

const router = Router();

// Gestor não deve ver valores de diárias em nenhuma tela ou chamada de API.
// Statuses considered "locked" — financial fields and status may not change
// once a diária reaches one of these (Bloqueio Pós-Exportação).
const LOCKED_STATUSES = ["exportada", "paga"];

async function getDiariaById(id: number, userId: number, role: string, gestorTeamIds: number[], _decargoId: string) {
  const selfScoped = role !== "admin" && role !== "gestor";
  const result = await pool.query<Record<string, unknown>>(
    `SELECT
        d.id, d.provider_id AS "providerId", p.name AS "providerName",
        d.team_id AS "teamId", t.name AS "teamName",
        d.manager_id AS "managerId", mu.name AS "managerName",
        d.work_date::text AS "workDate",
        d.start_time AS "startTime", d.end_time AS "endTime",
        d.value, d.payment_date::text AS "paymentDate",
        d.observations, d.status, d.action_note AS "actionNote",
        d.created_at AS "createdAt", cu.name AS "createdByName",
        d.approved_at AS "approvedAt", au.name AS "approvedByName",
        d.exported_at AS "exportedAt", eu.name AS "exportedByName",
        d.integration_id AS "integrationId",
        d.paid_at AS "paidAt", d.cancelled_at AS "cancelledAt",
        p.decargo_id AS "providerDecargoId",
        d.type_id AS "typeId", dt.description AS "typeName", dt.export_target AS "exportTarget"
      FROM diarias d
      JOIN providers p ON p.id = d.provider_id
      JOIN teams t ON t.id = d.team_id
      JOIN users cu ON cu.id = d.created_by
      LEFT JOIN users mu ON mu.id = d.manager_id
      LEFT JOIN users au ON au.id = d.approved_by
      LEFT JOIN users eu ON eu.id = d.exported_by
      LEFT JOIN diaria_types dt ON dt.id = d.type_id
      WHERE d.id = $1${selfScoped ? ` AND p.id = ${linkedProviderSql("$2")}` : ""}`,
    selfScoped ? [id, userId] : [id]
  );

  const row = result.rows[0];
  if (!row) return null;

  if (role === "gestor" && !gestorTeamIds.includes(Number(row.teamId))) {
    return null;
  }

  const { providerDecargoId: _omit, ...rest } = row;
  return { ...rest, value: canSeeDiariaValue(role) ? rest.value : null };
}

// GET /api/diarias
router.get("/", requireAuth, async (req, res) => {
  // The `value` field is role-dependent (null for gestor) — never let the
  // browser/CDN cache this response, or a gestor could keep seeing a
  // previously admin-fetched response with the real value.
  res.set("Cache-Control", "no-store");
  const me = req.currentUser!;
  const query = req.query as AnaliseFilterQuery;
  const { page = "1", pageSize = "20", sortBy } = req.query as Record<string, string>;

  const pageNum = Math.max(1, Number(page));
  const pageSz = Math.min(100, Math.max(1, Number(pageSize)));
  const offset = (pageNum - 1) * pageSz;

  // Scope for gestor is derived from teams.manager_id, not users.team_id.
  const gestorTeamIds = me.role === "gestor" ? await getGestorTeamIds(me.id) : [];
  const { where, params } = buildDiariaFilters(me, query, { gestorTeamIds });
  const orderBy = sortBy === "providerName"
    ? "lower(p.name) ASC, d.work_date ASC, d.created_at DESC, d.id DESC"
    : "d.created_at DESC";

  const [countResult, rows] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM diarias d JOIN providers p ON p.id = d.provider_id WHERE ${where}`,
      params
    ),
    pool.query<Record<string, unknown>>(
      `SELECT
          d.id, d.provider_id AS "providerId", p.name AS "providerName",
          d.team_id AS "teamId", t.name AS "teamName",
          d.manager_id AS "managerId", mu.name AS "managerName",
          d.work_date::text AS "workDate",
          d.start_time AS "startTime", d.end_time AS "endTime",
          d.value, d.payment_date::text AS "paymentDate",
          d.observations, d.status, d.action_note AS "actionNote",
          d.created_at AS "createdAt", cu.name AS "createdByName",
          d.approved_at AS "approvedAt", au.name AS "approvedByName",
          d.exported_at AS "exportedAt", eu.name AS "exportedByName",
          d.integration_id AS "integrationId",
          d.paid_at AS "paidAt", d.cancelled_at AS "cancelledAt",
          d.type_id AS "typeId", dt.description AS "typeName"
        FROM diarias d
        JOIN providers p ON p.id = d.provider_id
        JOIN teams t ON t.id = d.team_id
        JOIN users cu ON cu.id = d.created_by
        LEFT JOIN users mu ON mu.id = d.manager_id
        LEFT JOIN users au ON au.id = d.approved_by
        LEFT JOIN users eu ON eu.id = d.exported_by
        LEFT JOIN diaria_types dt ON dt.id = d.type_id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${pageSz} OFFSET ${offset}`,
      params
    ),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);
  const data = rows.rows.map((row) => ({
    ...row,
    value: canSeeDiariaValue(me.role) ? row.value : null,
  }));

  res.json({
    data,
    total,
    page: pageNum,
    pageSize: pageSz,
    totalPages: Math.ceil(total / pageSz),
  });
});

// GET /api/diarias/summary — dashboard indicators for Análise de Diárias
router.get("/summary", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const query = req.query as AnaliseFilterQuery;
  const { where, params } = buildDiariaFilters(me, query, { includeStatus: false });

  const result = await pool.query<{ status: string; cnt: string; total: string }>(
    `SELECT d.status, COUNT(*) AS cnt, COALESCE(SUM(d.value::numeric), 0) AS total
     FROM diarias d
     JOIN providers p ON p.id = d.provider_id
     WHERE ${where}
     GROUP BY d.status`,
    params,
  );

  const byStatus = new Map(result.rows.map((r) => [r.status, r]));
  const pick = (statuses: string[]) =>
    statuses.reduce(
      (acc, s) => {
        const row = byStatus.get(s);
        acc.count += row ? Number(row.cnt) : 0;
        acc.value += row ? Number(row.total) : 0;
        return acc;
      },
      { count: 0, value: 0 },
    );

  const pendentes = pick(["pendente_aprovacao", "em_analise"]);
  const aprovadas = pick(["aprovada", "disponivel_exportacao"]);
  const reprovadas = pick(["rejeitada"]);
  const exportadas = pick(["exportada", "paga"]);

  res.json({
    pendentesCount: pendentes.count,
    pendentesValue: pendentes.value,
    aprovadasCount: aprovadas.count,
    aprovadasValue: aprovadas.value,
    reprovadasCount: reprovadas.count,
    reprovadasValue: reprovadas.value,
    exportadasCount: exportadas.count,
    exportadasValue: exportadas.value,
  });
});

// GET /api/diarias/ids — full list of IDs matching filters (select all filtered)
router.get("/ids", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const query = req.query as AnaliseFilterQuery;
  const { where, params } = buildDiariaFilters(me, query);

  const result = await pool.query<{ id: number }>(
    `SELECT d.id FROM diarias d JOIN providers p ON p.id = d.provider_id WHERE ${where} ORDER BY d.id LIMIT 5000`,
    params,
  );

  res.json({ ids: result.rows.map((r) => r.id), total: result.rows.length });
});

// POST /api/diarias/bulk-approve (admin)
router.post("/bulk-approve", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const { diariaIds } = req.body as { diariaIds: number[] };

  if (!diariaIds?.length) {
    res.status(400).json({ error: "Nenhuma diária selecionada" });
    return;
  }

  const rows = await db
    .select({ id: diariasTable.id, status: diariasTable.status })
    .from(diariasTable)
    .where(inArray(diariasTable.id, diariaIds));

  const approvable = ["pendente_aprovacao", "em_analise"];
  const foundIds = new Set(rows.map((r) => r.id));
  const succeeded: number[] = [];
  const failed: { id: number; reason: string }[] = [];

  for (const id of diariaIds) {
    if (!foundIds.has(id)) {
      failed.push({ id, reason: "Diária não encontrada" });
      continue;
    }
  }
  const toApprove = rows.filter((r) => approvable.includes(r.status));
  for (const r of rows) {
    if (!approvable.includes(r.status)) {
      failed.push({ id: r.id, reason: "Diária não pode ser aprovada no status atual" });
    }
  }

  if (toApprove.length > 0) {
    const now = new Date();
    await db
      .update(diariasTable)
      .set({ status: "disponivel_exportacao", approvedAt: now, approvedBy: me.id, updatedAt: now })
      .where(inArray(diariasTable.id, toApprove.map((r) => r.id)));

    for (const r of toApprove) {
      succeeded.push(r.id);
      await logAudit({
        entityType: "diaria",
        entityId: r.id,
        action: "aprovado_em_lote",
        actor: me,
        oldValues: { status: r.status },
        newValues: { status: "disponivel_exportacao" },
      });
    }
  }

  res.json({ succeeded, failed });
});

// POST /api/diarias/bulk-reject (admin) — rejection reason is required
router.post("/bulk-reject", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const { diariaIds, note } = req.body as { diariaIds: number[]; note?: string };

  if (!diariaIds?.length) {
    res.status(400).json({ error: "Nenhuma diária selecionada" });
    return;
  }
  if (!note || !note.trim()) {
    res.status(400).json({ error: "Motivo da reprovação é obrigatório" });
    return;
  }

  const rows = await db
    .select({
      id: diariasTable.id,
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
    })
    .from(diariasTable)
    .where(inArray(diariasTable.id, diariaIds));

  const rejectable = ["pendente_aprovacao", "em_analise", "disponivel_exportacao"];
  const canReject = (row: typeof rows[number]) =>
    rejectable.includes(row.status) &&
    (row.status !== "disponivel_exportacao" || row.integrationId === null);
  const foundIds = new Set(rows.map((r) => r.id));
  const succeeded: number[] = [];
  const failed: { id: number; reason: string }[] = [];

  for (const id of diariaIds) {
    if (!foundIds.has(id)) failed.push({ id, reason: "Diária não encontrada" });
  }
  const toReject = rows.filter(canReject);
  for (const r of rows) {
    if (!canReject(r)) {
      failed.push({
        id: r.id,
        reason: r.status === "disponivel_exportacao" && r.integrationId
          ? "Diária está em processo de exportação"
          : "Diária não pode ser reprovada no status atual",
      });
    }
  }

  if (toReject.length > 0) {
    const now = new Date();
    await db
      .update(diariasTable)
      .set({
        status: "rejeitada",
        actionNote: note,
        approvedAt: null,
        approvedBy: null,
        updatedAt: now,
      })
      .where(inArray(diariasTable.id, toReject.map((r) => r.id)));

    for (const r of toReject) {
      succeeded.push(r.id);
      await logAudit({
        entityType: "diaria",
        entityId: r.id,
        action: "rejeitado_em_lote",
        actor: me,
        oldValues: { status: r.status },
        newValues: { status: "rejeitada", note },
      });
    }
  }

  res.json({ succeeded, failed });
});

// POST /api/diarias/bulk-set-payment-date (admin)
// Applies a payment date to a list of diárias, skipping locked records.
router.post("/bulk-set-payment-date", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const { diariaIds, paymentDate } = req.body as { diariaIds: number[]; paymentDate: string };

  if (!diariaIds?.length) {
    res.status(400).json({ error: "Nenhuma diária selecionada" });
    return;
  }
  if (!paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    res.status(400).json({ error: "Data de pagamento inválida (use yyyy-MM-dd)" });
    return;
  }

  const rows = await db
    .select({ id: diariasTable.id, status: diariasTable.status, paymentDate: diariasTable.paymentDate })
    .from(diariasTable)
    .where(inArray(diariasTable.id, diariaIds));

  const foundIds = new Set(rows.map((r) => r.id));
  const succeeded: number[] = [];
  const failed: { id: number; reason: string }[] = [];

  for (const id of diariaIds) {
    if (!foundIds.has(id)) failed.push({ id, reason: "Diária não encontrada" });
  }

  const toUpdate = rows.filter((r) => !LOCKED_STATUSES.includes(r.status) && r.status !== "cancelada");
  for (const r of rows) {
    if (LOCKED_STATUSES.includes(r.status) || r.status === "cancelada") {
      failed.push({ id: r.id, reason: "Diária bloqueada após exportação/cancelamento" });
    }
  }

  if (toUpdate.length > 0) {
    const now = new Date();
    await db
      .update(diariasTable)
      .set({ paymentDate, updatedAt: now })
      .where(inArray(diariasTable.id, toUpdate.map((r) => r.id)));

    for (const r of toUpdate) {
      succeeded.push(r.id);
      await logAudit({
        entityType: "diaria",
        entityId: r.id,
        action: "data_pagamento_atualizada_em_lote",
        actor: me,
        oldValues: { paymentDate: r.paymentDate },
        newValues: { paymentDate },
      });
    }
  }

  res.json({ succeeded, failed });
});

// PATCH /api/diarias/:id/payment-date (admin, blocked after export)
router.patch("/:id/payment-date", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);
  const { paymentDate } = req.body as { paymentDate?: string };

  if (!paymentDate) {
    res.status(400).json({ error: "Data de pagamento é obrigatória" });
    return;
  }

  const [diaria] = await db.select().from(diariasTable).where(eq(diariasTable.id, id)).limit(1);
  if (!diaria) { res.status(404).json({ error: "Diária não encontrada" }); return; }

  if (LOCKED_STATUSES.includes(diaria.status)) {
    await logAudit({
      entityType: "diaria",
      entityId: id,
      action: "alteracao_bloqueada_pos_exportacao",
      actor: me,
      oldValues: { status: diaria.status, paymentDate: diaria.paymentDate },
      newValues: { attemptedPaymentDate: paymentDate },
    });
    res.status(400).json({ error: "Diária já exportada/paga — campos financeiros não podem mais ser alterados" });
    return;
  }

  const now = new Date();
  await db.update(diariasTable).set({ paymentDate, updatedAt: now }).where(eq(diariasTable.id, id));

  await logAudit({
    entityType: "diaria",
    entityId: id,
    action: "data_pagamento_atualizada",
    actor: me,
    oldValues: { paymentDate: diaria.paymentDate },
    newValues: { paymentDate },
  });

  const result = await getDiariaById(id, me.id, me.role, [], me.decargoId);
  res.json(result);
});

// POST /api/diarias (gestor/admin)
router.post("/", requireRole("admin", "gestor"), async (req, res) => {
  const me = req.currentUser!;
  const { providerId, teamId, typeId, workDate, startTime, endTime, value, paymentDate, observations } =
    req.body as {
      providerId: number;
      teamId: number;
      typeId?: number;
      workDate: string;
      startTime?: string | null;
      endTime?: string | null;
      value: number;
      paymentDate?: string;
      observations?: string;
    };

  // Resolve manager scope/deadline outside the transaction: these helpers use
  // the pool, and nested pool requests while holding a connection can starve
  // concurrent creations. Provider eligibility/team/rate are locked below.
  const gestorTeamIds = me.role === "gestor" ? await getGestorTeamIds(me.id) : [];
  const authorization = me.role === "gestor"
    ? await authorizeCompetenceRegistration({ role: me.role, managerId: me.id, workDate })
    : undefined;
  const outcome = await db.transaction(async tx => {
    // Shared with edits and imports: ambiguous deactivation may only change
    // the access account, so locking a provider alone is not sufficient.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(724091513)`);
    // FK checks for created_by/manager_id need a user lock at insertion.
    // Acquire it before the provider, matching administrative edit lock order,
    // especially when an administrator launches their own diária.
    const [actor] = await tx.select({ active: usersTable.active }).from(usersTable)
      .where(eq(usersTable.id, me.id)).for("key share");
    if (!actor?.active) return { status: 401, error: "Usuário inativo" };
    if (!typeId) return { status: 400, error: "Tipo de diária é obrigatório" };
    const [diariaType] = await tx.select().from(diariaTypesTable).where(eq(diariaTypesTable.id, typeId)).limit(1);
    if (!diariaType || !diariaType.active) return { status: 400, error: "Tipo de diária inválido ou inativo" };

  // Resolve the provider relationship server-side. The submitted teamId is
  // only a consistency check; it must never be used to move a provider into a
  // manager's scope.
  const [provider] = await tx
    .select({
      id: providersTable.id,
      teamId: providersTable.teamId,
      active: providersTable.active,
      dailyRate: providersTable.dailyRate,
    })
    .from(providersTable)
    .where(eq(providersTable.id, providerId))
    .limit(1)
    .for("share");
  if (!provider || !provider.active) {
    return { status: 400, error: "Prestador inválido ou inativo" };
  }
  const eligibility = await tx.execute(sql`SELECT ${sql.raw(providerAccessActiveSql(String(provider.id)))} AS allowed`);
  if (eligibility.rows[0]?.allowed !== true) return { status: 400, error: "Pessoa com acesso inativo" };
  if (!provider.teamId) {
    return { status: 400, error: "Prestador sem equipe vinculada" };
  }
  if (provider.teamId !== teamId) {
    return { status: 400, error: "A equipe informada não corresponde à equipe atual do prestador" };
  }

  const authoritativeTeamId = provider.teamId;

  // Gestor can only create for their managed teams (derived from teams.manager_id).
  if (me.role === "gestor" && !gestorTeamIds.includes(authoritativeTeamId)) {
    return { status: 403, error: "Você só pode lançar diárias das suas equipes" };
  }

  if (authorization) {
    if (!authorization.allowed) {
      return { status: 403, error: authorization.message ?? "Competência fechada" };
    }
  }

  // Gestor never sees a diária's value, so the client cannot be trusted (or
  // even able) to supply it. The server looks up the provider's current
  // dailyRate itself and uses that, ignoring whatever the client sent.
  let effectiveValue = value;
  if (me.role === "gestor") {
    if (provider.dailyRate == null) {
      return { status: 400, error: "Configure o valor da diária deste prestador em Pessoas antes de lançar." };
    }
    effectiveValue = Number(provider.dailyRate);
  }

  const [diaria] = await tx
    .insert(diariasTable)
    .values({
      providerId,
      teamId: authoritativeTeamId,
      typeId,
      managerId: me.id,
      workDate,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      value: String(effectiveValue),
      paymentDate: paymentDate ?? null,
      observations: observations ?? null,
      status: "pendente_aprovacao",
      createdBy: me.id,
    })
    .returning();

  await tx.insert(auditLogsTable).values({
    entityType: "diaria",
    entityId: diaria.id,
    action: "criado",
    userId: me.id,
    userNameAtAction: me.name,
    newValues: { status: "pendente_aprovacao", value: effectiveValue, providerId, teamId: authoritativeTeamId, workDate },
  });

  return { diariaId: diaria.id, gestorTeamIds };
  });
  if ("error" in outcome) {
    res.status(outcome.status!).json({ error: outcome.error });
    return;
  }
  const result = await getDiariaById(outcome.diariaId, me.id, me.role, outcome.gestorTeamIds, me.decargoId);
  res.status(201).json(result);
});

// Calcula a data de desconto para faltas:
// dia ≤ 15 → dia 15 do mês seguinte; dia > 15 → último dia do mês seguinte.
function calcDiscountDate(workDate: string): string {
  const [y, m, d] = workDate.split("-").map(Number);
  let nextMonth = m + 1;
  let nextYear = y;
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }
  const targetDay = d <= 15 ? 15 : new Date(nextYear, nextMonth, 0).getDate();
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

// POST /api/diarias/export (must come before /:id)
router.use("/export", exportRecoveryRouter);
router.use("/export/attempts", exportAttemptsRouter);
router.post("/export", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const { diariaIds, paymentDate: fallbackPaymentDate } = req.body as { diariaIds: number[]; paymentDate?: string };

  if (!diariaIds?.length) {
    res.status(400).json({ error: "Nenhuma diária selecionada" });
    return;
  }

  const rows = await pool.query<{
    id: number; status: string; providerDecargoId: string; providerName: string; cnpj: string | null;
    workDate: string; value: string; paymentDate: string | null; observations: string | null;
    exportTarget: string | null;
  }>(
    `SELECT d.id, d.status, p.decargo_id AS "providerDecargoId", p.name AS "providerName",
            p.cnpj, d.work_date::text AS "workDate", d.value, d.payment_date::text AS "paymentDate",
            d.observations, dt.export_target AS "exportTarget"
     FROM diarias d
     JOIN providers p ON p.id = d.provider_id
     LEFT JOIN diaria_types dt ON dt.id = d.type_id
     WHERE d.id = ANY($1::int[])`,
    [diariaIds],
  );

  const byId = new Map(rows.rows.map((r) => [r.id, r]));

  // Validate every requested record before touching anything. Invalid records
  // remain unchanged while valid records continue through the export.
  const validationErrors: { id: number; reason: string }[] = [];
  for (const id of diariaIds) {
    const row = byId.get(id);
    if (!row) { validationErrors.push({ id, reason: "Diária não encontrada" }); continue; }
    if (row.status !== "disponivel_exportacao") {
      validationErrors.push({ id, reason: "Diária não está aprovada/disponível para exportação" }); continue;
    }
    if (!row.exportTarget || !["diaria_extra", "falta"].includes(row.exportTarget)) {
      validationErrors.push({ id, reason: "Tipo de diária não definido — configure o tipo antes de exportar" }); continue;
    }
    // Preserve the local enablement protection for BOTH export targets.
    if (hasLocalProviderReference(row.providerDecargoId)) {
      validationErrors.push({ id, reason: "Vínculo apenas local: exportação bloqueada até validar o prestador no DECARGO People" }); continue;
    }
    // Diárias extras need a payment date; faltas have auto-calculated discount date.
    if (row.exportTarget === "diaria_extra") {
      const effectivePaymentDate = row.paymentDate ?? fallbackPaymentDate ?? null;
      if (!effectivePaymentDate) {
        validationErrors.push({ id, reason: "Data de pagamento não preenchida" }); continue;
      }
    }
    if (row.exportTarget === "falta" && (!row.cnpj || !row.cnpj.trim())) {
      validationErrors.push({ id, reason: "CNPJ do prestador não cadastrado — sincronize ou cadastre manualmente" }); continue;
    }
    if (row.exportTarget === "diaria_extra" && (!row.providerDecargoId || Number.isNaN(Number(row.providerDecargoId)))) {
      validationErrors.push({ id, reason: "Prestador sem identificação válida no DECARGO People" });
    }
  }

  const invalidIds = new Set(validationErrors.map(({ id }) => id));
  const eligibleIds = [...new Set(diariaIds.filter((id) => !invalidIds.has(id)))];

  if (eligibleIds.length === 0) {
    res.status(400).json({ error: "Algumas diárias não passaram na validação", details: validationErrors });
    return;
  }

  // Separate by export target
  const diariaExtraIds = eligibleIds.filter((id) => byId.get(id)!.exportTarget === "diaria_extra");
  const faltaIds = eligibleIds.filter((id) => byId.get(id)!.exportTarget === "falta");

  // Fail before creating any reservation. This catch must not enter export
  // recovery: it owns no reservation and may not release another attempt's.
  try {
    await checkPeopleExportAvailability([
      ...(diariaExtraIds.length ? ["diarias" as const] : []),
      ...(faltaIds.length ? ["descontos" as const] : []),
    ]);
  } catch {
    res.status(503).json({
      error: "Não foi possível confirmar o acesso e os destinos necessários da integração DECARGO People. Nenhum lote foi enviado e nenhuma reserva foi alterada. Verifique a disponibilidade de diárias e descontos no People.",
      code: "PEOPLE_EXPORT_UNAVAILABLE",
    });
    return;
  }

  const integrationRef = `EXP-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date();
  const attempt = newExportAttempt(integrationRef, eligibleIds, validationErrors, now);

  // Reserve every record before sending any payload externally. This is the
  // synchronization point shared with permanent deletion: a reservation keeps
  // the record locally available but makes it ineligible for deletion or a
  // second export while DECARGO People processes the request.
  try {
    await db.transaction(async (tx) => {
      const reserved = await tx
        .update(diariasTable)
        .set({ integrationId: integrationRef, updatedAt: now })
        .where(and(
          inArray(diariasTable.id, eligibleIds),
          eq(diariasTable.status, "disponivel_exportacao"),
          isNull(diariasTable.integrationId),
        ))
        .returning({ id: diariasTable.id });

      if (reserved.length !== eligibleIds.length) {
        const error = new Error("Uma ou mais diárias foram alteradas durante a preparação da exportação");
        (error as Error & { code?: string }).code = "EXPORT_RESERVATION_CONFLICT";
        throw error;
      }
      await createExportAttempt(tx, attempt);
    });
  } catch (error) {
    if ((error as { code?: string }).code === "EXPORT_RESERVATION_CONFLICT") {
      res.status(409).json({ error: "Uma ou mais diárias já estão sendo exportadas ou foram alteradas" });
      return;
    }
    throw error;
  }

  const allFailedLocalIds = new Set<number>();
  const tracker = trackExportAttempt(attempt);
  const blockUnidentifiedResult = async (source: string) => {
    await Promise.all(eligibleIds.map((id) => logAudit({
      entityType: "diaria",
      entityId: id,
      action: "exportacao_aguardando_conferencia",
      actor: me,
      oldValues: { status: "disponivel_exportacao" },
      newValues: { integrationId: integrationRef, reason: "resultado_externo_nao_identificavel", source },
    })));
    await tracker.finish("interrupted", `Resultado externo não identificável para ${source}`, {
      confirmed: attempt.confirmed, rejected: attempt.rejected,
      uncertain: attempt.uncertain.length ? attempt.uncertain : eligibleIds,
      unsent: attempt.unsent,
    });
    res.status(502).json({
      error: `O DECARGO People devolveu um resultado externo não identificável para ${source}; os registros foram bloqueados para conferência`,
      integrationRef,
    });
  };

  // Both financial targets share the same recovery rules. Never release an
  // uncertain POST; do persist earlier receipts and release definitely unsent
  // records (including faltas not yet attempted after an extras failure).
  const handleBatchFailure = async (
    err: unknown, source: string, currentIds: number[],
    previouslyConfirmedIds: number[], notAttemptedIds: number[],
  ) => {
    const partial = err && typeof err === "object"
      && Array.isArray((err as { completedLocalIds?: unknown }).completedLocalIds)
      && Array.isArray((err as { rejectedLocalIds?: unknown }).rejectedLocalIds)
      && Array.isArray((err as { uncertainLocalIds?: unknown }).uncertainLocalIds)
      && Array.isArray((err as { pendingLocalIds?: unknown }).pendingLocalIds)
      ? err as {
          completedLocalIds: number[]; rejectedLocalIds: number[];
          uncertainLocalIds: number[]; pendingLocalIds: number[];
        }
      : null;
    const confirmedIds = [...previouslyConfirmedIds, ...(partial?.completedLocalIds ?? [])];
    const rejectedIds = [...allFailedLocalIds, ...(partial?.rejectedLocalIds ?? [])];
    const uncertainIds = partial?.uncertainLocalIds ?? currentIds;
    const retryableIds = [...rejectedIds, ...(partial?.pendingLocalIds ?? []), ...notAttemptedIds];

    if (confirmedIds.length > 0) {
      await db.update(diariasTable).set({
        status: "exportada", exportedAt: now, exportedBy: me.id, integrationId: integrationRef, updatedAt: now,
      }).where(and(inArray(diariasTable.id, confirmedIds), eq(diariasTable.integrationId, integrationRef)));
      for (const id of confirmedIds) {
        const row = byId.get(id)!;
        if (!row.paymentDate) {
          await db.update(diariasTable).set({
            paymentDate: row.exportTarget === "falta" ? calcDiscountDate(row.workDate) : fallbackPaymentDate,
            updatedAt: now,
          }).where(and(eq(diariasTable.id, id), eq(diariasTable.integrationId, integrationRef)));
        }
      }
    }
    if (retryableIds.length > 0) {
      await db.update(diariasTable).set({ integrationId: null, updatedAt: now }).where(and(
        inArray(diariasTable.id, retryableIds), eq(diariasTable.integrationId, integrationRef),
      ));
    }
    await Promise.all(confirmedIds.map((id) => logAudit({
      entityType: "diaria", entityId: id, action: "exportado", actor: me,
      oldValues: { status: "disponivel_exportacao" },
      newValues: { status: "exportada", integrationId: integrationRef, exportTarget: byId.get(id)?.exportTarget },
    })));
    await Promise.all(uncertainIds.map((id) => logAudit({
      entityType: "diaria", entityId: id, action: "exportacao_aguardando_conferencia", actor: me,
      oldValues: { status: "disponivel_exportacao" },
      newValues: { integrationId: integrationRef },
    })));
    await tracker.finish("interrupted", `Falha ao confirmar ${source}. Confira os registros incertos no People.`, {
      confirmed: confirmedIds, rejected: rejectedIds, uncertain: uncertainIds,
      unsent: [...(partial?.pendingLocalIds ?? []), ...notAttemptedIds],
    });
    res.status(502).json({
      error: `Falha ao enviar ${source} para o DECARGO People; o lote sem confirmação foi bloqueado para conferência: ${err instanceof Error ? err.message : String(err)}`,
      exported: confirmedIds, awaitingConfirmation: uncertainIds, retryable: retryableIds, integrationRef,
    });
  };

  // --- Export Diárias Extras ---
  if (diariaExtraIds.length > 0) {
    let extraResult;
    try {
      extraResult = await pushDiariasToPeople(
        diariaExtraIds.map((id) => {
          const row = byId.get(id)!;
          return {
            id_prestador: Number(row.providerDecargoId),
            dia_trabalhado: row.workDate,
            valor_diaria: Number(row.value),
            data_pagamento: (row.paymentDate ?? fallbackPaymentDate)!,
            anotacoes_gerais: row.observations ?? undefined,
            __localId: id,
          };
        }),
        tracker.progress,
      );
    } catch (err) {
      await handleBatchFailure(err, "diárias extras", diariaExtraIds, [], faltaIds);
      return;
    }
    const hasUnidentifiedExtraError =
      (extraResult.unidentifiedErrors ?? 0) > 0 ||
      (extraResult.errors ?? []).some((e) => typeof (e as { __localId?: number }).__localId !== "number");
    if (hasUnidentifiedExtraError) {
      await blockUnidentifiedResult("diárias extras");
      return;
    }
    for (const e of extraResult.errors ?? []) {
      const lid = (e as { __localId?: number }).__localId;
      if (typeof lid === "number") allFailedLocalIds.add(lid);
    }
  }

  // --- Export Faltas (Descontos) ---
  if (faltaIds.length > 0) {
    let faltaResult;
    try {
      faltaResult = await pushFaltasToPeople(
        faltaIds.map((id) => {
          const row = byId.get(id)!;
          return {
            cnpj: row.cnpj!,
            tipo: "Desconto de Diária",
            valor: Number(row.value),
            data_desconto: calcDiscountDate(row.workDate),
            anotacoes_gerais: row.observations ?? undefined,
            __localId: id,
          };
        }),
        tracker.progress,
      );
    } catch (err) {
      const confirmedExtraIds = diariaExtraIds.filter((id) => !allFailedLocalIds.has(id));
      await handleBatchFailure(err, "faltas", faltaIds, confirmedExtraIds, []);
      return;
    }
    const hasUnidentifiedFaltaError =
      (faltaResult.unidentifiedErrors ?? 0) > 0 ||
      (faltaResult.errors ?? []).some((e) => typeof (e as { __localId?: number }).__localId !== "number");
    if (hasUnidentifiedFaltaError) {
      await blockUnidentifiedResult("faltas");
      return;
    }
    for (const e of faltaResult.errors ?? []) {
      const lid = (e as { __localId?: number }).__localId;
      if (typeof lid === "number") allFailedLocalIds.add(lid);
    }
  }

  const succeededIds = eligibleIds.filter((id) => !allFailedLocalIds.has(id));

  // A known rejection from DECARGO People is safe to retry, so release only
  // those reservations. Unknown transport failures intentionally remain
  // reserved above to prevent a duplicate financial integration.
  if (allFailedLocalIds.size > 0) {
    await db
      .update(diariasTable)
      .set({ integrationId: null, updatedAt: now })
      .where(and(
        inArray(diariasTable.id, [...allFailedLocalIds]),
        eq(diariasTable.integrationId, integrationRef),
      ));
  }

  if (succeededIds.length > 0) {
    // Persist fallback payment date for diária_extra rows that needed it
    const extraSucceeded = succeededIds.filter((id) => byId.get(id)!.exportTarget === "diaria_extra");
    const succeededNeedingDate = fallbackPaymentDate
      ? extraSucceeded.filter((id) => !byId.get(id)!.paymentDate)
      : [];
    if (succeededNeedingDate.length > 0) {
      await db.update(diariasTable).set({ paymentDate: fallbackPaymentDate, updatedAt: now })
        .where(inArray(diariasTable.id, succeededNeedingDate));
    }
    // For faltas, persist the calculated discount date as paymentDate for display consistency
    const faltaSucceeded = succeededIds.filter((id) => byId.get(id)!.exportTarget === "falta");
    for (const id of faltaSucceeded) {
      const row = byId.get(id)!;
      if (!row.paymentDate) {
        await db.update(diariasTable).set({ paymentDate: calcDiscountDate(row.workDate), updatedAt: now })
          .where(eq(diariasTable.id, id));
      }
    }

    await db.update(diariasTable).set({
      status: "exportada", exportedAt: now, exportedBy: me.id, integrationId: integrationRef, updatedAt: now,
    }).where(inArray(diariasTable.id, succeededIds));

    for (const id of succeededIds) {
      await logAudit({
        entityType: "diaria", entityId: id, action: "exportado", actor: me,
        oldValues: { status: "disponivel_exportacao" },
        newValues: { status: "exportada", integrationId: integrationRef, exportTarget: byId.get(id)!.exportTarget },
      });
    }
  }

  for (const id of allFailedLocalIds) {
    await logAudit({
      entityType: "diaria", entityId: id, action: "exportacao_falhou", actor: me,
      newValues: { reason: "Rejeitado pelo DECARGO People" },
    });
  }

  await tracker.finish("completed", null, {
    confirmed: succeededIds, rejected: [...allFailedLocalIds], uncertain: [], unsent: [],
  });
  res.json({
    exported: succeededIds.length,
    integrationRef,
    exportedAt: now,
    skipped: [
      ...validationErrors,
      ...[...allFailedLocalIds].map((id) => ({ id, reason: "Rejeitado pelo DECARGO People" })),
    ],
  });
});

// GET /api/diarias/:id
router.get("/:id", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const me = req.currentUser!;
  const gestorTeamIds = me.role === "gestor" ? await getGestorTeamIds(me.id) : [];
  const result = await getDiariaById(Number(req.params.id), me.id, me.role, gestorTeamIds, me.decargoId);
  if (!result) {
    res.status(404).json({ error: "Diária não encontrada" });
    return;
  }
  res.json(result);
});

// PATCH /api/diarias/:id (admin only — correções passam exclusivamente pelo
// fluxo de aprovação do administrador; gestor não edita diárias já salvas)
router.patch("/:id", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);

  const [diaria] = await db
    .select()
    .from(diariasTable)
    .where(eq(diariasTable.id, id))
    .limit(1);

  if (!diaria) { res.status(404).json({ error: "Diária não encontrada" }); return; }

  if (LOCKED_STATUSES.includes(diaria.status)) {
    res.status(400).json({ error: "Diária já exportada/paga — não pode mais ser alterada" });
    return;
  }

  const { workDate, startTime, endTime, value, typeId, providerId, paymentDate, observations } = req.body as {
    workDate?: string;
    startTime?: string | null;
    endTime?: string | null;
    value?: number;
    typeId?: number | null;
    providerId?: number;
    paymentDate?: string | null;
    observations?: string | null;
  };

  const oldValues = { workDate: diaria.workDate, value: diaria.value, typeId: diaria.typeId, providerId: diaria.providerId };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (workDate !== undefined) updates.workDate = workDate;
  if (startTime !== undefined) updates.startTime = startTime;
  if (endTime !== undefined) updates.endTime = endTime;
  if (value !== undefined) {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      res.status(400).json({ error: "Valor inválido: informe um número maior que zero" });
      return;
    }
    updates.value = num.toFixed(2);
  }
  if (paymentDate !== undefined) updates.paymentDate = paymentDate;
  if (observations !== undefined) updates.observations = observations;
  if (typeId !== undefined) {
    if (typeId !== null) {
      const [tipo] = await db.select().from(diariaTypesTable).where(eq(diariaTypesTable.id, typeId)).limit(1);
      if (!tipo) { res.status(400).json({ error: "Tipo de diária não encontrado" }); return; }
    }
    updates.typeId = typeId;
  }
  if (providerId !== undefined) {
    const [prov] = await db.select().from(providersTable).where(eq(providersTable.id, providerId)).limit(1);
    if (!prov) { res.status(400).json({ error: "Prestador não encontrado" }); return; }
    updates.providerId = providerId;
  }

  if (diaria.status === "solicitacao_correcao") {
    updates.status = "pendente_aprovacao";
    updates.actionNote = null;
  }

  await db.update(diariasTable).set(updates).where(eq(diariasTable.id, id));

  await logAudit({
    entityType: "diaria",
    entityId: id,
    action: "editado",
    actor: me,
    oldValues,
    newValues: updates,
  });

  const result = await getDiariaById(id, me.id, me.role, [], me.decargoId);
  res.json(result);
});

// DELETE /api/diarias/:id (permanent) — admin only.
// Audit records deliberately remain as an immutable trace of the deletion.
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);

  const deleted = await db.transaction(async (tx) => {
    // The conditional delete is atomic with export reservation: if an export
    // claims the row first, integrationId is populated and this delete affects
    // no rows; if deletion wins, export cannot reserve or send the row.
    const [diaria] = await tx
      .delete(diariasTable)
      .where(and(
        eq(diariasTable.id, id),
        isNull(diariasTable.integrationId),
        notInArray(diariasTable.status, ["exportada", "paga"]),
      ))
      .returning();

    if (!diaria) return null;

    await tx.insert(auditLogsTable).values({
      entityType: "diaria",
      entityId: id,
      action: "excluido_permanentemente",
      userId: me.id,
      userNameAtAction: me.name,
      oldValues: {
        status: diaria.status,
        providerId: diaria.providerId,
        teamId: diaria.teamId,
        workDate: diaria.workDate,
        value: diaria.value,
        paymentDate: diaria.paymentDate,
      },
      newValues: { deleted: true },
      timestamp: new Date(),
    });
    return diaria;
  });

  if (!deleted) {
    const [current] = await db
      .select({ id: diariasTable.id })
      .from(diariasTable)
      .where(eq(diariasTable.id, id))
      .limit(1);
    if (!current) { res.status(404).json({ error: "Diária não encontrada" }); return; }
    res.status(400).json({ error: "Diária exportada, paga ou em processo de exportação não pode ser excluída" });
    return;
  }

  res.json({ id, deleted: true });
});

// POST /api/diarias/:id/revert (admin) — returns a non-locked diária to pendente_aprovacao
router.post("/:id/revert", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);

  const [diaria] = await db.select().from(diariasTable).where(eq(diariasTable.id, id)).limit(1);
  if (!diaria) { res.status(404).json({ error: "Diária não encontrada" }); return; }

  const revertable = ["disponivel_exportacao", "rejeitada", "aprovada", "em_analise"];
  if (!revertable.includes(diaria.status)) {
    res.status(400).json({ error: "Diária não pode ser revertida no status atual" });
    return;
  }

  const now = new Date();
  await db.update(diariasTable).set({
    status: "pendente_aprovacao",
    actionNote: null,
    approvedAt: null,
    approvedBy: null,
    updatedAt: now,
  }).where(eq(diariasTable.id, id));

  await logAudit({
    entityType: "diaria", entityId: id, action: "revertido", actor: me,
    oldValues: { status: diaria.status },
    newValues: { status: "pendente_aprovacao" },
  });
  const result = await getDiariaById(id, me.id, me.role, [], me.decargoId);
  res.json(result);
});

// POST /api/diarias/:id/approve (admin)
router.post("/:id/approve", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);
  const { note } = (req.body ?? {}) as { note?: string };

  const [diaria] = await db.select().from(diariasTable).where(eq(diariasTable.id, id)).limit(1);
  if (!diaria) { res.status(404).json({ error: "Diária não encontrada" }); return; }

  const approvable = ["pendente_aprovacao", "em_analise"];
  if (!approvable.includes(diaria.status)) {
    res.status(400).json({ error: "Diária não pode ser aprovada no status atual" });
    return;
  }

  const now = new Date();
  await db.update(diariasTable).set({
    status: "disponivel_exportacao",
    approvedAt: now,
    approvedBy: me.id,
    actionNote: note ?? null,
    updatedAt: now,
  }).where(eq(diariasTable.id, id));

  await logAudit({ entityType: "diaria", entityId: id, action: "aprovado", actor: me, newValues: { status: "disponivel_exportacao" } });
  const result = await getDiariaById(id, me.id, me.role, [], me.decargoId);
  res.json(result);
});

// POST /api/diarias/:id/reject (admin)
router.post("/:id/reject", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);
  const { note } = req.body as { note?: string };

  if (!note || !note.trim()) {
    res.status(400).json({ error: "Motivo da reprovação é obrigatório" });
    return;
  }

  const [diaria] = await db.select().from(diariasTable).where(eq(diariasTable.id, id)).limit(1);
  if (!diaria) { res.status(404).json({ error: "Diária não encontrada" }); return; }

  const rejectable = ["pendente_aprovacao", "em_analise", "disponivel_exportacao"];
  if (
    !rejectable.includes(diaria.status) ||
    (diaria.status === "disponivel_exportacao" && diaria.integrationId !== null)
  ) {
    res.status(400).json({ error: "Diária não pode ser reprovada no status atual" });
    return;
  }

  const now = new Date();
  await db.update(diariasTable).set({
    status: "rejeitada",
    actionNote: note,
    approvedAt: null,
    approvedBy: null,
    updatedAt: now,
  }).where(eq(diariasTable.id, id));

  await logAudit({ entityType: "diaria", entityId: id, action: "rejeitado", actor: me, oldValues: { status: diaria.status }, newValues: { status: "rejeitada", note } });
  const result = await getDiariaById(id, me.id, me.role, [], me.decargoId);
  res.json(result);
});

// POST /api/diarias/:id/request-correction (admin)
router.post("/:id/request-correction", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);
  const { note } = req.body as { note?: string };

  const [diaria] = await db.select().from(diariasTable).where(eq(diariasTable.id, id)).limit(1);
  if (!diaria) { res.status(404).json({ error: "Diária não encontrada" }); return; }
  if (LOCKED_STATUSES.includes(diaria.status)) {
    res.status(400).json({ error: "Diária já exportada/paga — status não pode mais ser alterado" });
    return;
  }

  const now = new Date();
  await db.update(diariasTable).set({
    status: "solicitacao_correcao",
    actionNote: note ?? null,
    updatedAt: now,
  }).where(eq(diariasTable.id, id));

  await logAudit({ entityType: "diaria", entityId: id, action: "solicitacao_correcao", actor: me, newValues: { status: "solicitacao_correcao", note } });
  const result = await getDiariaById(id, me.id, me.role, [], me.decargoId);
  res.json(result);
});

// POST /api/diarias/:id/mark-paid (admin)
router.post("/:id/mark-paid", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);

  const [diaria] = await db.select().from(diariasTable).where(eq(diariasTable.id, id)).limit(1);
  if (!diaria) { res.status(404).json({ error: "Diária não encontrada" }); return; }

  if (diaria.status !== "exportada") {
    res.status(400).json({ error: "Somente diárias exportadas podem ser marcadas como pagas" });
    return;
  }

  const now = new Date();
  await db.update(diariasTable).set({ status: "paga", paidAt: now, updatedAt: now }).where(eq(diariasTable.id, id));

  await logAudit({ entityType: "diaria", entityId: id, action: "pago", actor: me, newValues: { status: "paga" } });
  const result = await getDiariaById(id, me.id, me.role, [], me.decargoId);
  res.json(result);
});

export default router;
