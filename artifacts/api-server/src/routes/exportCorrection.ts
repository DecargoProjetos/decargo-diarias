import { Router } from "express";
import { pool } from "@workspace/db";
import { requireRole } from "../middlewares/requireAuth";

const router = Router();
const EDITABLE = ["pendente_aprovacao", "solicitacao_correcao", "em_analise", "aprovada", "disponivel_exportacao"];
const integerId = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
const document = (value: unknown) => typeof value === "string"
  && /^[\d./\-\s]+$/.test(value) && value.replace(/\D/g, "").length === 14
  ? value.replace(/\D/g, "") : null;
const externalId = (value: string) => /^[1-9]\d*$/.test(value) && integerId(Number(value));
interface CorrectionRow {
  id: number; providerId: number; providerName: string; providerDecargoId: string;
  cnpj: string | null; typeId: number | null; typeName: string | null; exportTarget: string | null;
  status: string; integrationId: string | null; exportedAt: string | null; exportedBy: number | null;
  workDate: string; paymentDate: string | null; value: string; updatedAt: string;
  approvedAt: string | null; approvedBy: number | null;
}
interface Candidate { id: number; name: string; decargoId: string; cnpj: string | null; eligible: boolean }
interface Correction {
  id: number; expectedProviderId: number; expectedTypeId: number | null;
  expectedUpdatedAt: string; expectedProviderDecargoId: string; expectedPeopleId: string;
  providerId: number; typeId: number; verifiedCnpj?: string;
}
const ROWS_SQL = `
  SELECT d.id, d.provider_id AS "providerId", p.name AS "providerName",
    p.decargo_id AS "providerDecargoId", p.cnpj, d.type_id AS "typeId",
    dt.description AS "typeName", dt.export_target AS "exportTarget",
    d.status, d.integration_id AS "integrationId", d.exported_at::text AS "exportedAt",
    d.exported_by AS "exportedBy", d.work_date::text AS "workDate",
    d.payment_date::text AS "paymentDate", d.value::text AS value,
    d.updated_at::text AS "updatedAt", d.approved_at::text AS "approvedAt", d.approved_by AS "approvedBy"
  FROM diarias d JOIN providers p ON p.id = d.provider_id
  LEFT JOIN diaria_types dt ON dt.id = d.type_id
  WHERE d.id = ANY($1::int[]) ORDER BY d.id`;
const CANDIDATES_SQL = `
  SELECT p.id, p.name, p.decargo_id AS "decargoId", p.cnpj,
    (p.active AND p.synced_at IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM users u WHERE u.active = false AND u.role IN ('prestador', 'funcionario')
        AND (
          (NULLIF(TRIM(p.email), '') IS NOT NULL AND LOWER(TRIM(p.email)) = LOWER(TRIM(u.email)))
          OR p.decargo_id = 'local-user:' || u.id::text
          OR to_jsonb(p)->>'local_reference' = 'local-user:' || u.id::text
          OR (u.decargo_id LIKE 'manual-%' AND to_jsonb(p)->>'local_reference' = u.decargo_id)
        )
    )) AS eligible
  FROM providers p`;
function allowed(row: CorrectionRow) {
  return EDITABLE.includes(row.status) && row.integrationId === null && row.exportedAt === null && row.exportedBy === null;
}

router.post("/correction/preview", requireRole("admin"), async (req, res) => {
  const ids: unknown = req.body?.diariaIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 500
    || !ids.every(integerId) || new Set(ids).size !== ids.length) {
    res.status(400).json({ error: "Selecione de 1 a 500 diárias, sem IDs repetidos." });
    return;
  }
  const [records, providers, types] = await Promise.all([
    pool.query<CorrectionRow>(ROWS_SQL, [ids]),
    pool.query<Candidate>(`${CANDIDATES_SQL} ORDER BY p.name, p.id`),
    pool.query("SELECT id, description AS name FROM diaria_types WHERE active AND export_target = 'diaria_extra' ORDER BY description"),
  ]);
  const byId = new Map(records.rows.map(row => [row.id, row]));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    rows: records.rows.filter(allowed),
    skipped: ids.filter(id => !byId.has(id) || !allowed(byId.get(id)!)).map(id => ({
      id, reason: "Registro não encontrado, exportado/pago, cancelado ou com exportação reservada. Resolva eventuais bloqueios antes de corrigir.",
    })),
    providers: providers.rows.filter(p => p.eligible && externalId(p.decargoId))
      .map(({ eligible: _eligible, ...p }) => p),
    types: types.rows,
  });
});

router.post("/correction", requireRole("admin"), async (req, res) => {
  const input: unknown = req.body?.corrections;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (req.body?.confirmed !== true || reason.length < 10 || reason.length > 1000
    || !Array.isArray(input) || !input.length || input.length > 500
    || !input.every(r => r && integerId(r.id) && integerId(r.expectedProviderId)
      && (r.expectedTypeId === null || integerId(r.expectedTypeId))
      && typeof r.expectedUpdatedAt === "string" && r.expectedUpdatedAt.length > 0 && r.expectedUpdatedAt.length <= 100
      && typeof r.expectedProviderDecargoId === "string" && r.expectedProviderDecargoId.length <= 200
      && typeof r.expectedPeopleId === "string" && externalId(r.expectedPeopleId)
      && integerId(r.providerId) && integerId(r.typeId))
    || new Set(input.map(r => r.id)).size !== input.length) {
    res.status(400).json({ error: "Confirme a conferência, informe o motivo e selecione vínculos e tipos válidos." });
    return;
  }
  const corrections = input as Correction[];
  const ids = corrections.map(r => r.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const current = await client.query<CorrectionRow>(`${ROWS_SQL} FOR UPDATE OF d FOR SHARE OF p`, [ids]);
    const byId = new Map(current.rows.map(r => [r.id, r]));
    if (corrections.some(r => {
      const row = byId.get(r.id);
      return !row || !allowed(row) || row.providerId !== r.expectedProviderId
        || row.typeId !== r.expectedTypeId || row.updatedAt !== r.expectedUpdatedAt
        || row.providerDecargoId !== r.expectedProviderDecargoId;
    })) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "A seleção mudou ou possui exportação bloqueada/em andamento. Atualize a conferência; nenhuma diária foi corrigida." });
      return;
    }
    const candidates = await client.query<Candidate>(
      `${CANDIDATES_SQL} WHERE p.id = ANY($1::int[]) ORDER BY p.id FOR SHARE OF p`,
      [[...new Set(corrections.map(r => r.providerId))]],
    );
    const types = await client.query<{ id: number; exportTarget: string; active: boolean }>(
      `SELECT id, export_target AS "exportTarget", active FROM diaria_types
       WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE`,
      [[...new Set(corrections.map(r => r.typeId))]],
    );
    const providerById = new Map(candidates.rows.map(p => [p.id, p]));
    const typeById = new Map(types.rows.map(t => [t.id, t]));
    if (corrections.some(r => {
      const p = providerById.get(r.providerId);
      const type = typeById.get(r.typeId);
      const hasStoredDocument = !!p?.cnpj?.trim();
      return !p?.eligible || !externalId(p.decargoId) || p.decargoId !== r.expectedPeopleId
        || !type?.active || type.exportTarget !== "diaria_extra"
        || (r.providerId !== r.expectedProviderId
          && (!document(r.verifiedCnpj) || (hasStoredDocument && document(r.verifiedCnpj) !== document(p.cnpj))));
    })) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Escolha um prestador integrado e ativo e um tipo de pagamento. Ao mudar o vínculo, informe o CNPJ conferido no People; se houver documento local, ele deve coincidir." });
      return;
    }
    const changed = corrections.filter(r => r.providerId !== r.expectedProviderId || r.typeId !== r.expectedTypeId);
    if (!changed.length) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Nenhum vínculo ou tipo foi alterado." });
      return;
    }
    const updated = await client.query<{ id: number }>(`
      UPDATE diarias d SET provider_id = replacement.provider_id, type_id = replacement.type_id,
        status = 'pendente_aprovacao', approved_at = NULL, approved_by = NULL, updated_at = NOW()
      FROM jsonb_to_recordset($1::jsonb) AS replacement(id int, provider_id int, type_id int)
      WHERE d.id = replacement.id AND d.integration_id IS NULL
        AND d.exported_at IS NULL AND d.exported_by IS NULL
        AND d.status = ANY($2::diaria_status[])
      RETURNING d.id`,
    [JSON.stringify(changed.map(r => ({ id: r.id, provider_id: r.providerId, type_id: r.typeId }))), EDITABLE]);
    if (updated.rows.length !== changed.length) throw new Error("Correction count mismatch");
    const metadata = await client.query<{ present: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'audit_logs' AND column_name = 'user_name_at_action') AS present`);
    const actor = req.currentUser!;
    const audit = changed.map(r => ({
      id: r.id, old_values: byId.get(r.id),
      new_values: { providerId: r.providerId, providerDecargoId: providerById.get(r.providerId)!.decargoId,
        typeId: r.typeId, exportTarget: "diaria_extra", status: "pendente_aprovacao", reason,
        confirmed: true, verifiedCnpj: r.providerId !== r.expectedProviderId ? document(r.verifiedCnpj) : null,
        documentVerification: r.providerId === r.expectedProviderId ? "not_required_same_payee"
          : providerById.get(r.providerId)!.cnpj?.trim() ? "admin_people_check_matched_local_document"
          : "admin_people_check_without_local_document",
        confirmedByName: actor.name, financialValuesPreserved: true },
    }));
    await client.query(`
      INSERT INTO audit_logs (entity_type, entity_id, action, user_id, timestamp, old_values, new_values
        ${metadata.rows[0]?.present ? ", user_name_at_action" : ""})
      SELECT 'diaria', a.id, 'vinculo_tipo_corrigidos', $2::int, NOW(), a.old_values,
        a.new_values || jsonb_build_object('confirmedByName', $3::text)
        ${metadata.rows[0]?.present ? ", $3::text" : ""}
      FROM jsonb_to_recordset($1::jsonb) AS a(id int, old_values jsonb, new_values jsonb)`,
    [JSON.stringify(audit), actor.id, actor.name]);
    await client.query("COMMIT");
    res.json({ correctedIds: updated.rows.map(r => r.id), unchangedIds: corrections.filter(r => !changed.includes(r)).map(r => r.id) });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    res.status(503).json({ error: "Não foi possível confirmar a correção. Atualize a conferência antes de tentar novamente." });
  } finally {
    client.release();
  }
});

export default router;
