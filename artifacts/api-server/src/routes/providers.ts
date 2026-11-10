import { Router } from "express";
import { db, providersTable, teamsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { fetchPrestadores } from "../lib/peopleClient";
import { getPeopleSyncAccess, peopleUserSyncEnabled, PeopleUserSyncError } from "../lib/peopleUserSync";
import { getGestorTeamIds } from "../lib/gestorTeams";
import { redactProviderDailyRates } from "../lib/diariaPermissions";
import providerReconciliationRouter from "./providerReconciliation";
import { needsProviderReview, remoteProviderId } from "../lib/providerReconciliation";
import { UpdateProviderBody } from "@workspace/api-zod";
import { updatePerson, PersonUpdateError } from "../lib/updatePerson";
import { providerAccessActiveSql } from "../lib/providerIdentity";

const router = Router();
router.use("/reconciliation", providerReconciliationRouter);

// GET /api/providers
// By default returns ALL providers (active and inactive) so the admin
// management screen ("Pessoas") can keep showing inactive people instead of
// them disappearing. Pass `activeOnly=true` for operational pickers (e.g.
// the new-diária form) that must only offer active providers.
router.get("/", requireAuth, async (req, res) => {
  // This response carries role-dependent fields (dailyRate is stripped for
  // gestor) — it must never be cached by the browser/CDN, or a gestor could
  // keep seeing a previously admin-fetched response with the real value.
  res.set("Cache-Control", "no-store");
  const me = req.currentUser!;
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  const activeOnly = req.query.activeOnly === "true";

  let query = db
    .select({
      id: providersTable.id,
      decargoId: providersTable.decargoId,
      localReference: providersTable.localReference,
      name: providersTable.name,
      email: providersTable.email,
      cnpj: providersTable.cnpj,
      teamId: providersTable.teamId,
      teamName: teamsTable.name,
      dailyRate: providersTable.dailyRate,
      active: providersTable.active,
      syncedAt: providersTable.syncedAt,
      updatedAt: providersTable.updatedAt,
    })
    .from(providersTable)
    .leftJoin(teamsTable, eq(providersTable.teamId, teamsTable.id))
    .$dynamic();

  // Gestores only see providers from their managed teams (teams.manager_id = me.id).
  // Using an array of teamIds supports gestores responsible for multiple teams.
  const conditions = [];
  if (me.role === "gestor") {
    const teamIds = await getGestorTeamIds(me.id);
    if (teamIds.length === 0) {
      // No teams assigned → return nothing (safer than unconstrained listing).
      res.json([]);
      return;
    }
    conditions.push(inArray(providersTable.teamId, teamIds));
  } else if (teamId !== undefined) {
    conditions.push(eq(providersTable.teamId, teamId));
  }
  if (activeOnly) {
    conditions.push(eq(providersTable.active, true));
    conditions.push(sql.raw(providerAccessActiveSql('"providers"."id"')));
  }
  if (conditions.length > 0) query = query.where(and(...conditions));

  const providers = await query.orderBy(providersTable.name);

  // Financial rates are admin-only. This also protects prestador and
  // funcionario responses if they call the endpoint directly.
  const data = redactProviderDailyRates(me.role, providers);

  res.json(data);
});

// POST /api/providers/sync (admin)
router.post("/sync", requireRole("admin"), async (req, res) => {
  const now = new Date();
  req.log.info("Provider sync started");

  // The whole handler body is wrapped in one try/catch so that ANY failure —
  // reaching the People API, an unexpected response shape, or a DB error
  // while inserting — is caught here and answered with a diagnosable
  // message. Without this, an error thrown after the initial fetch bubbles
  // past this route entirely: Express 5 auto-forwards rejected async
  // handlers to the global error middleware, which replaces the message
  // with a generic "Internal server error" in production. Sync is
  // admin-only, so it's safe to surface these details — they never contain
  // our own secrets, only the People API's response or Postgres' own error.
  try {
    const access = peopleUserSyncEnabled() ? await getPeopleSyncAccess(req) : undefined;
    const remote = await fetchPrestadores(access);
    // Guard against an unexpected response shape (e.g. the endpoint switching
    // to a paginated `{ data: [...] }` wrapper like /api/funcionarios).
    if (!Array.isArray(remote)) {
      throw new Error(
        `Resposta inesperada da People API (esperava uma lista): ${JSON.stringify(remote).slice(0, 300)}`
      );
    }

    const { created, skipped, pending } = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(724091513)`);
      const providers = await tx.select().from(providersTable);
      let created = 0, skipped = 0, pending = 0;
      for (const p of remote) {
        const decargoId = remoteProviderId(p);
        if (decargoId && providers.some(existing => existing.decargoId === decargoId)) {
          skipped++;
          continue;
        }
        if (!decargoId || needsProviderReview(p, providers, remote)) {
          pending++;
          continue;
        }
        const [inserted] = await tx.insert(providersTable).values({
          decargoId, name: p.titular_do_contrato, cnpj: p.cnpj ?? null,
          active: p.tem_contrato_ativo ?? false, syncedAt: now,
        }).returning();
        providers.push(inserted);
        created++;
      }
      return { created, skipped, pending };
    });

    req.log.info({ created, skipped }, "Provider sync complete");

    await logAudit({
      entityType: "provider",
      entityId: 0,
      action: "sync",
      actor: req.currentUser!,
      newValues: { synced: remote.length, created, skipped, pending, timestamp: now },
    });

    res.json({ synced: remote.length, created, skipped, pending });
  } catch (err) {
    if (err instanceof PeopleUserSyncError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    req.log.error({ err }, "Provider sync failed");
    res.status(502).json({
      error: `Falha ao sincronizar prestadores: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// PATCH /api/providers/:id (admin only)
router.patch("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateProviderBody.strict().safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !parsed.success ||
      (parsed.data.name !== undefined && !parsed.data.name.trim()) ||
      (parsed.data.teamId != null && !Number.isSafeInteger(parsed.data.teamId)) ||
      (parsed.data.dailyRate != null && Math.abs(parsed.data.dailyRate * 100 - Math.round(parsed.data.dailyRate * 100)) > 0.000001)) {
    res.status(400).json({ error: "Informe dados válidos e valor com até duas casas decimais." });
    return;
  }
  try {
    res.json(await updatePerson("provider", id, parsed.data, req.currentUser!));
  } catch (err) {
    if (!(err instanceof PersonUpdateError)) throw err;
    res.status(err.status).json({ error: err.message, code: err.code });
  }
});

// DELETE /api/providers/:id (admin only)
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);

  let deleted;
  try {
    [deleted] = await db.delete(providersTable).where(eq(providersTable.id, id)).returning();
  } catch (err) {
    // A provider with diárias linked to it cannot be hard-deleted (diarias.
    // provider_id has no ON DELETE rule). Deactivate instead in that case.
    req.log.error({ err }, "Provider delete failed");
    res.status(409).json({
      error: "Não é possível excluir: este prestador possui diárias no sistema. Desative em vez de excluir.",
    });
    return;
  }

  if (!deleted) {
    res.status(404).json({ error: "Prestador não encontrado" });
    return;
  }

  await logAudit({
    entityType: "provider",
    entityId: id,
    action: "excluído",
    actor: req.currentUser!,
  });

  res.json({ message: "Prestador excluído" });
});

// GET /api/providers/:id
router.get("/:id", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const me = req.currentUser!;
  const id = Number(req.params.id);

  const [provider] = await db
    .select({
      id: providersTable.id,
      decargoId: providersTable.decargoId,
      localReference: providersTable.localReference,
      name: providersTable.name,
      email: providersTable.email,
      cnpj: providersTable.cnpj,
      teamId: providersTable.teamId,
      teamName: teamsTable.name,
      dailyRate: providersTable.dailyRate,
      active: providersTable.active,
      syncedAt: providersTable.syncedAt,
    })
    .from(providersTable)
    .leftJoin(teamsTable, eq(providersTable.teamId, teamsTable.id))
    .where(eq(providersTable.id, id))
    .limit(1);

  if (!provider) {
    res.status(404).json({ error: "Prestador não encontrado" });
    return;
  }

  // Gestores can only see providers from their managed teams.
  if (me.role === "gestor") {
    const teamIds = await getGestorTeamIds(me.id);
    if (!teamIds.includes(provider.teamId!)) {
      res.status(403).json({ error: "Acesso não autorizado" });
      return;
    }
  }

  res.json(redactProviderDailyRates(me.role, [provider])[0]);
});

export default router;
