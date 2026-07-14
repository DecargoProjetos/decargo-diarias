import { Router } from "express";
import { db, providersTable, teamsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { fetchPrestadores } from "../lib/peopleClient";

const router = Router();

// GET /api/providers
// By default returns ALL providers (active and inactive) so the admin
// management screen ("Pessoas") can keep showing inactive people instead of
// them disappearing. Pass `activeOnly=true` for operational pickers (e.g.
// the new-diária form) that must only offer active providers.
router.get("/", requireAuth, async (req, res) => {
  const me = req.currentUser!;
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  const activeOnly = req.query.activeOnly === "true";

  let query = db
    .select({
      id: providersTable.id,
      decargoId: providersTable.decargoId,
      name: providersTable.name,
      email: providersTable.email,
      teamId: providersTable.teamId,
      teamName: teamsTable.name,
      dailyRate: providersTable.dailyRate,
      active: providersTable.active,
      syncedAt: providersTable.syncedAt,
    })
    .from(providersTable)
    .leftJoin(teamsTable, eq(providersTable.teamId, teamsTable.id))
    .$dynamic();

  // Gestores only see their own team's providers
  const effectiveTeamId = me.role === "gestor" ? (me.teamId ?? -1) : teamId;

  const conditions = [];
  if (effectiveTeamId !== undefined) conditions.push(eq(providersTable.teamId, effectiveTeamId));
  if (activeOnly) conditions.push(eq(providersTable.active, true));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const providers = await query.orderBy(providersTable.name);
  res.json(providers);
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
    const remote = await fetchPrestadores();
    // Guard against an unexpected response shape (e.g. the endpoint switching
    // to a paginated `{ data: [...] }` wrapper like /api/funcionarios).
    if (!Array.isArray(remote)) {
      throw new Error(
        `Resposta inesperada da People API (esperava uma lista): ${JSON.stringify(remote).slice(0, 300)}`
      );
    }

    let created = 0;
    let skipped = 0;

    // Sync is additive-only: an existing local row (matched by decargoId) is
    // left completely untouched — no name/active updates. This guarantees
    // (a) nothing is duplicated, (b) a manual deactivation in the app is
    // never resurrected by a later sync just because the contract is still
    // active in DECARGO People, and (c) sync does no unnecessary writes for
    // providers already on file.
    for (const p of remote) {
      const decargoId = String(p.id_prestador);

      const [existing] = await db
        .select({ id: providersTable.id })
        .from(providersTable)
        .where(eq(providersTable.decargoId, decargoId))
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(providersTable).values({
        decargoId,
        name: p.titular_do_contrato,
        active: p.tem_contrato_ativo ?? false,
        syncedAt: now,
      });
      created++;
    }

    req.log.info({ created, skipped }, "Provider sync complete");

    await logAudit({
      entityType: "provider",
      entityId: 0,
      action: "sync",
      userId: req.currentUser!.id,
      newValues: { synced: remote.length, created, skipped, timestamp: now },
    });

    res.json({ synced: remote.length, created, skipped });
  } catch (err) {
    req.log.error({ err }, "Provider sync failed");
    res.status(502).json({
      error: `Falha ao sincronizar prestadores: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// PATCH /api/providers/:id (admin only)
router.patch("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, teamId, dailyRate, active } = req.body as {
    name?: string;
    email?: string | null;
    teamId?: number | null;
    dailyRate?: number | null;
    active?: boolean;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (teamId !== undefined) updates.teamId = teamId;
  if (dailyRate !== undefined) updates.dailyRate = dailyRate === null ? null : String(dailyRate);
  if (active !== undefined) updates.active = active;

  const [updated] = await db
    .update(providersTable)
    .set(updates)
    .where(eq(providersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Prestador não encontrado" });
    return;
  }

  await logAudit({
    entityType: "provider",
    entityId: id,
    action: "atualizado",
    userId: req.currentUser!.id,
    newValues: updates,
  });

  res.json(updated);
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
    userId: req.currentUser!.id,
  });

  res.json({ message: "Prestador excluído" });
});

// GET /api/providers/:id
router.get("/:id", requireAuth, async (req, res) => {
  const me = req.currentUser!;
  const id = Number(req.params.id);

  const [provider] = await db
    .select({
      id: providersTable.id,
      decargoId: providersTable.decargoId,
      name: providersTable.name,
      email: providersTable.email,
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

  // Gestores can only see their team's providers
  if (
    me.role === "gestor" &&
    provider.teamId !== me.teamId
  ) {
    res.status(403).json({ error: "Acesso não autorizado" });
    return;
  }

  res.json(provider);
});

export default router;
