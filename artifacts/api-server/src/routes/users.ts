import { Router } from "express";
import { db, usersTable, teamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router = Router();

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
