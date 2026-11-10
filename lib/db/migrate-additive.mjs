import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const migrations = [
  "audit_actor_snapshot.sql",
  "provider_reconciliation.sql",
  "export_attempts.sql",
];

// Explicit additive migrations only. Never run schema diff/push --force here.
export async function migrateAdditive(client, read = name =>
  readFile(new URL(`./migrations/${name}`, import.meta.url), "utf8")) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    // Same lock as the coordinated application startup migrations.
    await client.query("SELECT pg_advisory_xact_lock(724091514)");
    for (const name of migrations) await client.query(await read(name));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let client;
  let pool;
  try {
    if (!process.env.DATABASE_URL) throw new Error("Missing database configuration");
    const { default: pg } = await import("pg");
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
    client = await pool.connect();
    await migrateAdditive(client);
    console.log("Completed additive migrations; no financial data changed.");
  } catch {
    console.error("Additive migrations failed; deployment must not start.");
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool?.end();
  }
}
