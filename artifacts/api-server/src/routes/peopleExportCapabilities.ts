import { Router } from "express";
import { requireRole } from "../middlewares/requireAuth";
import { getPeopleExportCapabilities } from "../lib/peopleClient";
import { pool } from "@workspace/db";
import { ReviewPeopleExportBatchBody } from "@workspace/api-zod";

const router = Router();

// Read local record/type metadata only; never query people upstream or touch
// reservations. The export POST remains authoritative, including its preflight.
router.post("/review", requireRole("admin"), async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const parsed = ReviewPeopleExportBatchBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.diariaIds.every(Number.isSafeInteger)) {
    res.status(400).json({ error: "Seleção inválida. Informe os IDs das diárias a revisar." });
    return;
  }
  const ids = [...new Set(parsed.data.diariaIds)];
  try {
    const rows = await pool.query<{
      id: number; providerName: string; workDate: string;
      typeName: string | null; exportTarget: string | null;
    }>(
      `SELECT d.id, p.name AS "providerName", d.work_date::text AS "workDate",
              dt.description AS "typeName", dt.export_target AS "exportTarget"
       FROM diarias d
       JOIN providers p ON p.id = d.provider_id
       LEFT JOIN diaria_types dt ON dt.id = d.type_id
       WHERE d.id = ANY($1::int[]) ORDER BY d.id`,
      [ids],
    );
    const supportedTargets = await getPeopleExportCapabilities();
    const foundIds = new Set(rows.rows.map(row => row.id));
    const incompatibleRecords = rows.rows.flatMap(row => {
      const requiredTarget = row.exportTarget === "diaria_extra" ? "diarias"
        : row.exportTarget === "falta" ? "descontos" : null;
      if (requiredTarget && supportedTargets.includes(requiredTarget)) return [];
      return [{
        id: row.id, providerName: row.providerName, workDate: row.workDate,
        typeName: row.typeName, requiredTarget,
        reason: requiredTarget ? "unsupported_target" : "unconfigured_type",
      }];
    });
    res.json({
      supportedTargets, reviewedCount: ids.length, incompatibleRecords,
      missingIds: ids.filter(id => !foundIds.has(id)),
    });
  } catch {
    res.status(503).json({
      error: "Não foi possível revisar o lote no DECARGO People. Tente novamente.",
    });
  }
});

// No financial writes, reservation recovery or personal-data queries.
router.get("/capabilities", requireRole("admin"), async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json({ supportedTargets: await getPeopleExportCapabilities() });
  } catch {
    // Never pass upstream errors, URLs or integration credentials to the browser.
    res.status(503).json({
      error: "Não foi possível consultar os destinos do DECARGO People. Verifique o acesso e tente novamente.",
    });
  }
});

export default router;
