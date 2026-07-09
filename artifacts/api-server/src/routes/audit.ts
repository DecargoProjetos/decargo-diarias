import { Router } from "express";
import { pool } from "@workspace/db";
import { requireRole } from "../middlewares/requireAuth";

const router = Router();

// GET /api/audit (admin only)
router.get("/", requireRole("admin"), async (req, res) => {
  const {
    entityType, entityId, userId,
    startDate, endDate,
    page = "1", pageSize = "50",
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, Number(page));
  const pageSz = Math.min(200, Math.max(1, Number(pageSize)));
  const offset = (pageNum - 1) * pageSz;

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  if (entityType) { conditions.push(`al.entity_type = $${p++}`); params.push(entityType); }
  if (entityId) { conditions.push(`al.entity_id = $${p++}`); params.push(Number(entityId)); }
  if (userId) { conditions.push(`al.user_id = $${p++}`); params.push(Number(userId)); }
  if (startDate) { conditions.push(`al.timestamp >= $${p++}`); params.push(startDate); }
  if (endDate) { conditions.push(`al.timestamp <= $${p++}`); params.push(endDate + "T23:59:59"); }

  const where = conditions.join(" AND ");

  const [countResult, rows] = await Promise.all([
    pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM audit_logs al WHERE ${where}`, params),
    pool.query<Record<string, unknown>>(
      `SELECT al.id, al.entity_type AS "entityType", al.entity_id AS "entityId",
              al.action, al.user_id AS "userId", u.name AS "userName",
              al.timestamp, al.old_values AS "oldValues", al.new_values AS "newValues"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where}
       ORDER BY al.timestamp DESC
       LIMIT ${pageSz} OFFSET ${offset}`,
      params
    ),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);

  res.json({
    data: rows.rows,
    total,
    page: pageNum,
    pageSize: pageSz,
    totalPages: Math.ceil(total / pageSz),
  });
});

export default router;
