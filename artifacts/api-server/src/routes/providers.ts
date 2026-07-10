import { Router } from "express";
import { db, providersTable, teamsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { fetchPrestadores } from "../lib/peopleClient";

const router = Router();

// GET /api/providers
router.get("/", requireAuth, async (req, res) => {
  const me = req.currentUser!;
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;

  let query = db
    .select({
      id: providersTable.id,
      decargoId: providersTable.decargoId,
      name: providersTable.name,
      email: providersTable.email,
      teamId: providersTable.teamId,
      teamName: teamsTable.name,
      active: providersTable.active,
      syncedAt: providersTable.syncedAt,
    })
    .from(providersTable)
    .leftJoin(teamsTable, eq(providersTable.teamId, teamsTable.id))
    .$dynamic();

  // Gestores only see their own team's providers
  const effectiveTeamId = me.role === "gestor" ? (me.teamId ?? -1) : teamId;

  if (effectiveTeamId !== undefined) {
    query = query.where(eq(providersTable.teamId, effectiveTeamId));
  } else {
    query = query.where(eq(providersTable.active, true));
  }

  const providers = await query.orderBy(providersTable.name);
  res.json(providers);
});

// POST /api/providers/sync (admin)
// Body: { force?: boolean }  — pass force=true to allow deactivation when the
// remote list drops unexpectedly (empty response or >50 % shrink).
router.post("/sync", requireRole("admin"), async (req, res) => {
  const now = new Date();
  const force = Boolean((req.body as { force?: boolean }).force);
  req.log.info({ force }, "Provider sync started");

  const remote = await fetchPrestadores();

  // Safety circuit: refuse deactivation if the remote list looks suspicious.
  // An empty result almost always means an auth issue or upstream outage,
  // not a real "everyone was removed" event.
  if (remote.length === 0 && !force) {
    req.log.warn("Provider sync aborted: remote returned 0 providers. Pass force=true to override.");
    res.status(422).json({
      error: "Remote returned 0 providers — possible upstream outage. Pass force=true to override.",
    });
    return;
  }

  // Check for suspicious shrinkage (> 50% drop in active count).
  const [{ activeCount }] = await db
    .select({ activeCount: count() })
    .from(providersTable)
    .where(eq(providersTable.active, true));

  const activeLocal = Number(activeCount ?? 0);
  if (activeLocal > 0 && remote.length < activeLocal * 0.5 && !force) {
    req.log.warn(
      { remoteCount: remote.length, localActive: activeLocal },
      "Provider sync aborted: remote count dropped by >50%. Pass force=true to override."
    );
    res.status(422).json({
      error: `Remote returned ${remote.length} providers but ${activeLocal} are active locally — suspicious drop. Pass force=true to override.`,
    });
    return;
  }

  // Run upserts + deactivations in a single transaction so a mid-run failure
  // leaves no partial state.
  const { created, updated, deactivated } = await db.transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    let deactivated = 0;

    // Upsert each remote provider
    for (const p of remote) {
      const decargoId = String(p.id_prestador);

      const [existing] = await tx
        .select({ id: providersTable.id })
        .from(providersTable)
        .where(eq(providersTable.decargoId, decargoId))
        .limit(1);

      if (!existing) {
        await tx.insert(providersTable).values({
          decargoId,
          name: p.titular_do_contrato,
          active: p.tem_contrato_ativo,
          syncedAt: now,
        });
        created++;
      } else {
        await tx
          .update(providersTable)
          .set({
            name: p.titular_do_contrato,
            active: p.tem_contrato_ativo,
            syncedAt: now,
            updatedAt: now,
          })
          .where(eq(providersTable.id, existing.id));
        updated++;
      }
    }

    // Deactivate providers no longer returned by People
    const remoteIds = new Set(remote.map((p) => String(p.id_prestador)));
    const allLocal = await tx
      .select({ id: providersTable.id, decargoId: providersTable.decargoId, active: providersTable.active })
      .from(providersTable);

    for (const local of allLocal) {
      if (!remoteIds.has(local.decargoId) && local.active) {
        await tx
          .update(providersTable)
          .set({ active: false, syncedAt: now, updatedAt: now })
          .where(eq(providersTable.id, local.id));
        deactivated++;
      }
    }

    return { created, updated, deactivated };
  });

  req.log.info({ created, updated, deactivated }, "Provider sync complete");

  await logAudit({
    entityType: "provider",
    entityId: 0,
    action: "sync",
    userId: req.currentUser!.id,
    newValues: { synced: remote.length, created, updated, deactivated, force, timestamp: now },
  });

  res.json({ synced: remote.length, created, updated, deactivated });
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
