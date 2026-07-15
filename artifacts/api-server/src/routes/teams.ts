import { Router } from "express";
import { db, teamsTable, usersTable, providersTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";

const router = Router();

async function getTeamWithMeta(id: number) {
  const [team] = await db
    .select({
      id: teamsTable.id,
      name: teamsTable.name,
      managerId: teamsTable.managerId,
      managerName: usersTable.name,
      createdAt: teamsTable.createdAt,
    })
    .from(teamsTable)
    .leftJoin(usersTable, eq(teamsTable.managerId, usersTable.id))
    .where(eq(teamsTable.id, id))
    .limit(1);

  if (!team) return null;

  const [{ value: providerCount }] = await db
    .select({ value: count() })
    .from(providersTable)
    .where(eq(providersTable.teamId, id));

  return { ...team, providerCount: Number(providerCount) };
}

// GET /api/teams
// Gestor só recebe a própria equipe — este endpoint alimenta seletores em
// outras telas (ex.: campo "Equipe" desabilitado no formulário de diária),
// não deve expor a lista completa de equipes para quem não é admin.
router.get("/", requireAuth, async (req, res) => {
  const me = req.currentUser!;

  let query = db
    .select({
      id: teamsTable.id,
      name: teamsTable.name,
      managerId: teamsTable.managerId,
      managerName: usersTable.name,
      createdAt: teamsTable.createdAt,
    })
    .from(teamsTable)
    .leftJoin(usersTable, eq(teamsTable.managerId, usersTable.id))
    .$dynamic();

  if (me.role === "gestor") {
    query = query.where(eq(teamsTable.id, me.teamId ?? -1));
  }

  const teams = await query.orderBy(teamsTable.name);

  const ids = teams.map((t) => t.id);
  const counts =
    ids.length > 0
      ? await db
          .select({ teamId: providersTable.teamId, value: count() })
          .from(providersTable)
          .where(eq(providersTable.active, true))
          .groupBy(providersTable.teamId)
      : [];

  const countMap = new Map(counts.map((c) => [c.teamId, Number(c.value)]));

  res.json(
    teams.map((t) => ({ ...t, providerCount: countMap.get(t.id) ?? 0 })),
  );
});

// POST /api/teams (admin)
router.post("/", requireRole("admin"), async (req, res) => {
  const { name, managerId } = req.body as { name: string; managerId?: number | null };
  const [team] = await db
    .insert(teamsTable)
    .values({ name, managerId: managerId ?? null })
    .returning();

  await logAudit({
    entityType: "team",
    entityId: team.id,
    action: "criado",
    userId: req.currentUser!.id,
    newValues: team,
  });

  const result = await getTeamWithMeta(team.id);
  res.status(201).json(result);
});

// GET /api/teams/:id
router.get("/:id", requireAuth, async (req, res) => {
  const team = await getTeamWithMeta(Number(req.params.id));
  if (!team) {
    res.status(404).json({ error: "Equipe não encontrada" });
    return;
  }
  res.json(team);
});

// PATCH /api/teams/:id (admin)
router.patch("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { name, managerId } = req.body as { name?: string; managerId?: number | null };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (managerId !== undefined) updates.managerId = managerId;

  const [updated] = await db
    .update(teamsTable)
    .set(updates)
    .where(eq(teamsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Equipe não encontrada" });
    return;
  }

  await logAudit({
    entityType: "team",
    entityId: id,
    action: "atualizado",
    userId: req.currentUser!.id,
    newValues: updates,
  });

  const result = await getTeamWithMeta(id);
  res.json(result);
});

// DELETE /api/teams/:id (admin)
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const [deleted] = await db
    .delete(teamsTable)
    .where(eq(teamsTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Equipe não encontrada" });
    return;
  }

  await logAudit({
    entityType: "team",
    entityId: id,
    action: "excluído",
    userId: req.currentUser!.id,
  });

  res.json({ message: "Equipe excluída" });
});

export default router;
