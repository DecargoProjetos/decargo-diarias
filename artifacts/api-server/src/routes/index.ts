import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import teamsRouter from "./teams";
import providersRouter from "./providers";
import diariasRouter from "./diarias";
import diariaImportRouter from "./diariaImport";
import diariaTypesRouter from "./diaria-types";
import auditRouter from "./audit";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import competencePeriodsRouter from "./competencePeriods";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/teams", teamsRouter);
router.use("/providers", providersRouter);
router.use("/diarias/import", diariaImportRouter);
router.use("/diarias", diariasRouter);
router.use("/diaria-types", diariaTypesRouter);
router.use("/audit", auditRouter);
router.use("/dashboard", dashboardRouter);
router.use("/reports", reportsRouter);
router.use("/competence-periods", competencePeriodsRouter);

export default router;
