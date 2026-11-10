import { randomUUID } from "node:crypto";
import { pool, db, userSyncReportsTable } from "@workspace/db";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { SyncUsersResponse, type UserSyncResult } from "@workspace/api-zod";
import {
  recordUserSyncRetentionFailure,
  recordUserSyncRetentionSuccess,
  type RetentionEvent,
} from "./userSyncRetentionMonitor";

export const USER_SYNC_REPORT_RETENTION_DAYS = 30;

export function makeUserSyncReport(result: UserSyncResult, completedAt = new Date()) {
  return {
    id: randomUUID(),
    completedAt,
    expiresAt: new Date(completedAt.getTime() + USER_SYNC_REPORT_RETENTION_DAYS * 86400_000),
    // Schema projection discards unexpected upstream fields.
    result: SyncUsersResponse.parse(result),
  };
}

export async function pruneUserSyncReports(now = new Date()) {
  await db.delete(userSyncReportsTable).where(lte(userSyncReportsTable.expiresAt, now));
}

export async function latestUserSyncReport(now = new Date()) {
  const [row] = await db.select().from(userSyncReportsTable)
    .where(gt(userSyncReportsTable.expiresAt, now))
    .orderBy(desc(userSyncReportsTable.completedAt), desc(userSyncReportsTable.runOrder)).limit(1);
  return row ? {
    id: row.id,
    completedAt: row.completedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    result: SyncUsersResponse.parse(row.result),
  } : null;
}

export async function listUserSyncReports(page: number, pageSize: number, now = new Date()) {
  // Select metadata and counters only: other runs' conflict evidence is not loaded.
  const rows = await db.select({
    id: userSyncReportsTable.id,
    completedAt: userSyncReportsTable.completedAt,
    expiresAt: userSyncReportsTable.expiresAt,
    synced: sql<number>`(${userSyncReportsTable.result}->>'synced')::integer`,
    created: sql<number>`(${userSyncReportsTable.result}->>'created')::integer`,
    skipped: sql<number>`(${userSyncReportsTable.result}->>'skipped')::integer`,
    conflicts: sql<number>`(${userSyncReportsTable.result}->>'conflicts')::integer`,
  }).from(userSyncReportsTable)
    .where(gt(userSyncReportsTable.expiresAt, now))
    .orderBy(desc(userSyncReportsTable.completedAt), desc(userSyncReportsTable.runOrder))
    .limit(pageSize + 1).offset((page - 1) * pageSize);
  return {
    reports: rows.slice(0, pageSize).map(row => ({
      ...row, completedAt: row.completedAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
    })),
    page, pageSize, hasMore: rows.length > pageSize,
    retentionDays: USER_SYNC_REPORT_RETENTION_DAYS,
  };
}

export async function getUserSyncReport(id: string, now = new Date()) {
  const [row] = await db.select().from(userSyncReportsTable)
    .where(and(eq(userSyncReportsTable.id, id), gt(userSyncReportsTable.expiresAt, now))).limit(1);
  return row ? {
    id: row.id,
    completedAt: row.completedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    result: SyncUsersResponse.parse(row.result),
  } : null;
}

/** Targeted, additive startup migration; does not push unrelated schema drift. */
export async function initializeUserSyncReports() {
  const client = await pool.connect();
  let discardConnection = false;
  try {
    await client.query("BEGIN");
    // IF NOT EXISTS alone does not protect concurrent catalog writes (including
    // serial's implicit sequence). Use one connection and a transaction-scoped
    // lock shared by all servers, released on commit, rollback or disconnect.
    await client.query("SELECT pg_advisory_xact_lock(724091514)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sync_reports (
        id uuid PRIMARY KEY,
        run_order serial NOT NULL,
        completed_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        result jsonb NOT NULL
      );
      ALTER TABLE user_sync_reports ADD COLUMN IF NOT EXISTS run_order serial NOT NULL;
      CREATE INDEX IF NOT EXISTS user_sync_reports_completed_idx ON user_sync_reports (completed_at);
      CREATE INDEX IF NOT EXISTS user_sync_reports_expires_idx ON user_sync_reports (expires_at);
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => { discardConnection = true; });
    throw error;
  } finally {
    client.release(discardConnection);
  }
  await pruneUserSyncReports();
}

/** Startup cleanup and the hourly job share this lifecycle, independent of HTTP traffic. */
export async function startUserSyncReportRetention(
  onError: (error: unknown) => void,
  onEvent: (event: RetentionEvent) => void = () => {},
) {
  await initializeUserSyncReports();
  const recovery = recordUserSyncRetentionSuccess();
  if (recovery) onEvent(recovery);
  let stopped = false;
  const pending = new Set<Promise<void>>();
  const timer = setInterval(() => {
    if (stopped) return;
    const cleanup = pruneUserSyncReports().then(
      () => {
        const event = recordUserSyncRetentionSuccess();
        if (event) onEvent(event);
      },
      error => {
        const event = recordUserSyncRetentionFailure();
        onError(error);
        if (event) onEvent(event);
      },
    );
    pending.add(cleanup);
    void cleanup.then(
      () => pending.delete(cleanup),
      () => pending.delete(cleanup),
    );
  }, 60 * 60 * 1000);
  timer.unref();
  let stopping: Promise<void> | undefined;
  return () => {
    // Cancel synchronously, but let callers wait for every already-started query.
    stopped = true;
    clearInterval(timer);
    stopping ??= Promise.allSettled([...pending]).then(outcomes => {
      const failed = outcomes.find(outcome => outcome.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    });
    return stopping;
  };
}
