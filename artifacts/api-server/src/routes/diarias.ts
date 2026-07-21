import { Router } from "express";
import {
  db,
  pool,
  diariasTable,
  diariaTypesTable,
  providersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";
import { pushDiariasToPeople, pushFaltasToPeople } from "../lib/peopleClient";
import { getGestorTeamIds } from "../lib/gestorTeams";
import { buildDiariaFilters, type AnaliseFilterQuery } from "../lib/diariaFilters";

const router = Router();

// Gestor não deve ver valores de diárias em nenhuma tela ou chamada de API.
function canSeeValue(role: string) {
  return role === "admin";
}

// Statuses considered "locked" — financial fields and status may not change
// once a diária reaches one of these (Bloqueio Pós-Exportação).
const LOCKED_STATUSES = ["exportada", "paga"];

async function getDiariaById(id: number, userId: number, role: string, gestorTeamIds: number[], decargoId: string) {
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

  if (role === "gestor" && !gestorTeamIds.includes(Number(row.teamId))) {
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

  // Scope for gestor is derived from teams.manager_id, not users.team_id.
  const gestorTeamIds = me.role === "gestor" ? await getGestorTeamIds(me.id) : [];
  const { where, params } = buildDiariaFilters(me, query, { gestorTeamIds });

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

  if (!typeId) {
    res.status(400).json({ error: "Tipo de diária é obrigatório" });
    return;
  }
  const [diariaType] = await db.select().from(diariaTypesTable).where(eq(diariaTypesTable.id, typeId)).limit(1);
  if (!diariaType || !diariaType.active) {
    res.status(400).json({ error: "Tipo de diária inválido ou inativo" });
    return;
  }

  // Gestor can only create for their managed teams (derived from teams.manager_id).
  const gestorTeamIds = me.role === "gestor" ? await getGestorTeamIds(me.id) : [];
  if (me.role === "gestor" && !gestorTeamIds.includes(teamId)) {
    res.status(403).json({ error: "Você só pode lançar diárias das suas equipes" });
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

  await logAudit({
    entityType: "diaria",
    entityId: diaria.id,
    action: "criado",
    userId: me.id,
    newValues: { status: "pendente_aprovacao", value: effectiveValue, providerId, teamId, workDate },
  });

  const result = await getDiariaById(diaria.id, me.id, me.role, gestorTeamIds, me.decargoId);
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
            p.cnpj, d.work_date AS "workDate", d.value, d.payment_date AS "paymentDate",
            d.observations, dt.export_target AS "exportTarget"
     FROM diarias d
     JOIN providers p ON p.id = d.provider_id
     LEFT JOIN diaria_types dt ON dt.id = d.type_id
     WHERE d.id = ANY($1::int[])`,
    [diariaIds],
  );

  const byId = new Map(rows.rows.map((r) => [r.id, r]));

  // Validate every requested record before touching anything (all-or-nothing).
  const validationErrors: { id: number; reason: string }[] = [];
  for (const id of diariaIds) {
    const row = byId.get(id);
    if (!row) { validationErrors.push({ id, reason: "Diária não encontrada" }); continue; }
    if (row.status !== "disponivel_exportacao") {
      validationErrors.push({ id, reason: "Diária não está aprovada/disponível para exportação" }); continue;
    }
    if (!row.exportTarget) {
      validationErrors.push({ id, reason: "Tipo de diária não definido — configure o tipo antes de exportar" }); continue;
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

  if (validationErrors.length > 0) {
    res.status(400).json({ error: "Algumas diárias não passaram na validação", details: validationErrors });
    return;
  }

  // Separate by export target
  const diariaExtraIds = diariaIds.filter((id) => byId.get(id)!.exportTarget === "diaria_extra");
  const faltaIds = diariaIds.filter((id) => byId.get(id)!.exportTarget === "falta");

  const integrationRef = `EXP-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date();
  const allFailedLocalIds = new Set<number>();

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
      );
    } catch (err) {
      res.status(502).json({ error: `Falha ao enviar diárias extras: ${err instanceof Error ? err.message : String(err)}` });
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
      );
    } catch (err) {
      res.status(502).json({ error: `Falha ao enviar faltas para o DECARGO People: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    for (const e of faltaResult.errors ?? []) {
      const lid = (e as { __localId?: number }).__localId;
      if (typeof lid === "number") allFailedLocalIds.add(lid);
    }
  }

  const succeededIds = diariaIds.filter((id) => !allFailedLocalIds.has(id));

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
        entityType: "diaria", entityId: id, action: "exportado", userId: me.id,
        oldValues: { status: "disponivel_exportacao" },
        newValues: { status: "exportada", integrationId: integrationRef, exportTarget: byId.get(id)!.exportTarget },
      });
    }
  }

  for (const id of allFailedLocalIds) {
    await logAudit({
      entityType: "diaria", entityId: id, action: "exportacao_falhou", userId: me.id,
      newValues: { reason: "Rejeitado pelo DECARGO People" },
    });
  }

  res.json({
    exported: succeededIds.length,
    integrationRef,
    exportedAt: now,
    skipped: [...allFailedLocalIds].map((id) => ({ id, reason: "Rejeitado pelo DECARGO People" })),
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

  // Admin pode corrigir qualquer campo em qualquer status. Diárias já
  // exportadas precisam de atenção extra, mas a regra de negócio permite
  // que o admin faça ajustes retroativos (ex.: atribuir tipo a registros antigos).
  const { workDate, startTime, endTime, value, typeId, paymentDate, observations } = req.body as {
    workDate?: string;
    startTime?: string | null;
    endTime?: string | null;
    value?: number;
    typeId?: number | null;
    paymentDate?: string | null;
    observations?: string | null;
  };

  const oldValues = { workDate: diaria.workDate, value: diaria.value, typeId: diaria.typeId };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (workDate !== undefined) updates.workDate = workDate;
  if (startTime !== undefined) updates.startTime = startTime;
  if (endTime !== undefined) updates.endTime = endTime;
  if (value !== undefined) updates.value = String(value);
  if (paymentDate !== undefined) updates.paymentDate = paymentDate;
  if (observations !== undefined) updates.observations = observations;
  if (typeId !== undefined) {
    if (typeId !== null) {
      const [tipo] = await db.select().from(diariaTypesTable).where(eq(diariaTypesTable.id, typeId)).limit(1);
      if (!tipo) { res.status(400).json({ error: "Tipo de diária não encontrado" }); return; }
    }
    updates.typeId = typeId;
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
    userId: me.id,
    oldValues,
    newValues: updates,
  });

  const result = await getDiariaById(id, me.id, me.role, [], me.decargoId);
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

  const result = await getDiariaById(id, me.id, me.role, [], me.decargoId);
  res.json(result);
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
    entityType: "diaria", entityId: id, action: "revertido", userId: me.id,
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

  await logAudit({ entityType: "diaria", entityId: id, action: "aprovado", userId: me.id, newValues: { status: "disponivel_exportacao" } });
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

  const now = new Date();
  await db.update(diariasTable).set({
    status: "solicitacao_correcao",
    actionNote: note ?? null,
    updatedAt: now,
  }).where(eq(diariasTable.id, id));

  await logAudit({ entityType: "diaria", entityId: id, action: "solicitacao_correcao", userId: me.id, newValues: { status: "solicitacao_correcao", note } });
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

  await logAudit({ entityType: "diaria", entityId: id, action: "pago", userId: me.id, newValues: { status: "paga" } });
  const result = await getDiariaById(id, me.id, me.role, [], me.decargoId);
  res.json(result);
});

export default router;
