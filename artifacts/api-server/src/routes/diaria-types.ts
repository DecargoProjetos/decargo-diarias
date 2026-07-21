import { Router } from "express";
import { db, diariaTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router = Router();

// GET /api/diaria-types — public (authenticated): only active, alphabetical
router.get("/", requireAuth, async (req, res) => {
  const activeOnly = req.query.activeOnly !== "false";
  const rows = await db
    .select()
    .from(diariaTypesTable)
    .orderBy(diariaTypesTable.description);
  const result = activeOnly ? rows.filter((r) => r.active) : rows;
  res.json(result);
});

// POST /api/diaria-types (admin only)
router.post("/", requireRole("admin"), async (req, res) => {
  const { description, exportTarget } = req.body as {
    description?: string;
    exportTarget?: string;
  };

  if (!description?.trim()) {
    res.status(400).json({ error: "Descrição é obrigatória" });
    return;
  }
  const validTargets = ["diaria_extra", "falta"];
  if (!exportTarget || !validTargets.includes(exportTarget)) {
    res.status(400).json({ error: "Destino de exportação inválido" });
    return;
  }

  const existing = await db
    .select()
    .from(diariaTypesTable)
    .where(eq(diariaTypesTable.description, description.trim()))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Já existe um tipo com essa descrição" });
    return;
  }

  const [created] = await db
    .insert(diariaTypesTable)
    .values({
      description: description.trim(),
      exportTarget: exportTarget as "diaria_extra" | "falta",
      active: true,
    })
    .returning();

  res.status(201).json(created);
});

// PATCH /api/diaria-types/:id (admin only)
router.patch("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { description, exportTarget, active } = req.body as {
    description?: string;
    exportTarget?: string;
    active?: boolean;
  };

  const [existing] = await db
    .select()
    .from(diariaTypesTable)
    .where(eq(diariaTypesTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Tipo de diária não encontrado" });
    return;
  }

  const updates: Partial<typeof existing> = { updatedAt: new Date() };

  if (description !== undefined) {
    if (!description.trim()) {
      res.status(400).json({ error: "Descrição não pode ser vazia" });
      return;
    }
    // Check uniqueness excluding self
    const dup = await db
      .select()
      .from(diariaTypesTable)
      .where(eq(diariaTypesTable.description, description.trim()))
      .limit(1);
    if (dup.length > 0 && dup[0].id !== id) {
      res.status(409).json({ error: "Já existe um tipo com essa descrição" });
      return;
    }
    updates.description = description.trim();
  }

  const validTargets = ["diaria_extra", "falta"];
  if (exportTarget !== undefined) {
    if (!validTargets.includes(exportTarget)) {
      res.status(400).json({ error: "Destino de exportação inválido" });
      return;
    }
    updates.exportTarget = exportTarget as "diaria_extra" | "falta";
  }

  if (active !== undefined) updates.active = active;

  const [updated] = await db
    .update(diariaTypesTable)
    .set(updates)
    .where(eq(diariaTypesTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
