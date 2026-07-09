import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /api/dashboard/summary
router.get("/summary", requireAuth, async (req, res) => {
  const me = req.currentUser!;
  const canSeeFinancials = me.role === "admin" || me.role === "gestor";

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  if (me.role === "gestor") {
    conditions.push(`d.team_id = $${p++}`);
    params.push(me.teamId);
  } else if (me.role === "prestador") {
    conditions.push(`p.decargo_id = $${p++}`);
    params.push(me.decargoId);
  }

  const where = conditions.join(" AND ");

  const result = await pool.query<Record<string, unknown>>(
    `SELECT
        COUNT(*) FILTER (WHERE d.status = 'pendente_aprovacao') AS pendentes,
        COUNT(*) FILTER (WHERE d.status = 'em_analise') AS "emAnalise",
        COUNT(*) FILTER (WHERE d.status = 'aprovada') AS aprovadas,
        COUNT(*) FILTER (WHERE d.status = 'rejeitada') AS rejeitadas,
        COUNT(*) FILTER (WHERE d.status = 'disponivel_exportacao') AS "disponivelExportacao",
        COUNT(*) FILTER (WHERE d.status = 'exportada') AS exportadas,
        COUNT(*) FILTER (WHERE d.status = 'paga') AS pagas,
        COUNT(*) FILTER (WHERE d.status = 'cancelada') AS canceladas,
        SUM(d.value::numeric) FILTER (WHERE d.status IN ('aprovada','disponivel_exportacao')) AS "totalValorAprovadas",
        SUM(d.value::numeric) FILTER (WHERE d.status = 'exportada') AS "totalValorExportadas",
        SUM(d.value::numeric) FILTER (WHERE d.status = 'paga') AS "totalValorPagas"
      FROM diarias d
      JOIN providers p ON p.id = d.provider_id
      WHERE ${where}`,
    params
  );

  const row = result.rows[0] ?? {};
  res.json({
    pendentes: Number(row.pendentes ?? 0),
    emAnalise: Number(row.emAnalise ?? 0),
    aprovadas: Number(row.aprovadas ?? 0),
    rejeitadas: Number(row.rejeitadas ?? 0),
    disponivelExportacao: Number(row.disponivelExportacao ?? 0),
    exportadas: Number(row.exportadas ?? 0),
    pagas: Number(row.pagas ?? 0),
    canceladas: Number(row.canceladas ?? 0),
    totalValorAprovadas: canSeeFinancials ? (Number(row.totalValorAprovadas) || null) : null,
    totalValorExportadas: canSeeFinancials ? (Number(row.totalValorExportadas) || null) : null,
    totalValorPagas: canSeeFinancials ? (Number(row.totalValorPagas) || null) : null,
  });
});

// GET /api/dashboard/by-team
router.get("/by-team", requireAuth, async (req, res) => {
  const me = req.currentUser!;
  const canSeeFinancials = me.role === "admin" || me.role === "gestor";

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  if (me.role === "gestor" && me.teamId) {
    conditions.push(`d.team_id = $${p++}`);
    params.push(me.teamId);
  }
  // prestadores don't filter by-team (they see their own across teams)

  const where = conditions.join(" AND ");

  const result = await pool.query<Record<string, unknown>>(
    `SELECT
        t.id AS "teamId", t.name AS "teamName",
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE d.status = 'pendente_aprovacao') AS pendentes,
        COUNT(*) FILTER (WHERE d.status IN ('aprovada','disponivel_exportacao')) AS aprovadas,
        COUNT(*) FILTER (WHERE d.status = 'rejeitada') AS rejeitadas,
        COUNT(*) FILTER (WHERE d.status = 'exportada') AS exportadas,
        COUNT(*) FILTER (WHERE d.status = 'paga') AS pagas,
        SUM(d.value::numeric) AS "totalValor"
      FROM diarias d
      JOIN teams t ON t.id = d.team_id
      WHERE ${where}
      GROUP BY t.id, t.name
      ORDER BY total DESC`,
    params
  );

  res.json(
    result.rows.map((r) => ({
      ...r,
      total: Number(r.total),
      pendentes: Number(r.pendentes),
      aprovadas: Number(r.aprovadas),
      rejeitadas: Number(r.rejeitadas),
      exportadas: Number(r.exportadas),
      pagas: Number(r.pagas),
      totalValor: canSeeFinancials ? (Number(r.totalValor) || null) : null,
    }))
  );
});

// GET /api/dashboard/by-provider
router.get("/by-provider", requireAuth, async (req, res) => {
  const me = req.currentUser!;
  const canSeeFinancials = me.role === "admin" || me.role === "gestor";

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  if (me.role === "gestor" && me.teamId) {
    conditions.push(`d.team_id = $${p++}`);
    params.push(me.teamId);
  } else if (me.role === "prestador") {
    conditions.push(`p.decargo_id = $${p++}`);
    params.push(me.decargoId);
  }

  const where = conditions.join(" AND ");

  const result = await pool.query<Record<string, unknown>>(
    `SELECT
        p.id AS "providerId", p.name AS "providerName", t.name AS "teamName",
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE d.status = 'pendente_aprovacao') AS pendentes,
        COUNT(*) FILTER (WHERE d.status IN ('aprovada','disponivel_exportacao')) AS aprovadas,
        COUNT(*) FILTER (WHERE d.status = 'exportada') AS exportadas,
        COUNT(*) FILTER (WHERE d.status = 'paga') AS pagas,
        SUM(d.value::numeric) AS "totalValor"
      FROM diarias d
      JOIN providers p ON p.id = d.provider_id
      LEFT JOIN teams t ON t.id = d.team_id
      WHERE ${where}
      GROUP BY p.id, p.name, t.name
      ORDER BY total DESC
      LIMIT 20`,
    params
  );

  res.json(
    result.rows.map((r) => ({
      ...r,
      total: Number(r.total),
      pendentes: Number(r.pendentes),
      aprovadas: Number(r.aprovadas),
      exportadas: Number(r.exportadas),
      pagas: Number(r.pagas),
      totalValor: canSeeFinancials ? (Number(r.totalValor) || null) : null,
    }))
  );
});

// GET /api/dashboard/recent-activity
router.get("/recent-activity", requireAuth, async (req, res) => {
  const me = req.currentUser!;

  const conditions: string[] = ["al.entity_type = 'diaria'"];
  const params: unknown[] = [];
  let p = 1;

  if (me.role === "gestor" && me.teamId) {
    conditions.push(`d.team_id = $${p++}`);
    params.push(me.teamId);
  } else if (me.role === "prestador") {
    conditions.push(`p.decargo_id = $${p++}`);
    params.push(me.decargoId);
  }

  const where = conditions.join(" AND ");

  const result = await pool.query<Record<string, unknown>>(
    `SELECT
        al.id, al.entity_id AS "diariaId", p.name AS "providerName", t.name AS "teamName",
        al.action, u.name AS "userName", al.timestamp, d.status
      FROM audit_logs al
      JOIN diarias d ON d.id = al.entity_id
      JOIN providers p ON p.id = d.provider_id
      JOIN teams t ON t.id = d.team_id
      LEFT JOIN users u ON u.id = al.user_id
      WHERE ${where}
      ORDER BY al.timestamp DESC
      LIMIT 20`,
    params
  );

  res.json(result.rows);
});

export default router;
