import { Router, type IRouter } from "express";
import { HealthCheckResponse, UserSyncRetentionHealthResponse } from "@workspace/api-zod";
import { getUserSyncRetentionHealth } from "../lib/userSyncRetentionMonitor";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Deliberately separate from liveness: restarting the API on this alert would
// reset the consecutive-failure counter instead of fixing cleanup.
router.get("/healthz/retention", (_req, res) => {
  const data = UserSyncRetentionHealthResponse.parse(getUserSyncRetentionHealth());
  res.set("Cache-Control", "no-store");
  res.status(data.alertActive ? 503 : 200).json(data);
});

export default router;
