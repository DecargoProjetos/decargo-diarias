import { Router } from "express";
import {
  db,
  pool,
  diariasTable,
  providersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";
import { pushDiariasToPeople } from "../lib/peopleClient";

const router = Router();

// Gestor não deve ver valores de diárias em nenhuma tela ou chamada de API.
function canSeeValue(role: string) {
  return role === "admin";
}

// Statuses considered "locked" — financial fields and status may not change
// once a diária reaches one of these (Bloqueio Pós-Exportação).
const LOCKED_STATUSES = ["exportada", "paga"];

interface AnaliseFilterQuery {
  name?: string;
  providerId?: string;
  teamId?: string;
  managerId?: string;
  startDate?: string;
  endDate?: string;
  minValue?: string;
  maxValue?: string;
  value?: string;
  status?: string;
}

/**
 * Builds the shared WHERE clause + params for the diárias list/summary/ids
 * endpoints. Applies role-based scoping first, then the optional filters
 * used by both the calendar screens and the new Análise de Diárias screen.
 */
function buildDiariaFilters(
  me: { id: number; role: string; teamId: number | null; decargoId: string },
  query: AnaliseFilterQuery,
  opts: { includeStatus?: boolean } = {},
) {
  const { includeStatus = true } = opts;
  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  if (me.role === "gestor") {
    conditions.push(`d.team_id = $${p++}`);
    params.push(me.teamId);
  } else if (me.role !== "admin") {
    conditions.push(`p.decargo_id = $${p++}`);
    params.push(me.decargoId);
  }

  if (includeStatus && query.status) {
    conditions.push(`d.status = $${p++}`);
    params.push(query.status);
  }
  if (query.providerId) {
    conditions.push(`d.provider_id = $${p++}`);
    params.push(Number(query.providerId));
  }
  if (query.teamId && me.role === "admin") {
    conditions.push(`d.team_id = $${p++}`);
    params.push(Number(query.teamId));
  }
  if (query.managerId) {
    conditions.push(`d.manager_id = $${p++}`);
    params.push(Number(query.managerId));
  }
  if (query.startDate) {
    conditions.push(`d.work_date >= $${p++}`);
    params.push(query.startDate);
  }
  if (query.endDate) {
    conditions.push(`d.work_date <= $${p++}`);
    params.push(query.endDate);
  }
  if (query.name) {
    conditions.push(`p.name ILIKE $${p++}`);
    params.push(`%${query.name}%`);
  }
  if (query.value) {
    conditions.push(`d.value = $${p++}`);
    params.push(Number(query.value));
  } else {
    if (query.minValue) {
      conditions.push(`d.value >= $${p++}`);
      params.push(Number(query.minValue));
    }
    if (query.maxValue) {
      conditions.push(`d.value <= $${p++}`);
      params.push(Number(query.maxValue));
    }
  }

  return { where: conditions.join(" AND "), params };
}

async function getDiariaById(id: number, userId: number, role: string, teamId: number | null, decargoId: string) {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT
        d.id, d.provider_id AS "providerId", p.name AS "providerName",
        d.team_id AS "teamId", t.name AS "teamName",
        d.manager_id AS "managerId", mu.name AS "managerName",
        d.work_date AS "workDate",
        d.start_time AS "startTime", d.end_time AS "endTime",
        d.value, d.payment_date AS "paymentDate",
        d.observations, d.status, d.action_note AS "actionNote",
        d.created_at AS "createdAt", cu.name AS "createdByName",
        d.approved_at AS "approvedAt", au.name AS "approvedByName",
        d.exported_at AS "exportedAt", eu.name AS "exportedByName",
        d.integration_id AS "integrationId",
        d.paid_at AS "paidAt", d.cancelled_at AS "cancelledAt",
        p.decargo_id AS "providerDecargoId"
      FROM diarias d
      JOIN providers p ON p.id = d.provider_id
      JOIN teams t ON t.id = d.team_id
      JOIN users cu ON cu.id = d.created_by
      LEFT JOIN users mu ON mu.id = d.manager_id
      LEFT JOIN users au ON au.id = d.approved_by
      LEFT JOIN users eu ON eu.id = d.exported_by
      WHERE d.id = $1`,
    [id]
  );

  const row = result.rows[0];
  if (!row) return null;

  // Record-level access control
  if (role !== "admin" && role !== "gestor") {
    // Prestadores/funcionários may only see diárias linked to their provider
    // record (funcionários have none, so they see nothing here — expected,
    // since diárias belong to prestadores).
    if (String(row.providerDecargoId) !== String(decargoId)) {
      return null;
    }
  }

  if (role === "gestor" && teamId && Number(row.teamId) !== teamId) {
    return null;
  }

  const { providerDecargoId: _omit, ...rest } = row;
  return { ...rest, value: canSeeValue(role) ? rest.value : null };
}

// GET /api/diarias
router.get("/", requireAuth, async (req, res) => {
  // The `value` field is role-dependent (null for gestor) — never let the
  // browser/CDN cache this response, or a gestor could keep seeing a
  // previously admin-fetched response with the real value.
  res.set("Cache-Control", "no-store");
  const me = req.currentUser!;
  const query = req.query as AnaliseFilterQuery;
  const { page = "1", pageSize = "20" } = req.query as Record<string, string>;

  const pageNum = Math.max(1, Number(page));
  const pageSz = Math.min(100, Math.max(1, Number(pageSize)));
  const offset = (pageNum - 1) * pageSz;

  const { where, params } = buildDiariaFilters(me, query);

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
          d.work_date AS "workDate",
          d.start_time AS "startTime", d.end_time AS "endTime",
          d.value, d.payment_date AS "paymentDate",
          d.observations, d.status, d.action_note AS "actionNote",
          d.created_at AS "createdAt", cu.name AS "createdByName",
          d.approved_at AS "approvedAt", au.name AS "approvedByName",
          d.exported_at AS "exportedAt", eu.name AS "exportedByName",
          d.integration_id AS "integrationId",
          d.paid_at AS "paidAt", d.cancelled_at AS "cancelledAt"
        FROM diarias d
        JOIN providers p ON p.id = d.provider_id
        JOIN teams t ON t.id = d.team_id
        JOIN users cu ON cu.id = d.created_by
        LEFT JOIN users mu ON mu.id = d.manager_id
        LEFT JOIN users au ON au.id = d.approved_by
        LEFT JOIN users eu ON eu.id = d.exported_by
        WHERE ${where}
        ORDER BY d.created_at DESC
        LIMIT ${pageSz} OFFSET ${offset}`,
      params
    ),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);
  const data = rows.rows.map((row) => ({
    ...row,
    value: canSeeValue(me.role) ? row.value : null,
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
        userId: me.id,
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
    .select({ id: diariasTable.id, status: diariasTable.status })
    .from(diariasTable)
    .where(inArray(diariasTable.id, diariaIds));

  const rejectable = ["pendente_aprovacao", "em_analise"];
  const foundIds = new Set(rows.map((r) => r.id));
  const succeeded: number[] = [];
  const failed: { id: number; reason: string }[] = [];

  for (const id of diariaIds) {
    if (!foundIds.has(id)) failed.push({ id, reason: "Diária não encontrada" });
  }
  const toReject = rows.filter((r) => rejectable.includes(r.status));
  for (const r of rows) {
    if (!rejectable.includes(r.status)) {
      failed.push({ id: r.id, reason: "Diária não pode ser reprovada no status atual" });
    }
  }

  if (toReject.length > 0) {
    const now = new Date();
    await db
      .update(diariasTable)
      .set({ status: "rejeitada", actionNote: note, updatedAt: now })
      .where(inArray(diariasTable.id, toReject.map((r) => r.id)));

    for (const r of toReject) {
      succeeded.push(r.id);
      await logAudit({
        entityType: "diaria",
        entityId: r.id,
        action: "rejeitado_em_lote",
        userId: me.id,
        oldValues: { status: r.status },
        newValues: { status: "rejeitada", note },
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
      userId: me.id,
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
    userId: me.id,
    oldValues: { paymentDate: diaria.paymentDate },
    newValues: { paymentDate },
  });

  const result = await getDiariaById(id, me.id, me.role, me.teamId, me.decargoId);
  res.json(result);
});

// POST /api/diarias (gestor/admin)
router.post("/", requireRole("admin", "gestor"), async (req, res) => {
  const me = req.currentUser!;
  const { providerId, teamId, workDate, startTime, endTime, value, paymentDate, observations } =
    req.body as {
      providerId: number;
      teamId: number;
      workDate: string;
      startTime?: string | null;
      endTime?: string | null;
      value: number;
      paymentDate?: string;
      observations?: string;
    };

  // Gestor can only create for their team
  if (me.role === "gestor" && teamId !== me.teamId) {
    res.status(403).json({ error: "Você só pode lançar diárias da sua equipe" });
    return;
  }

  // Gestor never sees a diária's value, so the client cannot be trusted (or
  // even able) to supply it. The server looks up the provider's current
  // dailyRate itself and uses that, ignoring whatever the client sent.
  let effectiveValue = value;
  if (me.role === "gestor") {
    const [provider] = await db
      .select({ dailyRate: providersTable.dailyRate })
      .from(providersTable)
      .where(eq(providersTable.id, providerId));
    if (!provider || provider.dailyRate == null) {
      res.status(400).json({ error: "Configure o valor da diária deste prestador em Pessoas antes de lançar." });
      return;
    }
    effectiveValue = Number(provider.dailyRate);
  }

  const [diaria] = await db
    .insert(diariasTable)
    .values({
      providerId,
      teamId,
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

  await logAudit({
    entityType: "diaria",
    entityId: diaria.id,
    action: "criado",
    userId: me.id,
    newValues: { status: "pendente_aprovacao", value: effectiveValue, providerId, teamId, workDate },
  });

  const result = await getDiariaById(diaria.id, me.id, me.role, me.teamId, me.decargoId);
  res.status(201).json(result);
});

// POST /api/diarias/export (must come before /:id)
router.post("/export", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const { diariaIds } = req.body as { diariaIds: number[] };

  if (!diariaIds?.length) {
    res.status(400).json({ error: "Nenhuma diária selecionada" });
    return;
  }

  const rows = await pool.query<{
    id: number; status: string; providerDecargoId: string; providerName: string;
    workDate: string; value: string; paymentDate: string | null; observations: string | null;
  }>(
    `SELECT d.id, d.status, p.decargo_id AS "providerDecargoId", p.name AS "providerName",
            d.work_date AS "workDate", d.value, d.payment_date AS "paymentDate", d.observations
     FROM diarias d JOIN providers p ON p.id = d.provider_id
     WHERE d.id = ANY($1::int[])`,
    [diariaIds],
  );

  const byId = new Map(rows.rows.map((r) => [r.id, r]));

  // Validate every requested record before touching anything (all-or-nothing):
  // must exist, be approved (disponivel_exportacao), not yet exported, and
  // have a payment date filled in.
  const validationErrors: { id: number; reason: string }[] = [];
  for (const id of diariaIds) {
    const row = byId.get(id);
    if (!row) { validationErrors.push({ id, reason: "Diária não encontrada" }); continue; }
    if (row.status !== "disponivel_exportacao") {
      validationErrors.push({ id, reason: "Diária não está aprovada/disponível para exportação" });
      continue;
    }
    if (!row.paymentDate) {
      validationErrors.push({ id, reason: "Data de pagamento não preenchida" });
      continue;
    }
    if (!row.providerDecargoId || Number.isNaN(Number(row.providerDecargoId))) {
      validationErrors.push({ id, reason: "Prestador sem identificação válida no DECARGO People" });
    }
  }

  if (validationErrors.length > 0) {
    res.status(400).json({
      error: "Algumas diárias não passaram na validação de exportação",
      details: validationErrors,
    });
    return;
  }

  // Push to DECARGO People > Folha Mensal > Diárias Extras before marking
  // anything locally as exported — if the remote call fails, nothing changes.
  let peopleResult;
  try {
    peopleResult = await pushDiariasToPeople(
      diariaIds.map((id) => {
        const row = byId.get(id)!;
        return {
          id_prestador: Number(row.providerDecargoId),
          dia_trabalhado: row.workDate,
          valor_diaria: Number(row.value),
          data_pagamento: row.paymentDate!,
          anotacoes_gerais: row.observations ?? undefined,
          __localId: id,
        };
      }),
    );
  } catch (err) {
    res.status(502).json({
      error: `Falha ao enviar diárias para o DECARGO People: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  const failedLocalIds = new Set(
    (peopleResult.errors ?? [])
      .map((e) => (e as { __localId?: number }).__localId)
      .filter((v): v is number => typeof v === "number"),
  );

  const succeededIds = diariaIds.filter((id) => !failedLocalIds.has(id));
  const integrationRef = `EXP-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date();

  if (succeededIds.length > 0) {
    await db
      .update(diariasTable)
      .set({
        status: "exportada",
        exportedAt: now,
        exportedBy: me.id,
        integrationId: integrationRef,
        updatedAt: now,
      })
      .where(inArray(diariasTable.id, succeededIds));

    for (const id of succeededIds) {
      await logAudit({
        entityType: "diaria",
        entityId: id,
        action: "exportado",
        userId: me.id,
        oldValues: { status: "disponivel_exportacao" },
        newValues: { status: "exportada", integrationId: integrationRef },
      });
    }
  }

  for (const id of failedLocalIds) {
    await logAudit({
      entityType: "diaria",
      entityId: id,
      action: "exportacao_falhou",
      userId: me.id,
      newValues: { peopleErrors: peopleResult.errors },
    });
  }

  res.json({
    exported: succeededIds.length,
    integrationRef,
    exportedAt: now,
    skipped: [...failedLocalIds].map((id) => ({ id, reason: "Rejeitado pelo DECARGO People" })),
  });
});

// GET /api/diarias/:id
router.get("/:id", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const me = req.currentUser!;
  const result = await getDiariaById(Number(req.params.id), me.id, me.role, me.teamId, me.decargoId);
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

  const editableStatuses = ["pendente_aprovacao", "solicitacao_correcao"];
  if (!editableStatuses.includes(diaria.status)) {
    res.status(400).json({ error: "Diária não pode ser editada no status atual" });
    return;
  }

  const { workDate, startTime, endTime, value, paymentDate, observations } = req.body as {
    workDate?: string;
    startTime?: string | null;
    endTime?: string | null;
    value?: number;
    paymentDate?: string | null;
    observations?: string | null;
  };

  const oldValues = { workDate: diaria.workDate, value: diaria.value };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (workDate !== undefined) updates.workDate = workDate;
  if (startTime !== undefined) updates.startTime = startTime;
  if (endTime !== undefined) updates.endTime = endTime;
  if (value !== undefined) updates.value = String(value);
  if (paymentDate !== undefined) updates.paymentDate = paymentDate;
  if (observations !== undefined) updates.observations = observations;

  if (diaria.status === "solicitacao_correcao") {
    updates.status = "pendente_aprovacao";
    updates.actionNote = null;
  }

  await db.update(diariasTable).set(updates).where(eq(diariasTable.id, id));

  await logAudit({
    entityType: "diaria",
    entityId: id,
    action: "editado",
    userId: me.id,
    oldValues,
    newValues: updates,
  });

  const result = await getDiariaById(id, me.id, me.role, me.teamId, me.decargoId);
  res.json(result);
});

// DELETE /api/diarias/:id (cancel) — admin only, same rationale as PATCH above
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);

  const [diaria] = await db
    .select()
    .from(diariasTable)
    .where(eq(diariasTable.id, id))
    .limit(1);

  if (!diaria) { res.status(404).json({ error: "Diária não encontrada" }); return; }

  const nonCancellable = ["exportada", "paga", "cancelada"];
  if (nonCancellable.includes(diaria.status)) {
    res.status(400).json({ error: "Diária não pode ser cancelada no status atual" });
    return;
  }

  const now = new Date();
  await db
    .update(diariasTable)
    .set({ status: "cancelada", cancelledAt: now, cancelledBy: me.id, updatedAt: now })
    .where(eq(diariasTable.id, id));

  await logAudit({
    entityType: "diaria",
    entityId: id,
    action: "cancelado",
    userId: me.id,
    oldValues: { status: diaria.status },
    newValues: { status: "cancelada" },
  });

  const result = await getDiariaById(id, me.id, me.role, me.teamId, me.decargoId);
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

  await logAudit({ entityType: "diaria", entityId: id, action: "aprovado", userId: me.id, newValues: { status: "disponivel_exportacao" } });
  const result = await getDiariaById(id, me.id, me.role, me.teamId, me.decargoId);
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

  const rejectable = ["pendente_aprovacao", "em_analise"];
  if (!rejectable.includes(diaria.status)) {
    res.status(400).json({ error: "Diária não pode ser reprovada no status atual" });
    return;
  }

  const now = new Date();
  await db.update(diariasTable).set({
    status: "rejeitada",
    actionNote: note,
    updatedAt: now,
  }).where(eq(diariasTable.id, id));

  await logAudit({ entityType: "diaria", entityId: id, action: "rejeitado", userId: me.id, oldValues: { status: diaria.status }, newValues: { status: "rejeitada", note } });
  const result = await getDiariaById(id, me.id, me.role, me.teamId, me.decargoId);
  res.json(result);
});

// POST /api/diarias/:id/request-correction (admin)
router.post("/:id/request-correction", requireRole("admin"), async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);
  const { note } = req.body as { note?: string };

  const [diaria] = await db.select().from(diariasTable).where(eq(diariasTable.id, id)).limit(1);
  if (!diaria) { res.status(404).json({ error: "Diária não encontrada" }); return; }

  const now = new Date();
  await db.update(diariasTable).set({
    status: "solicitacao_correcao",
    actionNote: note ?? null,
    updatedAt: now,
  }).where(eq(diariasTable.id, id));

  await logAudit({ entityType: "diaria", entityId: id, action: "solicitacao_correcao", userId: me.id, newValues: { status: "solicitacao_correcao", note } });
  const result = await getDiariaById(id, me.id, me.role, me.teamId, me.decargoId);
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

  await logAudit({ entityType: "diaria", entityId: id, action: "pago", userId: me.id, newValues: { status: "paga" } });
  const result = await getDiariaById(id, me.id, me.role, me.teamId, me.decargoId);
  res.json(result);
});

export default router;
