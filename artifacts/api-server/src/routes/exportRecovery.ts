import { Router } from "express";
import { pool } from "@workspace/db";
import { requireRole } from "../middlewares/requireAuth";

import exportCorrectionRouter from "./exportCorrection";

const router = Router();
router.use(exportCorrectionRouter);
const MAX_SELECTION = 2000;

interface ReservationRow {
  id: number;
  status: string;
  integrationId: string | null;
  exportedAt: string | null;
  exportedBy: number | null;
  awaitingConfirmation: boolean;
}

const RESERVATIONS_SQL = `
  SELECT d.id, d.status, d.integration_id AS "integrationId",
         d.exported_at AS "exportedAt", d.exported_by AS "exportedBy",
         EXISTS (
           SELECT 1 FROM audit_logs a
           WHERE a.entity_type = 'diaria' AND a.entity_id = d.id
             AND a.action = 'exportacao_aguardando_conferencia'
             AND a.new_values->>'integrationId' = d.integration_id
         ) AS "awaitingConfirmation"
  FROM diarias d WHERE d.id = ANY($1::int[]) ORDER BY d.id`;

function validIds(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_SELECTION
    && value.every((id) => Number.isSafeInteger(id) && id > 0)
    && new Set(value).size === value.length;
}

function rejection(row?: ReservationRow): string | null {
  if (!row) return "Diária não encontrada.";
  if (row.status !== "disponivel_exportacao" || row.exportedAt || row.exportedBy) {
    return "Registro fora do estado disponível para exportação, ou já integrado.";
  }
  if (!row.integrationId) return "Esta diária não possui bloqueio de exportação.";
  if (!row.awaitingConfirmation) {
    return "Não há registro de falha para este bloqueio; a exportação pode estar em andamento.";
  }
  return null;
}

router.post("/recovery/preview", requireRole("admin"), async (req, res) => {
  const ids: unknown = req.body?.diariaIds;
  if (!validIds(ids)) {
    res.status(400).json({ error: "Selecione de 1 a 2000 diárias, sem IDs repetidos." });
    return;
  }
  const result = await pool.query<ReservationRow>(RESERVATIONS_SQL, [ids]);
  const rows = new Map(result.rows.map((row) => [row.id, row]));
  const eligible: { id: number; integrationId: string }[] = [];
  const skipped: { id: number; reason: string }[] = [];
  for (const id of ids) {
    const row = rows.get(id);
    const reason = rejection(row);
    if (reason) skipped.push({ id, reason });
    else eligible.push({ id, integrationId: row!.integrationId! });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ eligible, skipped });
});

router.post("/recovery", requireRole("admin"), async (req, res) => {
  const reservations: unknown = req.body?.reservations;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (req.body?.confirmedNotExported !== true || reason.length < 10 || reason.length > 1000
    || !Array.isArray(reservations) || !validIds(reservations.map((r) => r?.id))
    || !reservations.every((r) => typeof r?.integrationId === "string"
      && r.integrationId.length > 0 && r.integrationId.length <= 100)) {
    res.status(400).json({ error: "Confirme a conferência no People, informe o motivo (10 a 1000 caracteres) e os bloqueios a liberar." });
    return;
  }
  const expected = reservations as { id: number; integrationId: string }[];
  const ids = expected.map((row) => row.id);
  const references = expected.map((row) => row.integrationId);
  const me = req.currentUser!;
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    // Lock in deterministic order. Never clear a newer reservation using a stale preview.
    const result = await client.query<ReservationRow>(`${RESERVATIONS_SQL} FOR UPDATE OF d`, [ids]);
    const byId = new Map(result.rows.map((row) => [row.id, row]));
    if (expected.some((item) => rejection(byId.get(item.id))
      || byId.get(item.id)?.integrationId !== item.integrationId)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Os registros ou bloqueios mudaram. Atualize a conferência; nenhum bloqueio foi liberado." });
      return;
    }
    const released = await client.query<{ id: number }>(`
      UPDATE diarias d SET integration_id = NULL, updated_at = NOW()
      FROM UNNEST($1::int[], $2::text[]) AS expected(id, reference)
      WHERE d.id = expected.id AND d.integration_id = expected.reference
        AND d.status = 'disponivel_exportacao'
        AND d.exported_at IS NULL AND d.exported_by IS NULL
      RETURNING d.id`, [ids, references]);
    if (released.rows.length !== ids.length) throw new Error("Recovery update conflict");

    // Preserve compatibility with published schemas predating historical actor names.
    // The signed actor name is retained in the audit JSON in either schema.
    const schema = await client.query<{ present: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'audit_logs'
          AND column_name = 'user_name_at_action'
      ) AS present`);
    const hasActorName = schema.rows[0]?.present === true;
    await client.query(`
      INSERT INTO audit_logs (
        entity_type, entity_id, action, user_id, timestamp, old_values, new_values
        ${hasActorName ? ", user_name_at_action" : ""}
      )
      SELECT 'diaria', expected.id, 'exportacao_liberada_apos_conferencia', $3::int, NOW(),
        jsonb_build_object('status', 'disponivel_exportacao', 'integrationId', expected.reference),
        jsonb_build_object('status', 'disponivel_exportacao', 'integrationId', NULL,
          'previousIntegrationId', expected.reference, 'reason', $4::text,
          'confirmedNotExported', true, 'confirmedByName', $5::text)
        ${hasActorName ? ", $5::text" : ""}
      FROM UNNEST($1::int[], $2::text[]) AS expected(id, reference)`,
    [ids, references, me.id, reason, me.name]);
    await client.query("COMMIT");
    committed = true;
    res.json({ released: released.rows.length, releasedIds: released.rows.map((row) => row.id) });
  } catch {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
    res.status(503).json({ error: "Não foi possível confirmar a liberação. Atualize a lista e confira os bloqueios antes de tentar novamente." });
  } finally {
    client.release();
  }
});

export default router;
