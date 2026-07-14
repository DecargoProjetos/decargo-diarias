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

const router = Router();

function canSeeValue(role: string) {
  return role === "admin" || role === "gestor";
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
  const me = req.currentUser!;
  const {
    status, providerId, teamId, managerId, startDate, endDate,
    page = "1", pageSize = "20",
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, Number(page));
  const pageSz = Math.min(100, Math.max(1, Number(pageSize)));
  const offset = (pageNum - 1) * pageSz;

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  // Role-based filter
  if (me.role === "gestor") {
    conditions.push(`d.team_id = ${p++}`);
    params.push(me.teamId);
  } else if (me.role !== "admin") {
    // Prestadores/funcionários only see diárias linked to their own provider
    // record (funcionários have none, so they see an empty list — expected).
    conditions.push(`p.decargo_id = ${p++}`);
    params.push(me.decargoId);
  }

  if (status) { conditions.push(`d.status = ${p++}`); params.push(status); }
  if (providerId) { conditions.push(`d.provider_id = ${p++}`); params.push(Number(providerId)); }
  if (teamId && me.role === "admin") { conditions.push(`d.team_id = ${p++}`); params.push(Number(teamId)); }
  if (managerId) { conditions.push(`d.manager_id = ${p++}`); params.push(Number(managerId)); }
  if (startDate) { conditions.push(`d.work_date >= ${p++}`); params.push(startDate); }
  if (endDate) { conditions.push(`d.work_date <= ${p++}`); params.push(endDate); }

  const where = conditions.join(" AND ");

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

  const [diaria] = await db
    .insert(diariasTable)
    .values({
      providerId,
      teamId,
      managerId: me.id,
      workDate,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      value: String(value),
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
    newValues: { status: "pendente_aprovacao", value, providerId, teamId, workDate },
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

  // Verify all are in disponivel_exportacao status
  const available = await db
    .select({ id: diariasTable.id })
    .from(diariasTable)
    .where(
      and(
        inArray(diariasTable.id, diariaIds),
        eq(diariasTable.status, "disponivel_exportacao"),
      ),
    );

  if (available.length !== diariaIds.length) {
    res.status(400).json({ error: "Algumas diárias não estão disponíveis para exportação ou já foram exportadas" });
    return;
  }

  const integrationRef = `EXP-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date();

  await db
    .update(diariasTable)
    .set({
      status: "exportada",
      exportedAt: now,
      exportedBy: me.id,
      integrationId: integrationRef,
      updatedAt: now,
    })
    .where(inArray(diariasTable.id, diariaIds));

  for (const id of diariaIds) {
    await logAudit({
      entityType: "diaria",
      entityId: id,
      action: "exportado",
      userId: me.id,
      newValues: { status: "exportada", integrationId: integrationRef },
    });
  }

  res.json({ exported: diariaIds.length, integrationRef, exportedAt: now });
});

// GET /api/diarias/:id
router.get("/:id", requireAuth, async (req, res) => {
  const me = req.currentUser!;
  const result = await getDiariaById(Number(req.params.id), me.id, me.role, me.teamId, me.decargoId);
  if (!result) {
    res.status(404).json({ error: "Diária não encontrada" });
    return;
  }
  res.json(result);
});

// PATCH /api/diarias/:id (manager, while pending/correction_requested)
router.patch("/:id", requireRole("admin", "gestor"), async (req, res) => {
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

  if (me.role === "gestor" && diaria.teamId !== me.teamId) {
    res.status(403).json({ error: "Acesso não autorizado" });
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

// DELETE /api/diarias/:id (cancel)
router.delete("/:id", requireRole("admin", "gestor"), async (req, res) => {
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

  if (me.role === "gestor" && diaria.teamId !== me.teamId) {
    res.status(403).json({ error: "Acesso não autorizado" });
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

  const [diaria] = await db.select().from(diariasTable).where(eq(diariasTable.id, id)).limit(1);
  if (!diaria) { res.status(404).json({ error: "Diária não encontrada" }); return; }

  const now = new Date();
  await db.update(diariasTable).set({
    status: "rejeitada",
    actionNote: note ?? null,
    updatedAt: now,
  }).where(eq(diariasTable.id, id));

  await logAudit({ entityType: "diaria", entityId: id, action: "rejeitado", userId: me.id, newValues: { status: "rejeitada", note } });
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
