import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const exec = promisify(execFile);
type TestPool = typeof import("@workspace/db")["pool"];

/**
 * Pause actual startup DDL after CREATE TABLE, before its transaction commits.
 * The observer connection owns a different lock, leaving the bootstrap lock
 * owned by the real initializeUserSyncReports connection we will disconnect.
 */
async function pauseReportCreation(pool: TestPool, dataDirectory: string) {
  const identity = await pool.query(
    "SELECT inet_server_addr() AS address, current_setting('data_directory') AS directory",
  );
  if (identity.rows[0]?.address !== null || identity.rows[0]?.directory !== dataDirectory) {
    throw new Error("Bootstrap fault injection requires the disposable PostgreSQL cluster");
  }
  const gate = await pool.connect();
  const { rows: [{ pid: gatePid }] } = await gate.query("SELECT pg_backend_pid() AS pid");
  try {
    await gate.query("SELECT pg_advisory_lock(724091515)");
    await gate.query(`
      CREATE FUNCTION pause_report_creation() RETURNS event_trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(724091515); END $$;
      CREATE EVENT TRIGGER pause_report_creation ON ddl_command_end
        WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION pause_report_creation();
    `);
  } catch (error) {
    gate.release(true);
    throw error;
  }
  return {
    async waitForOwner() {
      for (let attempt = 0; attempt < 200; attempt++) {
        const owners = await gate.query(`
          SELECT a.pid FROM pg_stat_activity a
          JOIN pg_locks l ON l.pid = a.pid
          WHERE a.datname = current_database() AND a.wait_event_type = 'Lock'
            AND a.wait_event = 'advisory' AND a.query LIKE '%CREATE TABLE IF NOT EXISTS user_sync_reports%'
            AND l.locktype = 'advisory' AND l.classid = 0
            AND l.objid = 724091514 AND l.objsubid = 1 AND l.granted
            AND $1 = ANY(pg_blocking_pids(a.pid))
        `, [gatePid]);
        if (owners.rowCount === 1) return owners.rows[0].pid as number;
        await sleep(10);
      }
      throw new Error("No bootstrap transaction reached the disposable DDL gate");
    },
    async terminateOwner(pid: number) {
      // Only terminate the session proven to own this test's bootstrap lock.
      const terminated = await gate.query(`
        SELECT pg_terminate_backend(pid) AS terminated FROM pg_locks
        WHERE pid = $1 AND locktype = 'advisory' AND classid = 0
          AND objid = 724091514 AND objsubid = 1 AND granted
      `, [pid]);
      if (terminated.rows.length !== 1 || terminated.rows[0].terminated !== true) {
        throw new Error("Disposable bootstrap owner was not terminated");
      }
    },
    async cleanup() {
      try {
        // Release the gate before removing the trigger: a survivor may need it.
        await gate.query("SELECT pg_advisory_unlock(724091515)");
        await gate.query(`
          DROP EVENT TRIGGER IF EXISTS pause_report_creation;
          DROP FUNCTION IF EXISTS pause_report_creation();
        `);
      } finally {
        gate.release(true);
      }
    },
  };
}

/**
 * A fresh PostgreSQL cluster, not a schema in the configured database.
 * Only a private Unix socket is exposed; no DATABASE_URL or PG* settings are used.
 * Requires initdb and pg_ctl on PATH and fails explicitly when unavailable.
 */
export async function isolatedRetentionPostgres() {
  const directory = await mkdtemp(join(tmpdir(), "retention-pg-"));
  const dataDirectory = join(directory, "data");
  const username = userInfo().username;
  const env = { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", HOME: directory };
  let started = false;
  try {
    await exec("initdb", ["-D", dataDirectory, "-U", username, "-A", "trust", "--no-locale"], { env });
    await exec("pg_ctl", [
      "-D", dataDirectory, "-l", join(directory, "postgres.log"),
      "-o", `-F -h '' -k '${directory}'`, "-w", "start",
    ], { env });
    started = true;
  } catch (error) {
    // pg_ctl can fail after launching postgres; stop that cluster too.
    await exec("pg_ctl", ["-D", dataDirectory, "-m", "immediate", "-w", "stop"], { env }).catch(() => {});
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    dataDirectory,
    connectionString: `postgresql://${encodeURIComponent(username)}@localhost/postgres?host=${encodeURIComponent(directory)}`,
    pauseReportCreation(pool: TestPool) {
      return pauseReportCreation(pool, dataDirectory);
    },
    async cleanup() {
      if (started) {
        await exec("pg_ctl", ["-D", dataDirectory, "-m", "immediate", "-w", "stop"], { env });
        started = false;
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}
