import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /api/reports/diarias
router.get("/diarias", requireAuth, async (req, res) => {
  const me = req.currentUser!;
  const canSeeFinancials = me.role === "admin" || me.role === "gestor";

  const {
    status, providerId, teamId, managerId, startDate, endDate,
  } = req.query as Record<string, string>;

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  if (me.role === "gestor") {
    conditions.push(`d.team_id = $${p++}`);
    params.push(me.teamId);
  } else if (me.role !== "admin") {
    // Prestadores/funcionários only see their own provider's data
    // (funcionários have none, so this yields empty results — expected).
    conditions.push(`p.decargo_id = ${p++}`);
    params.push(me.decargoId);
  }

  if (status) { conditions.push(`d.status = $${p++}`); params.push(status); }
  if (providerId) { conditions.push(`d.provider_id = $${p++}`); params.push(Number(providerId)); }
  if (teamId && me.role === "admin") { conditions.push(`d.team_id = $${p++}`); params.push(Number(teamId)); }
  if (managerId) { conditions.push(`d.manager_id = $${p++}`); params.push(Number(managerId)); }
  if (startDate) { conditions.push(`d.work_date >= $${p++}`); params.push(startDate); }
  if (endDate) { conditions.push(`d.work_date <= $${p++}`); params.push(endDate); }

  const where = conditions.join(" AND ");

  const [dataRows, statsRows, teamRows] = await Promise.all([
    pool.query<Record<string, unknown>>(
      `SELECT d.id, d.provider_id AS "providerId", p.name AS "providerName",
              d.team_id AS "teamId", t.name AS "teamName",
              d.work_date AS "workDate", d.value, d.status,
              d.payment_date AS "paymentDate", d.created_at AS "createdAt",
              cu.name AS "createdByName", d.approved_at AS "approvedAt",
              d.exported_at AS "exportedAt", d.paid_at AS "paidAt"
       FROM diarias d
       JOIN providers p ON p.id = d.provider_id
       JOIN teams t ON t.id = d.team_id
       JOIN users cu ON cu.id = d.created_by
       WHERE ${where}
       ORDER BY d.work_date DESC`,
      params
    ),
    pool.query<Record<string, unknown>>(
      `SELECT d.status, COUNT(*) AS cnt, SUM(d.value::numeric) AS "totalValor"
       FROM diarias d
       JOIN providers p ON p.id = d.provider_id
       WHERE ${where}
       GROUP BY d.status`,
      params
    ),
    pool.query<Record<string, unknown>>(
      `SELECT t.id AS "teamId", t.name AS "teamName",
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE d.status = 'pendente_aprovacao') AS pendentes,
              COUNT(*) FILTER (WHERE d.status IN ('aprovada','disponivel_exportacao')) AS aprovadas,
              COUNT(*) FILTER (WHERE d.status = 'rejeitada') AS rejeitadas,
              COUNT(*) FILTER (WHERE d.status = 'exportada') AS exportadas,
              COUNT(*) FILTER (WHERE d.status = 'paga') AS pagas,
              SUM(d.value::numeric) AS "totalValor"
       FROM diarias d
       JOIN providers p ON p.id = d.provider_id
       JOIN teams t ON t.id = d.team_id
       WHERE ${where}
       GROUP BY t.id, t.name`,
      params
    ),
  ]);

  const data = dataRows.rows.map((r) => ({
    ...r,
    value: canSeeFinancials ? r.value : null,
  }));

  const byStatus: Record<string, number> = {};
  let totalValor = 0;
  for (const r of statsRows.rows) {
    byStatus[String(r.status)] = Number(r.cnt);
    totalValor += Number(r.totalValor ?? 0);
  }

  const byTeam = teamRows.rows.map((r) => ({
    teamId: Number(r.teamId),
    teamName: String(r.teamName),
    total: Number(r.total),
    pendentes: Number(r.pendentes),
    aprovadas: Number(r.aprovadas),
    rejeitadas: Number(r.rejeitadas),
    exportadas: Number(r.exportadas),
    pagas: Number(r.pagas),
    totalValor: canSeeFinancials ? (Number(r.totalValor) || null) : null,
  }));

  res.json({
    data,
    totalRecords: data.length,
    totalValor: canSeeFinancials ? totalValor : null,
    byStatus,
    byTeam,
  });
});

export default router;
