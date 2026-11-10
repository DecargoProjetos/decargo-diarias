import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { migrateAdditive } from "./migrate-additive.mjs";

test("only the explicit additive migrations run inside one locked transaction", async () => {
  const calls = [];
  await migrateAdditive({ query: async sql => { calls.push(sql); } });
  assert.equal(calls[0], "BEGIN");
  assert.equal(calls.at(-1), "COMMIT");
  assert.ok(calls.indexOf("SELECT pg_advisory_xact_lock(724091514)") < 4);
  assert.equal(calls.length, 8);
  const statements = calls.slice(4, -1).map(sql => sql.replace(/--[^\n]*/g, "")).join("\n");
  assert.doesNotMatch(statements, /\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/i);
  assert.match(statements, /ADD COLUMN IF NOT EXISTS user_name_at_action/);
  assert.match(statements, /ADD COLUMN IF NOT EXISTS local_reference/);
  assert.match(statements, /CREATE TABLE IF NOT EXISTS export_attempts/);
});

test("a migration failure rolls back and prevents subsequent migrations", async () => {
  const calls = [];
  await assert.rejects(migrateAdditive({
    query: async sql => {
      calls.push(sql);
      if (sql === "FAIL_MIGRATION") throw new Error("synthetic failure");
    },
  }, async () => "FAIL_MIGRATION"), /synthetic failure/);
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.ok(!calls.includes("COMMIT"));
  assert.equal(calls.filter(sql => sql === "FAIL_MIGRATION").length, 1);
});

test("bootstrap report cleanup is confined to expired synchronization reports", async () => {
  const source = await readFile(new URL("../../artifacts/api-server/src/lib/userSyncReports.ts", import.meta.url), "utf8");
  assert.match(source, /db.delete\(userSyncReportsTable\).where\(lte\(userSyncReportsTable.expiresAt, now\)\)/);
  assert.doesNotMatch(source, /db.delete\((?:diariasTable|providersTable|usersTable)\)/);
});
