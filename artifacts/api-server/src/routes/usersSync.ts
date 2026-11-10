import { Router } from "express";
import { db, usersTable, auditLogsTable, userSyncReportsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { SyncUsersResponse, type UserSyncConflict } from "@workspace/api-zod";
import { requireRole } from "../middlewares/requireAuth";
import { fetchFuncionarios } from "../lib/peopleClient";
import { getPeopleSyncAccess, peopleUserSyncEnabled, PeopleUserSyncError } from "../lib/peopleUserSync";
import { inspectUserSyncEmployee } from "../lib/userSyncConflicts";
import { makeUserSyncReport } from "../lib/userSyncReports";

const router = Router();

// Additive-only: the administrative report is returned only after both the
// import and its aggregate audit have committed.
router.post("/sync", requireRole("admin"), async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  req.log.info("User sync started");
  let importing = false;
  try {
    const access = peopleUserSyncEnabled() ? await getPeopleSyncAccess(req) : undefined;
    const remote = await fetchFuncionarios(access);
    importing = true;
    const report = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(724091513)`);
      const users = await tx.select().from(usersTable);
      let created = 0, skipped = 0;
      const conflictDetails: UserSyncConflict[] = [];
      for (const employee of remote) {
        const { email, existing, conflict } = inspectUserSyncEmployee(employee, remote, users);
        if (conflict) {
          conflictDetails.push(conflict);
          continue;
        }
        if (existing || !email) {
          skipped++;
          continue;
        }
        const [user] = await tx.insert(usersTable).values({
          decargoId: String(employee.id_funcionario), name: employee.nome,
          email, role: "prestador", active: !employee.demitido,
        }).returning();
        users.push(user);
        created++;
      }
      const counts = { synced: remote.length, created, skipped, conflicts: conflictDetails.length };
      const result = SyncUsersResponse.parse({ ...counts, conflictDetails });
      await tx.insert(userSyncReportsTable).values(makeUserSyncReport(result));
      // No names, emails, source identifiers or conflict evidence in history.
      // In particular, never use the global logAudit connection here.
      await tx.insert(auditLogsTable).values({
        entityType: "user", entityId: 0, action: "sync",
        userId: req.currentUser!.id,
        userNameAtAction: req.currentUser!.name,
        newValues: { ...counts, timestamp: new Date() },
      });
      return result;
    });
    const { conflictDetails: _details, ...counts } = report;
    req.log.info(counts, "User sync complete");
    res.json(report);
  } catch (err) {
    if (err instanceof PeopleUserSyncError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    // Database error details may contain the inserted person's information.
    req.log.error({ stage: importing ? "import" : "people" }, "User sync failed");
    res.status(importing ? 500 : 502).json({
      error: importing
        ? "Não foi possível concluir a sincronização. Nenhum usuário foi importado nesta tentativa. Tente novamente."
        : "Não foi possível consultar os funcionários no DECARGO People. Tente novamente.",
      code: importing ? "USER_SYNC_NOT_COMMITTED" : "PEOPLE_FETCH_FAILED",
    });
  }
});

export default router;
