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
  // req.body is `undefined` (not `{}`) when the client sends no body and no
  // `Content-Type: application/json` header — express.json() only populates
  // req.body when that content type matches. The generated sync mutation
  // sends no body at all, so this MUST be optional-chained; reading `.force`
  // off `undefined` throws synchronously here, before the try/catch below,
  // which used to produce an instant, un-logged, generic 500.
  const force = Boolean((req.body as { force?: boolean } | undefined)?.force);
  req.log.info({ force }, "Provider sync started");

  // The whole handler body is wrapped in one try/catch so that ANY failure —
  // reaching the People API, an unexpected response shape, or a DB error
  // while upserting/deactivating — is caught here and answered with a
  // diagnosable message. Without this, an error thrown after the initial
  // fetch (e.g. a DB constraint violation inside the transaction) bubbles
  // past this route entirely: Express 5 auto-forwards rejected async
  // handlers to the global error middleware, which replaces the message
  // with a generic "Internal server error" in production. Sync is
  // admin-only, so it's safe to surface these details — they never contain
  // our own secrets, only the People API's response or Postgres' own error.
  try {
    const remote = await fetchPrestadores();
    // TEMP DEBUG: dump the first couple of raw records so we can confirm the
    // exact field names for "objeto do contrato" / active-status before
    // adding the Motorista/Ajudante/Transporte de Mercadorias filter. Remove
    // once confirmed.
    req.log.info({ sample: remote.slice(0, 3) }, "Provider sync: raw sample from People API");
    // Guard against an unexpected response shape (e.g. the endpoint switching
    // to a paginated `{ data: [...] }` wrapper like /api/funcionarios).
    if (!Array.isArray(remote)) {
      throw new Error(
        `Resposta inesperada da People API (esperava uma lista): ${JSON.stringify(remote).slice(0, 300)}`
      );
    }

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
            active: p.tem_contrato_ativo ?? false,
            syncedAt: now,
          });
          created++;
        } else {
          await tx
            .update(providersTable)
            .set({
              name: p.titular_do_contrato,
              active: p.tem_contrato_ativo ?? false,
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

    res.json({ synced: remote.length, created, updated, deactivated, debugSample: remote.slice(0, 3) });
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
  const { name, email, teamId, active } = req.body as {
    name?: string;
    email?: string | null;
    teamId?: number | null;
    active?: boolean;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (teamId !== undefined) updates.teamId = teamId;
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
