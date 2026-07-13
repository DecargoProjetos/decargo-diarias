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

  // The whole handler body is wrapped in one try/catch — not just the initial
  // fetch — so any failure (reaching the People API, or a DB error while
  // upserting) is caught here and answered with a diagnosable message.
  // Express 5 auto-forwards rejected async handlers to the global error
  // middleware, which replaces the message with a generic "Internal server
  // error" in production; this route is admin-only, so it's safe to surface
  // details here instead (never our own secrets, only upstream/DB errors).
  try {
    const remote = await fetchFuncionarios();
    // TEMP DEBUG: confirm whether `todos=false` already filters to active-only
    // server-side, or whether we need to also filter by `ativo` client-side.
    // Remove once confirmed.
    req.log.info(
      { total: remote.length, ativoCounts: remote.reduce((acc: Record<string, number>, f) => {
        const key = String(f.ativo);
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}) },
      "User sync: ativo breakdown from People API"
    );

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
  } catch (err) {
    req.log.error({ err }, "User sync failed");
    res.status(502).json({
      error: `Falha ao sincronizar usuários: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
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
  const { role, teamId, active, name, email } = req.body as {
    role?: string;
    teamId?: number | null;
    active?: boolean;
    name?: string;
    email?: string;
  };

  const VALID_ROLES = ["admin", "gestor", "prestador", "funcionario"];
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `Papel inválido. Use um de: ${VALID_ROLES.join(", ")}` });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (role !== undefined) updates.role = role;
  if (teamId !== undefined) updates.teamId = teamId;
  if (active !== undefined) updates.active = active;
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  await logAudit({
    entityType: "user",
    entityId: id,
    action: "atualizado",
    userId: req.currentUser!.id,
    newValues: updates,
  });

  res.json(updated);
});

// DELETE /api/users/:id (admin only)
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const me = req.currentUser!;

  if (id === me.id) {
    res.status(400).json({ error: "Você não pode excluir a própria conta." });
    return;
  }

  let deleted;
  try {
    [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  } catch (err) {
    // `diarias.created_by` has no ON DELETE rule (RESTRICT by default), so a
    // user who created at least one diária cannot be hard-deleted — surface
    // that as a clear message instead of a generic 500; desativar (active:
    // false) via PATCH is the supported way to retire such an account.
    req.log.error({ err }, "User delete failed");
    res.status(409).json({
      error: "Não é possível excluir: este usuário criou diárias no sistema. Desative o acesso em vez de excluir.",
    });
    return;
  }

  if (!deleted) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  await logAudit({
    entityType: "user",
    entityId: id,
    action: "excluído",
    userId: me.id,
  });

  res.json({ message: "Usuário excluído" });
});

export default router;
