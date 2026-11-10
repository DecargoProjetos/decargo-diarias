import { setTimeout as sleep } from "node:timers/promises";
import type { UserSyncResult } from "@workspace/api-zod";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedRetentionPostgres } from "./helpers/isolatedRetentionPostgres";
import { createGracefulShutdown } from "../../lib/gracefulShutdown";

// No static import of @workspace/db: DATABASE_URL is replaced BEFORE loading it.
let postgres: Awaited<ReturnType<typeof isolatedRetentionPostgres>>;
let database: typeof import("@workspace/db");
let reports: typeof import("../../lib/userSyncReports");
let monitor: typeof import("../../lib/userSyncRetentionMonitor");
let stopRetention: (() => Promise<void>) | undefined;
const additionalInstances: Array<{
  database: typeof database;
  reports: typeof reports;
  stop?: () => Promise<void>;
  poolEnded: boolean;
}> = [];
const now = new Date("2026-10-09T12:00:00.000Z");
const hour = 60 * 60 * 1000;
const day = 24 * hour;
// Must match the cross-server transaction lock used by initializeUserSyncReports.
const bootstrapLockQuery = "SELECT pg_advisory_xact_lock(724091514)";
const result = { synced: 0, created: 0, skipped: 0, conflicts: 0, conflictDetails: [] };
const employee = { employeeId: "fixture-employee", name: "Pessoa fictícia", email: null, active: true };
const conflictSnapshot: UserSyncResult = {
  ...result, skipped: 1, conflicts: 1,
  conflictDetails: [{
    employee, reasons: ["employee_id_account_collision"],
    localAccounts: [{
      localUserId: 42, externalReference: "fixture-login", name: "Conta fictícia",
      email: "fixture@example.invalid", active: false,
    }],
    sourceEmployees: [employee],
  }],
};

async function rows() {
  return database.db.select().from(database.userSyncReportsTable)
    .orderBy(database.userSyncReportsTable.runOrder);
}

async function seed(expiresAt: Date, completedAt = now, snapshot: UserSyncResult = result) {
  const report = { ...reports.makeUserSyncReport(snapshot, completedAt), expiresAt };
  await database.db.insert(database.userSyncReportsTable).values(report);
  return report;
}

async function independentInstance() {
  // Separate module caches emulate separate servers: each owns its pg Pool and scheduler.
  // DATABASE_URL still points exclusively at the disposable Unix-socket cluster.
  vi.resetModules();
  const instance = {
    database: await import("@workspace/db"),
    reports: await import("../../lib/userSyncReports"),
    stop: undefined as (() => Promise<void>) | undefined,
    poolEnded: false,
  };
  additionalInstances.push(instance);
  expect(instance.database.pool).not.toBe(database.pool);
  const identity = await instance.database.pool.query(
    "SELECT current_database() AS name, inet_server_addr() AS address, current_setting('data_directory') AS directory",
  );
  expect(identity.rows).toEqual([{ name: "postgres", address: null, directory: postgres.dataDirectory }]);
  return instance;
}

async function expectBlockedRetention(count: number, queryPattern = 'delete from "user_sync_reports"%') {
  // Observe real server-side overlap, rather than trusting Promise.all's timing.
  for (let attempt = 0; attempt < 100; attempt++) {
    const activity = await database.pool.query(`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query LIKE $1
    `, [queryPattern]);
    if (activity.rowCount === count) {
      expect(new Set(activity.rows.map(row => row.pid)).size).toBe(count);
      return activity.rows.map(row => row.pid as number);
    }
    await sleep(10);
  }
  throw new Error(`Expected ${count} independent PostgreSQL sessions blocked on retention: ${queryPattern}`);
}

// Keep pg's sockets and polling on real timers; only the scheduler and Date are virtual.
async function expectIdsEventually(ids: string[]) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const actual = (await rows()).map(row => row.id);
    if (JSON.stringify(actual) === JSON.stringify(ids)) return;
    await sleep(10);
  }
  expect((await rows()).map(row => row.id)).toEqual(ids);
}

async function expectSessionClosed(pid: number) {
  // Pool.end observes the local socket close; PostgreSQL must also retire its backend.
  for (let attempt = 0; attempt < 100; attempt++) {
    const activity = await database.pool.query("SELECT pid FROM pg_stat_activity WHERE pid = $1", [pid]);
    if (activity.rowCount === 0) return;
    await sleep(10);
  }
  throw new Error(`Stopped server left PostgreSQL backend ${pid} connected`);
}

beforeAll(async () => {
  postgres = await isolatedRetentionPostgres();
  vi.stubEnv("DATABASE_URL", postgres.connectionString);
  database = await import("@workspace/db");
  // Prove we're on our own cluster BEFORE any DDL or DELETE.
  const identity = await database.pool.query(
    "SELECT current_database() AS name, inet_server_addr() AS address, current_setting('data_directory') AS directory",
  );
  expect(identity.rows).toEqual([{ name: "postgres", address: null, directory: postgres.dataDirectory }]);
  reports = await import("../../lib/userSyncReports");
  await reports.initializeUserSyncReports();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(now);
  await database.pool.query("TRUNCATE user_sync_reports RESTART IDENTITY");
  monitor = await import("../../lib/userSyncRetentionMonitor");
  monitor.recordUserSyncRetentionSuccess();
});

afterEach(async () => {
  await stopRetention?.();
  stopRetention = undefined;
  for (const instance of additionalInstances.splice(0)) {
    await instance.stop?.();
    if (!instance.poolEnded) await instance.database.pool.end();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  try {
    if (database) await database.pool.end();
  } finally {
    vi.unstubAllEnvs();
    if (postgres) await postgres.cleanup();
  }
});

describe("User sync retention on a private real PostgreSQL cluster", () => {
  it("rolls back partial bootstrap DDL, returns a clean connection, and lets an independent server retry", async () => {
    await database.pool.query("DROP TABLE user_sync_reports");
    // A legacy column name makes only the LAST index fail, after earlier DDL.
    await database.pool.query(`
      CREATE TABLE user_sync_reports (
        id uuid PRIMARY KEY,
        completed_at timestamptz NOT NULL,
        legacy_expires_at timestamptz NOT NULL,
        result jsonb NOT NULL
      )
    `);
    const legacy = [
      { ...reports.makeUserSyncReport(conflictSnapshot, now), expiresAt: new Date(+now + 3 * hour) },
      { ...reports.makeUserSyncReport(result, now), expiresAt: now },
    ];
    for (const report of legacy) {
      await database.pool.query(
        "INSERT INTO user_sync_reports (id, completed_at, legacy_expires_at, result) VALUES ($1, $2, $3, $4)",
        [report.id, report.completedAt, report.expiresAt, report.result],
      );
    }
    async function schemaSnapshot() {
      const columns = await database.pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_sync_reports'
        ORDER BY ordinal_position
      `);
      const objects = await database.pool.query(`
        SELECT relname, relkind FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'user_sync_reports%'
        ORDER BY relname
      `);
      const indexes = await database.pool.query(`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'user_sync_reports' ORDER BY indexname
      `);
      const data = await database.pool.query("SELECT * FROM user_sync_reports ORDER BY id");
      return { columns: columns.rows, objects: objects.rows, indexes: indexes.rows, data: data.rows };
    }
    const original = await schemaSnapshot();
    const failed = await independentInstance();
    // One slot: a leaked checkout cannot be hidden by opening another connection.
    failed.database.pool.options.max = 1;
    failed.database.pool.options.connectionTimeoutMillis = 1000;
    const client = await failed.database.pool.connect();
    const partialDdlNotices: string[] = [];
    const onNotice = (notice: { message?: string }) => {
      if (notice.message === "retention_partial_ddl_ready") partialDdlNotices.push(notice.message);
    };
    let failedPid: number;
    try {
      failedPid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      client.on("notice", onNotice);
    } finally {
      client.release();
    }
    const onError = vi.fn();
    const onEvent = vi.fn();
    try {
      // Observe actual partial changes BEFORE rollback, without mocking queries.
      // Notices survive transaction rollback; catalog changes do not.
      await database.pool.query(`
        CREATE FUNCTION observe_retention_partial_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_TAG = 'CREATE INDEX'
            AND to_regclass('public.user_sync_reports_completed_idx') IS NOT NULL
            AND to_regclass('public.user_sync_reports_run_order_seq') IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'user_sync_reports' AND column_name = 'run_order'
            )
          THEN
            RAISE NOTICE 'retention_partial_ddl_ready';
          END IF;
        END $$;
        CREATE EVENT TRIGGER observe_retention_partial_ddl ON ddl_command_end
          EXECUTE FUNCTION observe_retention_partial_ddl();
      `);
      await expect(failed.reports.startUserSyncReportRetention(onError, onEvent).then(stop => {
        failed.stop = stop;
      })).rejects.toMatchObject({ code: "42703", message: 'column "expires_at" does not exist' });
      expect(partialDdlNotices).toEqual(["retention_partial_ddl_ready"]);
      expect(await schemaSnapshot()).toEqual(original); // columns, sequence, indexes AND snapshots
      expect(failed.stop).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(hour);
      expect(vi.getTimerCount()).toBe(0);
      expect(onError).not.toHaveBeenCalled();
      expect(onEvent).not.toHaveBeenCalled();
      expect(await schemaSnapshot()).toEqual(original); // no startup or hourly cleanup
      vi.setSystemTime(now);

      expect(failed.database.pool.totalCount).toBe(1);
      expect(failed.database.pool.idleCount).toBe(1);
      expect(failed.database.pool.waitingCount).toBe(0);
      const returned = await failed.database.pool.connect();
      try {
        expect((await returned.query("SELECT pg_backend_pid() AS pid")).rows[0].pid).toBe(failedPid);
        const state = await database.pool.query(`
          SELECT state, xact_start FROM pg_stat_activity WHERE pid = $1
        `, [failedPid]);
        expect(state.rows).toEqual([{ state: "idle", xact_start: null }]);
        const locks = await database.pool.query(
          "SELECT 1 FROM pg_locks WHERE pid = $1 AND locktype = 'advisory'", [failedPid],
        );
        expect(locks.rows).toEqual([]);
        // The exact returned connection is usable, not left in an aborted transaction.
        await returned.query("BEGIN");
        expect((await returned.query("SELECT 1 AS usable")).rows).toEqual([{ usable: 1 }]);
        await returned.query("COMMIT");
      } finally {
        returned.release();
      }

      await database.pool.query(`
        DROP EVENT TRIGGER observe_retention_partial_ddl;
        DROP FUNCTION observe_retention_partial_ddl();
        ALTER TABLE user_sync_reports RENAME COLUMN legacy_expires_at TO expires_at;
      `);
      const retry = await independentInstance();
      expect(retry.database.pool).not.toBe(failed.database.pool);
      // Bound the retry so a leaked cross-server advisory lock fails explicitly.
      const retryClient = await retry.database.pool.connect();
      try {
        await retryClient.query("SET statement_timeout = '2s'");
      } finally {
        retryClient.release();
      }
      retry.stop = await retry.reports.startUserSyncReportRetention(onError, onEvent);
      expect(vi.getTimerCount()).toBe(1); // only the successful server schedules cleanup
      expect(await rows()).toEqual([{ ...legacy[0], runOrder: expect.any(Number) }]);
      const sequence = await database.pool.query(
        "SELECT pg_get_serial_sequence('user_sync_reports', 'run_order') AS name",
      );
      expect(sequence.rows).toEqual([{ name: "public.user_sync_reports_run_order_seq" }]);
      const indexes = await database.pool.query(`
        SELECT indexrelid::regclass::text AS name, indisvalid AS valid, indisready AS ready
        FROM pg_index WHERE indrelid = 'user_sync_reports'::regclass ORDER BY name
      `);
      expect(indexes.rows).toEqual([
        { name: "user_sync_reports_completed_idx", valid: true, ready: true },
        { name: "user_sync_reports_expires_idx", valid: true, ready: true },
        { name: "user_sync_reports_pkey", valid: true, ready: true },
      ]);
      const next = retry.reports.makeUserSyncReport(result, now);
      await retry.database.db.insert(retry.database.userSyncReportsTable).values(next);
      const persisted = await rows();
      expect(persisted.map(row => row.id)).toEqual([legacy[0].id, next.id]);
      expect(persisted[1].runOrder).toBeGreaterThan(persisted[0].runOrder);
      expect(await retry.reports.latestUserSyncReport()).toMatchObject({ id: next.id });
      expect(onError).not.toHaveBeenCalled();
      expect(onEvent).not.toHaveBeenCalled();
      await retry.stop();
      retry.stop = undefined;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      client.removeListener("notice", onNotice);
      await database.pool.query(`
        DROP EVENT TRIGGER IF EXISTS observe_retention_partial_ddl;
        DROP FUNCTION IF EXISTS observe_retention_partial_ddl();
        DROP TABLE user_sync_reports;
      `);
      // Restore the shared suite fixture even when an assertion fails.
      await reports.initializeUserSyncReports();
    }
  });

  it("finishes bootstrap on a waiting server when the DDL lock owner loses its connection", async () => {
    await database.pool.query("DROP TABLE user_sync_reports");
    const owner = await independentInstance();
    const survivor = await independentInstance();
    expect(owner.database.pool).not.toBe(survivor.database.pool);
    const gate = await postgres.pauseReportCreation(database.pool);
    let ownerStartup: Promise<PromiseSettledResult<void>[]> | undefined;
    let survivorStartup: Promise<PromiseSettledResult<void>[]> | undefined;
    let ownerPid: number | undefined;
    // pg emits a socket error as well as rejecting the active query. Observe
    // that expected fault explicitly, rather than leaving an uncaught event.
    let resolveDisconnect!: (error: Error) => void;
    const disconnected = new Promise<Error>(resolve => { resolveDisconnect = resolve; });
    const connectionError = vi.fn((error: Error) => resolveDisconnect(error));
    owner.database.pool.once("acquire", client => client.on("error", connectionError));
    try {
      // allSettled attaches a rejection handler before the backend is killed.
      ownerStartup = Promise.allSettled([owner.reports.initializeUserSyncReports()]);
      ownerPid = await gate.waitForOwner();
      // CREATE TABLE has run but is still uncommitted in the owner's transaction.
      expect((await database.pool.query("SELECT to_regclass('public.user_sync_reports') AS name")).rows)
        .toEqual([{ name: null }]);
      survivorStartup = Promise.allSettled([survivor.reports.initializeUserSyncReports()]);
      await expectBlockedRetention(1, bootstrapLockQuery);
      const waiting = await database.pool.query(`
        SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query = $1
      `, [bootstrapLockQuery]);
      expect(waiting.rows).toEqual([{ pid: expect.any(Number), blockers: [ownerPid] }]);
      expect(waiting.rows[0].pid).not.toBe(ownerPid);

      await gate.terminateOwner(ownerPid);
      expect(await ownerStartup).toEqual([{
        status: "rejected", reason: expect.objectContaining({ code: "57P01" }),
      }]);
      expect(await disconnected).toMatchObject({ message: "Connection terminated unexpectedly" });
      expect(connectionError).toHaveBeenCalledTimes(1);
    } finally {
      // Release even if an assertion fails, then drain real queries before pools end.
      await gate.cleanup();
      if (ownerStartup) await ownerStartup;
      if (survivorStartup) await survivorStartup;
    }
    expect(await survivorStartup).toEqual([{ status: "fulfilled", value: undefined }]);
    expect(await rows()).toEqual([]);
    const abandoned = await database.pool.query(`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND (pid = $1 OR state LIKE 'idle in transaction%')
    `, [ownerPid]);
    expect(abandoned.rows).toEqual([]);
    const locks = await database.pool.query(`
      SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND classid = 0
        AND objid IN (724091514, 724091515) AND objsubid = 1
    `);
    expect(locks.rows).toEqual([]);
    expect(owner.database.pool.totalCount).toBe(0); // broken client was discarded
    expect(survivor.database.pool.waitingCount).toBe(0);

    const sequence = await database.pool.query(
      "SELECT pg_get_serial_sequence('user_sync_reports', 'run_order') AS name",
    );
    expect(sequence.rows).toEqual([{ name: "public.user_sync_reports_run_order_seq" }]);
    const indexes = await database.pool.query(`
      SELECT indexrelid::regclass::text AS name, indisvalid AS valid, indisready AS ready
      FROM pg_index WHERE indrelid = 'user_sync_reports'::regclass ORDER BY name
    `);
    expect(indexes.rows).toEqual([
      { name: "user_sync_reports_completed_idx", valid: true, ready: true },
      { name: "user_sync_reports_expires_idx", valid: true, ready: true },
      { name: "user_sync_reports_pkey", valid: true, ready: true },
    ]);
    const first = survivor.reports.makeUserSyncReport(result, now);
    await survivor.database.db.insert(survivor.database.userSyncReportsTable).values(first);
    // The disconnected server can use a fresh connection; no poisoned client remains.
    const last = owner.reports.makeUserSyncReport(conflictSnapshot, now);
    await owner.database.db.insert(owner.database.userSyncReportsTable).values(last);
    const stored = await rows();
    expect(stored.map(row => row.id)).toEqual([first.id, last.id]);
    expect(stored[1].runOrder).toBeGreaterThan(stored[0].runOrder);
    expect(stored.map(({ runOrder: _order, ...row }) => row)).toEqual([first, last]);
    for (const instance of [owner, survivor]) {
      expect(await instance.reports.latestUserSyncReport()).toMatchObject({ id: last.id });
      expect((await instance.reports.listUserSyncReports(1, 10)).reports.map(row => row.id))
        .toEqual([last.id, first.id]);
    }
    expect(vi.getTimerCount()).toBe(0); // initialization only, not hourly retention
  });

  it.each(["absent", "legacy"] as const)(
    "starts two independent servers with the report table %s and orders subsequent runs",
    async initialSchema => {
      await database.pool.query("DROP TABLE user_sync_reports");
      const legacy = [
        { ...reports.makeUserSyncReport(conflictSnapshot, now), expiresAt: new Date(+now + 3 * hour) },
        { ...reports.makeUserSyncReport(result, now), expiresAt: now },
      ];
      if (initialSchema === "legacy") {
        await database.pool.query(`
          CREATE TABLE user_sync_reports (
            id uuid PRIMARY KEY,
            completed_at timestamptz NOT NULL,
            expires_at timestamptz NOT NULL,
            result jsonb NOT NULL
          )
        `);
        for (const report of legacy) {
          await database.pool.query(
            "INSERT INTO user_sync_reports (id, completed_at, expires_at, result) VALUES ($1, $2, $3, $4)",
            [report.id, report.completedAt, report.expiresAt, report.result],
          );
        }
      }
      const second = await independentInstance();
      const errors = [vi.fn(), vi.fn()];
      const blocker = await database.pool.connect();
      let startups: Promise<PromiseSettledResult<void>[]> | undefined;
      try {
        await blocker.query("BEGIN");
        await blocker.query(bootstrapLockQuery);
        startups = Promise.allSettled([
          reports.startUserSyncReportRetention(errors[0]).then(stop => { stopRetention = stop; }),
          second.reports.startUserSyncReportRetention(errors[1]).then(stop => { second.stop = stop; }),
        ]);
        await expectBlockedRetention(2, bootstrapLockQuery);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
        // Always drain both startups before the suite closes their pools.
        if (startups) expect(await startups).toEqual([
          { status: "fulfilled", value: undefined },
          { status: "fulfilled", value: undefined },
        ]);
      }
      expect(vi.getTimerCount()).toBe(2);
      const migrated = await rows();
      if (initialSchema === "legacy") {
        expect(migrated).toEqual([{ ...legacy[0], runOrder: expect.any(Number) }]);
      } else {
        expect(migrated).toEqual([]);
      }

      // Both pools must use the same owned sequence after concurrent DDL.
      const objects = await database.pool.query(`
        SELECT relname, relkind FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'user_sync_reports%'
        ORDER BY relname
      `);
      expect(objects.rows).toEqual([
        { relname: "user_sync_reports", relkind: "r" },
        { relname: "user_sync_reports_completed_idx", relkind: "i" },
        { relname: "user_sync_reports_expires_idx", relkind: "i" },
        { relname: "user_sync_reports_pkey", relkind: "i" },
        { relname: "user_sync_reports_run_order_seq", relkind: "S" },
      ]);
      const sequence = await database.pool.query(
        "SELECT pg_get_serial_sequence('user_sync_reports', 'run_order') AS name",
      );
      expect(sequence.rows).toEqual([{ name: "public.user_sync_reports_run_order_seq" }]);
      const indexes = await database.pool.query(`
        SELECT indexrelid::regclass::text AS name, indisvalid AS valid, indisready AS ready
        FROM pg_index WHERE indrelid = 'user_sync_reports'::regclass ORDER BY name
      `);
      expect(indexes.rows).toEqual([
        { name: "user_sync_reports_completed_idx", valid: true, ready: true },
        { name: "user_sync_reports_expires_idx", valid: true, ready: true },
        { name: "user_sync_reports_pkey", valid: true, ready: true },
      ]);
      const first = await seed(new Date(+now + 3 * hour), now, { ...result, synced: 7 });
      const last = second.reports.makeUserSyncReport(conflictSnapshot, now);
      await second.database.db.insert(second.database.userSyncReportsTable).values(last);
      const all = await rows();
      expect(all.map(row => row.id)).toEqual([...migrated.map(row => row.id), first.id, last.id]);
      expect(new Set(all.map(row => row.runOrder)).size).toBe(all.length);
      for (let index = 1; index < all.length; index++) {
        expect(all[index].runOrder).toBeGreaterThan(all[index - 1].runOrder);
      }
      for (const instance of [reports, second.reports]) {
        expect(await instance.latestUserSyncReport()).toMatchObject({ id: last.id });
        expect((await instance.listUserSyncReports(1, 10)).reports.map(row => row.id))
          .toEqual(all.map(row => row.id).reverse());
      }
      errors.forEach(error => expect(error).not.toHaveBeenCalled());
    },
  );

  it("starts two independent servers together, pruning expired rows and preserving tied snapshots", async () => {
    await seed(new Date(+now - 1));
    await seed(now);
    const first = await seed(new Date(+now + 3 * hour), now, { ...result, synced: 7, created: 3 });
    const last = await seed(new Date(+now + 3 * hour), now, conflictSnapshot);
    const original = (await rows()).slice(2);
    const second = await independentInstance();
    const errors = [vi.fn(), vi.fn()];

    const blocker = await database.pool.connect();
    let startups: Promise<PromiseSettledResult<void>[]> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query(bootstrapLockQuery);
      startups = Promise.allSettled([
        reports.startUserSyncReportRetention(errors[0]).then(stop => { stopRetention = stop; }),
        second.reports.startUserSyncReportRetention(errors[1]).then(stop => { second.stop = stop; }),
      ]);
      await expectBlockedRetention(2, bootstrapLockQuery);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      if (startups) expect(await startups).toEqual([
        { status: "fulfilled", value: undefined },
        { status: "fulfilled", value: undefined },
      ]);
    }

    expect(await rows()).toEqual(original);
    expect(original.map(row => row.id)).toEqual([first.id, last.id]);
    expect(await reports.latestUserSyncReport()).toMatchObject({ id: last.id });
    expect(await second.reports.latestUserSyncReport()).toEqual(await reports.latestUserSyncReport());
    expect(vi.getTimerCount()).toBe(2);

    // Both hourly jobs run against the same cluster, without any HTTP request.
    await seed(new Date(+now + hour));
    await vi.advanceTimersByTimeAsync(hour);
    await expectIdsEventually([first.id, last.id]);
    expect(await rows()).toEqual(original);
    errors.forEach(error => expect(error).not.toHaveBeenCalled());
    await stopRetention!();
    stopRetention = undefined;
    expect(vi.getTimerCount()).toBe(1);
    await second.stop!();
    second.stop = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("deletes idempotently with two proven overlapping sessions and leaves every valid field unchanged", async () => {
    const expired = await seed(new Date(+now - 1));
    await seed(now);
    const justValid = await seed(new Date(+now + 1));
    const tiedFirst = await seed(new Date(+now + 3 * hour), now, { ...result, synced: 8, created: 2 });
    const tiedLast = await seed(new Date(+now + 3 * hour), now, conflictSnapshot);
    const original = (await rows()).slice(2);
    const second = await independentInstance();
    const blocker = await database.pool.connect();
    let deletions: Promise<unknown[]> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM user_sync_reports WHERE id = $1 FOR UPDATE", [expired.id]);
      deletions = Promise.allSettled([
        reports.pruneUserSyncReports(),
        second.reports.pruneUserSyncReports(),
      ]);
      await expectBlockedRetention(2);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      // Drain both operations even on assertion failure, before closing pools.
      if (deletions) expect(await deletions).toEqual([
        { status: "fulfilled", value: undefined },
        { status: "fulfilled", value: undefined },
      ]);
    }

    expect(await rows()).toEqual(original);
    expect(original.map(row => row.id)).toEqual([justValid.id, tiedFirst.id, tiedLast.id]);
    await Promise.all([reports.pruneUserSyncReports(), second.reports.pruneUserSyncReports()]);
    expect(await rows()).toEqual(original);
    expect(await second.reports.latestUserSyncReport()).toMatchObject({ id: tiedLast.id });
  });

  it("preserves a valid report inserted while both servers are waiting to clean expired rows", async () => {
    const expired = await seed(now);
    const existing = await seed(new Date(+now + 3 * hour), now, { ...result, synced: 9 });
    const original = (await rows()).slice(1);
    const second = await independentInstance();
    const blocker = await database.pool.connect();
    let deletions: Promise<unknown[]> | undefined;
    let inserted: Awaited<ReturnType<typeof rows>> = [];
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM user_sync_reports WHERE id = $1 FOR UPDATE", [expired.id]);
      deletions = Promise.allSettled([
        reports.pruneUserSyncReports(),
        second.reports.pruneUserSyncReports(),
      ]);
      await expectBlockedRetention(2);
      // A third connection commits a new report while BOTH DELETEs are in flight.
      const report = await seed(new Date(+now + 3 * hour), now, { ...conflictSnapshot, synced: 6, created: 4 });
      inserted = (await rows()).filter(row => row.id === report.id);
      expect(inserted).toHaveLength(1);
      await expectBlockedRetention(2);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      if (deletions) expect(await deletions).toEqual([
        { status: "fulfilled", value: undefined },
        { status: "fulfilled", value: undefined },
      ]);
    }

    expect(await rows()).toEqual([...original, ...inserted]);
    expect(original[0].id).toBe(existing.id);
    expect(inserted[0].runOrder).toBeGreaterThan(original[0].runOrder);
    expect(await reports.latestUserSyncReport()).toMatchObject({ id: inserted[0].id });
    expect(await second.reports.latestUserSyncReport()).toEqual(await reports.latestUserSyncReport());
    await Promise.all([reports.pruneUserSyncReports(), second.reports.pruneUserSyncReports()]);
    expect(await rows()).toEqual([...original, ...inserted]);
  });

  it.each(["complete", "cancel"] as const)(
    "drains a stopped server's blocked DELETE (%s), closes its pool, and keeps the other server cleaning",
    async outcome => {
      const second = await independentInstance();
      const errors = [vi.fn(), vi.fn()];
      stopRetention = await reports.startUserSyncReportRetention(errors[0]);
      second.stop = await second.reports.startUserSyncReportRetention(errors[1]);
      const stoppingPid = (await second.database.pool.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      const deleting = vi.spyOn(second.database.db, "delete");
      const expired = await seed(new Date(+now + hour));
      const expiresLater = await seed(new Date(+now + 4 * hour));
      const first = await seed(new Date(+now + 8 * hour), now, { ...result, synced: 8, created: 2 });
      const last = await seed(new Date(+now + 8 * hour), now, conflictSnapshot);
      const original = (await rows()).slice(1);
      const blocker = await database.pool.connect();
      let shutdownPromise: Promise<void> | undefined;
      let shutdownFinished = false;
      const endPool = vi.fn(async () => {
        await second.database.pool.end();
        second.poolEnded = true;
      });
      const closeServer = vi.fn(async () => {});
      const shutdown = createGracefulShutdown({
        stopRetention: second.stop!, closeServer, endPool,
      });
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT id FROM user_sync_reports WHERE id = $1 FOR UPDATE", [expired.id]);
        await vi.advanceTimersByTimeAsync(hour);
        expect(await expectBlockedRetention(2)).toContain(stoppingPid);
        expect(deleting).toHaveBeenCalledTimes(1);

        shutdownPromise = shutdown();
        void shutdownPromise.then(
          () => { shutdownFinished = true; },
          () => { shutdownFinished = true; },
        );
        expect(shutdown()).toBe(shutdownPromise);
        expect(closeServer).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(1);
        expect(shutdownFinished).toBe(false);
        expect(endPool).not.toHaveBeenCalled();

        // The surviving instance ticks again while the stopped one must not.
        await vi.advanceTimersByTimeAsync(hour);
        expect(await expectBlockedRetention(3)).toContain(stoppingPid);
        expect(deleting).toHaveBeenCalledTimes(1);
        expect(shutdownFinished).toBe(false);
        expect(second.database.pool.totalCount).toBe(1);

        if (outcome === "cancel") {
          // Cancel only the stopped instance's real blocked query, not its peer.
          const cancelled = await database.pool.query("SELECT pg_cancel_backend($1) AS cancelled", [stoppingPid]);
          expect(cancelled.rows).toEqual([{ cancelled: true }]);
          await shutdownPromise;
          expect(errors[1]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            cause: expect.objectContaining({ code: "57014" }),
          }));
          await expectBlockedRetention(2);
          expect(await rows()).toHaveLength(4); // other DELETEs still blocked
        } else {
          expect(errors[1]).not.toHaveBeenCalled();
          expect(endPool).not.toHaveBeenCalled();
        }
      } finally {
        // Release the barrier and drain work even when an assertion fails.
        await blocker.query("ROLLBACK");
        blocker.release();
        if (shutdownPromise) await shutdownPromise;
      }

      expect(shutdownFinished).toBe(true);
      expect(endPool).toHaveBeenCalledTimes(1);
      expect(second.database.pool.totalCount).toBe(0);
      expect(second.database.pool.idleCount).toBe(0);
      expect(second.database.pool.waitingCount).toBe(0);
      await expectSessionClosed(stoppingPid);
      await expectIdsEventually([expiresLater.id, first.id, last.id]);
      expect(await rows()).toEqual(original);

      // Fresh expirations are still removed by the sole surviving scheduler.
      await seed(new Date(+now + 3 * hour));
      await vi.advanceTimersByTimeAsync(hour);
      await expectIdsEventually([expiresLater.id, first.id, last.id]);
      expect(await rows()).toEqual(original);
      await vi.advanceTimersByTimeAsync(hour);
      await expectIdsEventually([first.id, last.id]);
      expect(await rows()).toEqual(original.slice(1));
      expect(await reports.latestUserSyncReport()).toMatchObject({ id: last.id });
      expect(deleting).toHaveBeenCalledTimes(1);
      expect(errors[0]).not.toHaveBeenCalled();
      expect(errors[1]).toHaveBeenCalledTimes(outcome === "cancel" ? 1 : 0);
      expect(vi.getTimerCount()).toBe(1);
    },
  );

  it("physically removes only expired reports on startup, including the exact boundary", async () => {
    await seed(new Date(+now - 1));
    await seed(now);
    const justValid = await seed(new Date(+now + 1));
    const valid = await seed(new Date(+now + 30 * day));
    const original = (await rows()).slice(2);
    const onError = vi.fn();

    stopRetention = await reports.startUserSyncReportRetention(onError);

    expect(await rows()).toEqual(original);
    expect((await rows()).map(row => row.id)).toEqual([justValid.id, valid.id]);
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("expires logically between ticks and deletes hourly without requests, preserving tied runs", async () => {
    const onError = vi.fn();
    stopRetention = await reports.startUserSyncReportRetention(onError);
    // Identical completion timestamps exercise the persisted serial tie-breaker.
    const validFirst = await seed(new Date(+now + 3 * hour));
    const validLast = await seed(new Date(+now + 3 * hour));
    await seed(new Date(+now + 30 * 60 * 1000));
    await seed(new Date(+now + hour));
    const original = (await rows()).slice(0, 2);

    await vi.advanceTimersByTimeAsync(hour - 1);
    expect(await rows()).toHaveLength(4); // no physical deletion before the hourly tick
    expect(await reports.latestUserSyncReport()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await expectIdsEventually([validFirst.id, validLast.id]);
    expect(await rows()).toEqual(original);
    expect(await reports.latestUserSyncReport()).toMatchObject({ id: validLast.id });
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(hour);
    expect(await rows()).toEqual(original);
    await vi.advanceTimersByTimeAsync(hour);
    await expectIdsEventually([]);
    expect(await reports.latestUserSyncReport()).toBeNull();
  });

  it("hides the last report at expiry even before the next physical cleanup", async () => {
    const report = await seed(new Date(+now + 1000));
    stopRetention = await reports.startUserSyncReportRetention(vi.fn());
    await vi.advanceTimersByTimeAsync(999);
    expect(await reports.latestUserSyncReport()).toMatchObject({ id: report.id });
    await vi.advanceTimersByTimeAsync(1);
    expect(await reports.latestUserSyncReport()).toBeNull();
    expect(await rows()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(hour - 1000);
    await expectIdsEventually([]);
  });

  it("cleans on restart after downtime and preserves surviving snapshots and run ordering", async () => {
    stopRetention = await reports.startUserSyncReportRetention(vi.fn());
    await seed(new Date(+now + hour));
    const validFirst = await seed(new Date(+now + 5 * hour));
    const validLast = await seed(new Date(+now + 5 * hour));
    const original = (await rows()).slice(1);

    await stopRetention();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2 * hour);
    expect(await rows()).toHaveLength(3); // evidence accumulated during downtime

    // Reconnect as a restarted process would, keeping the same private cluster.
    await database.pool.end();
    vi.resetModules();
    database = await import("@workspace/db");
    reports = await import("../../lib/userSyncReports");
    stopRetention = await reports.startUserSyncReportRetention(vi.fn());

    expect(await rows()).toEqual(original);
    expect((await rows()).map(row => row.id)).toEqual([validFirst.id, validLast.id]);
    expect(await reports.latestUserSyncReport()).toMatchObject({ id: validLast.id });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(3 * hour);
    await expectIdsEventually([]);
  });

  it("reports a failed hourly deletion and retries successfully on the next tick", async () => {
    let resolveError!: () => void;
    const failed = new Promise<void>(resolve => { resolveError = resolve; });
    const onError = vi.fn((_error: unknown) => resolveError());
    stopRetention = await reports.startUserSyncReportRetention(onError);
    await seed(new Date(+now + hour));
    const valid = await seed(new Date(+now + 3 * hour));
    // A real PostgreSQL query failure, not a mocked delete.
    await database.pool.query("ALTER TABLE user_sync_reports RENAME TO temporarily_unavailable_reports");
    try {
      await vi.advanceTimersByTimeAsync(hour);
      await failed;
      expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        cause: expect.objectContaining({ code: "42P01" }),
      }));
    } finally {
      await database.pool.query("ALTER TABLE temporarily_unavailable_reports RENAME TO user_sync_reports");
    }
    expect(await rows()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(hour);
    await expectIdsEventually([valid.id]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("alerts once on the third real failure, exposes safe 503 health, and signals recovery once", async () => {
    const express = (await import("express")).default;
    const health = (await import("../health")).default;
    const { logger } = await import("../../lib/logger");
    const { logUserSyncRetentionFailure, logUserSyncRetentionEvent } = await import("../../lib/userSyncRetentionLogging");
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
    const infoLog = vi.spyOn(logger, "info").mockImplementation(() => {});
    const onError = vi.fn(logUserSyncRetentionFailure);
    const onEvent = vi.fn(logUserSyncRetentionEvent);
    const app = express();
    app.use("/api", health);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a test HTTP port");
    const url = `http://127.0.0.1:${address.port}/api/healthz`;

    // Poll only real DB/socket work; never advance another tick before it settles.
    async function waitForFailures(count: number) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (onError.mock.calls.length === count) return;
        await sleep(10);
      }
      expect(onError).toHaveBeenCalledTimes(count);
    }

    stopRetention = await reports.startUserSyncReportRetention(onError, onEvent);
    const expired = await seed(new Date(+now + hour));
    const valid = await seed(new Date(+now + 10 * hour));
    const originalValid = (await rows())[1];
    // Force an actual DELETE error with sensitive text in PostgreSQL diagnostics.
    await database.pool.query(`
      CREATE FUNCTION fail_retention_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'PRIVATE_REPORT_CONTENT % %', OLD.id, OLD.result; END $$;
      CREATE TRIGGER fail_retention_delete BEFORE DELETE ON user_sync_reports
      FOR EACH ROW EXECUTE FUNCTION fail_retention_delete();
    `);
    try {
      for (let failure = 1; failure <= 4; failure++) {
        await vi.advanceTimersByTimeAsync(hour);
        await waitForFailures(failure);
        expect(await rows()).toHaveLength(2);
        const response = await fetch(`${url}/retention`);
        expect(response.status).toBe(failure < 3 ? 200 : 503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({
          status: failure < 3 ? "ok" : "degraded",
          alertActive: failure >= 3,
          consecutiveFailures: failure,
          threshold: 3,
          firstFailureAt: new Date(+now + hour).toISOString(),
          lastSuccessAt: now.toISOString(),
        });
        expect(onEvent).toHaveBeenCalledTimes(failure < 3 ? 0 : 1);
      }
      expect(onEvent).toHaveBeenNthCalledWith(1, {
        event: "user_sync_retention_alert",
        consecutiveFailures: 3,
        firstFailureAt: new Date(+now + hour).toISOString(),
        occurredAt: new Date(+now + 3 * hour).toISOString(),
      });
      expect(onError.mock.calls[0][0]).toMatchObject({
        cause: { message: expect.stringContaining("PRIVATE_REPORT_CONTENT") },
      });
      expect(JSON.stringify([errorLog.mock.calls, infoLog.mock.calls])).not.toContain("PRIVATE_REPORT_CONTENT");
      expect(JSON.stringify([errorLog.mock.calls, infoLog.mock.calls])).not.toContain(expired.id);
      expect(errorLog).toHaveBeenCalledTimes(5); // four safe failure logs + one alert
      expect(await (await fetch(url)).json()).toEqual({ status: "ok" }); // liveness unchanged

      await database.pool.query("DROP TRIGGER fail_retention_delete ON user_sync_reports");
      await vi.advanceTimersByTimeAsync(hour);
      await expectIdsEventually([valid.id]);
      expect(await rows()).toEqual([originalValid]);
      expect(onEvent).toHaveBeenNthCalledWith(2, {
        event: "user_sync_retention_recovered",
        consecutiveFailures: 4,
        firstFailureAt: new Date(+now + hour).toISOString(),
        occurredAt: new Date(+now + 5 * hour).toISOString(),
      });
      const recovered = await fetch(`${url}/retention`);
      expect(recovered.status).toBe(200);
      expect(await recovered.json()).toEqual({
        status: "ok", alertActive: false, consecutiveFailures: 0, threshold: 3,
        firstFailureAt: null, lastSuccessAt: new Date(+now + 5 * hour).toISOString(),
      });
      expect(infoLog).toHaveBeenCalledExactlyOnceWith(onEvent.mock.calls[1][0], "User sync report retention recovered");
      await vi.advanceTimersByTimeAsync(hour);
      // Synchronize with the scheduled DELETE even though it now removes zero rows.
      for (let attempt = 0; attempt < 100 && monitor.getUserSyncRetentionHealth().lastSuccessAt !== new Date(+now + 6 * hour).toISOString(); attempt++) {
        await sleep(10);
      }
      expect(monitor.getUserSyncRetentionHealth().lastSuccessAt).toBe(new Date(+now + 6 * hour).toISOString());
      expect(onEvent).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalledTimes(4);
    } finally {
      await database.pool.query(`
        DROP TRIGGER IF EXISTS fail_retention_delete ON user_sync_reports;
        DROP FUNCTION fail_retention_delete();
      `);
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it("resets short failure streaks on success and rearms the alert after recovery, even with zero rows", async () => {
    const onError = vi.fn();
    const onEvent = vi.fn();
    stopRetention = await reports.startUserSyncReportRetention(onError, onEvent);

    async function failTicks(count: number) {
      await database.pool.query("ALTER TABLE user_sync_reports RENAME TO temporarily_unavailable_reports");
      try {
        for (let tick = 0; tick < count; tick++) {
          const expected = onError.mock.calls.length + 1;
          await vi.advanceTimersByTimeAsync(hour);
          for (let attempt = 0; attempt < 100 && onError.mock.calls.length < expected; attempt++) await sleep(10);
          expect(onError).toHaveBeenCalledTimes(expected);
        }
      } finally {
        await database.pool.query("ALTER TABLE temporarily_unavailable_reports RENAME TO user_sync_reports");
      }
    }

    async function succeedTick() {
      await vi.advanceTimersByTimeAsync(hour);
      const successTime = new Date().toISOString();
      for (let attempt = 0; attempt < 100 && monitor.getUserSyncRetentionHealth().lastSuccessAt !== successTime; attempt++) await sleep(10);
      expect(monitor.getUserSyncRetentionHealth()).toMatchObject({
        alertActive: false, consecutiveFailures: 0, firstFailureAt: null, lastSuccessAt: successTime,
      });
    }

    await failTicks(2);
    expect(onEvent).not.toHaveBeenCalled();
    await succeedTick();
    expect(onEvent).not.toHaveBeenCalled(); // no recovery notification for a non-incident
    await failTicks(3);
    expect(onEvent).toHaveBeenCalledTimes(1);
    await succeedTick();
    expect(onEvent).toHaveBeenCalledTimes(2);
    await failTicks(3);
    expect(onEvent).toHaveBeenCalledTimes(3);
    await succeedTick();
    expect(onEvent.mock.calls.map(([event]) => event.event)).toEqual([
      "user_sync_retention_alert", "user_sync_retention_recovered",
      "user_sync_retention_alert", "user_sync_retention_recovered",
    ]);
    expect(await rows()).toEqual([]);
  });
});
