import { Router } from "express";
import { db, providersTable, teamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
router.post("/sync", requireRole("admin"), async (req, res) => {
  const now = new Date();
  req.log.info("Provider sync started");

  const remote = await fetchPrestadores();

  let created = 0;
  let updated = 0;
  let deactivated = 0;

  // Upsert each remote provider
  for (const p of remote) {
    const decargoId = String(p.id_prestador);

    const [existing] = await db
      .select({ id: providersTable.id, name: providersTable.name, active: providersTable.active })
      .from(providersTable)
      .where(eq(providersTable.decargoId, decargoId))
      .limit(1);

    if (!existing) {
      await db.insert(providersTable).values({
        decargoId,
        name: p.titular_do_contrato,
        active: p.tem_contrato_ativo,
        syncedAt: now,
      });
      created++;
    } else {
      await db
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
  const allLocal = await db
    .select({ id: providersTable.id, decargoId: providersTable.decargoId, active: providersTable.active })
    .from(providersTable);

  for (const local of allLocal) {
    if (!remoteIds.has(local.decargoId) && local.active) {
      await db
        .update(providersTable)
        .set({ active: false, syncedAt: now, updatedAt: now })
        .where(eq(providersTable.id, local.id));
      deactivated++;
    }
  }

  req.log.info({ created, updated, deactivated }, "Provider sync complete");

  await logAudit({
    entityType: "provider",
    entityId: 0,
    action: "sync",
    userId: req.currentUser!.id,
    newValues: { synced: remote.length, created, updated, deactivated, timestamp: now },
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
