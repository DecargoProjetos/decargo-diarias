import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import teamsRouter from "./teams";
import providersRouter from "./providers";
import diariasRouter from "./diarias";
import auditRouter from "./audit";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/teams", teamsRouter);
router.use("/providers", providersRouter);
router.use("/diarias", diariasRouter);
router.use("/audit", auditRouter);
router.use("/dashboard", dashboardRouter);
router.use("/reports", reportsRouter);

export default router;
