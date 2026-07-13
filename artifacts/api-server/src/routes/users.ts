import { Router } from "express";
import { db, usersTable, teamsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { fetchFuncionarios } from "../lib/peopleClient";

const router = Router();

// POST /api/users/sync (admin only)
// Fetches all active funcionários from DECARGO People and upserts them into
// the local users table.  Only name and email are updated for existing rows —
// role and teamId remain under admin control.  New users receive the default
// "prestador" role (least-privilege); admins promote them as needed.
router.post("/sync", requireRole("admin"), async (req, res) => {
  const now = new Date();
  req.log.info("User sync started");

  let remote;
  try {
    remote = await fetchFuncionarios();
  } catch (err) {
    req.log.error({ err }, "User sync failed to reach DECARGO People");
    // Sync is admin-only, so it's safe to surface the upstream error detail
    // here — it's what an admin needs to fix credentials/connectivity, and
    // it never contains our own secrets (only the People API's own response).
    res.status(502).json({
      error: `Falha ao contatar DECARGO People: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const f of remote) {
    const decargoId = String(f.id_funcionario);
    const email = f.email_principal?.toLowerCase() ?? null;
    const name = f.nome;

    // Primary lookup by decargoId (id_funcionario), then by email so that users
    // who have already logged in via handoff (decargoId = id_usuario) are not
    // duplicated.
    let [existing] = await db
      .select({ id: usersTable.id, decargoId: usersTable.decargoId, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.decargoId, decargoId))
      .limit(1);

    if (!existing && email) {
      [existing] = await db
        .select({ id: usersTable.id, decargoId: usersTable.decargoId, name: usersTable.name, email: usersTable.email })
        .from(usersTable)
        .where(sql`lower(${usersTable.email}) = ${email}`)
        .limit(1);
    }

    if (!existing) {
      if (!email) {
        // Cannot provision without an email — skip
        skipped++;
        continue;
      }
      await db.insert(usersTable).values({
        decargoId,
        name,
        email,
        role: "prestador",
        active: true,
      });
      created++;
    } else {
      // Update name and email only; preserve role, teamId, and active flag
      await db
        .update(usersTable)
        .set({ name, ...(email ? { email } : {}), updatedAt: now })
        .where(eq(usersTable.id, existing.id));
      updated++;
    }
  }

  req.log.info({ created, updated, skipped }, "User sync complete");

  await logAudit({
    entityType: "user",
    entityId: 0,
    action: "sync",
    userId: req.currentUser!.id,
    newValues: { synced: remote.length, created, updated, skipped, timestamp: now },
  });

  res.json({ synced: remote.length, created, updated, skipped });
});

// GET /api/users (admin only)
router.get("/", requireRole("admin"), async (req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      decargoId: usersTable.decargoId,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      teamId: usersTable.teamId,
      teamName: teamsTable.name,
      avatarUrl: usersTable.avatarUrl,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(teamsTable, eq(usersTable.teamId, teamsTable.id))
    .orderBy(usersTable.name);
  res.json(users);
});

// GET /api/users/:id
router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const me = req.currentUser!;

  // Non-admins can only see themselves
  if (me.role !== "admin" && me.id !== id) {
    res.status(403).json({ error: "Acesso não autorizado" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      decargoId: usersTable.decargoId,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      teamId: usersTable.teamId,
      teamName: teamsTable.name,
      avatarUrl: usersTable.avatarUrl,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(teamsTable, eq(usersTable.teamId, teamsTable.id))
    .where(eq(usersTable.id, id))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  res.json(user);
});

// PATCH /api/users/:id (admin only)
router.patch("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { role, teamId, active } = req.body as {
    role?: string;
    teamId?: number | null;
    active?: boolean;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (role !== undefined) updates.role = role;
  if (teamId !== undefined) updates.teamId = teamId;
  if (active !== undefined) updates.active = active;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  res.json(updated);
});

export default router;
