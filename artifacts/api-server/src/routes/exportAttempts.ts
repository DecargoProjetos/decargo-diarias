import { Router } from "express";
import { requireRole } from "../middlewares/requireAuth";
import { getExportAttempt, listExportAttempts } from "../lib/exportAttempts";

const router = Router();
router.use(requireRole("admin"));
router.get("/", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await listExportAttempts());
});
router.get("/:integrationRef", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const attempt = await getExportAttempt(req.params.integrationRef);
  if (!attempt) {
    res.status(404).json({ error: "Tentativa de exportação não encontrada" });
    return;
  }
  res.json(attempt);
});
export default router;
