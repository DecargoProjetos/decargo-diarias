import { db, pool, exportAttemptsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import type { ExportAttempt } from "@workspace/api-zod";
import type { ExportProgress } from "./peopleClient";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function newExportAttempt(
  integrationRef: string, ids: number[], skipped: ExportAttempt["skipped"], now = new Date(),
): ExportAttempt {
  return {
    integrationRef, status: "running", createdAt: now, updatedAt: now,
    total: ids.length, confirmed: [], rejected: [], uncertain: [], unsent: [...ids],
    skipped, message: null,
  };
}

export async function createExportAttempt(tx: Transaction, attempt: ExportAttempt) {
  await tx.insert(exportAttemptsTable).values({
    integrationRef: attempt.integrationRef, snapshot: attempt,
  });
}

export function trackExportAttempt(attempt: ExportAttempt) {
  async function save() {
    attempt.updatedAt = new Date();
    await db.update(exportAttemptsTable).set({ snapshot: attempt, updatedAt: new Date() })
      .where(eq(exportAttemptsTable.integrationRef, attempt.integrationRef));
  }
  const progress: ExportProgress = {
    // Persist uncertainty BEFORE starting the financial POST. A crash after
    // sending but before saving its receipt must never imply it was unsent.
    async beforeBatch(ids) {
      const batch = new Set(ids);
      attempt.unsent = attempt.unsent.filter(id => !batch.has(id));
      attempt.uncertain.push(...ids);
      await save();
    },
    async afterBatch(confirmed, rejected) {
      const completed = new Set([...confirmed, ...rejected]);
      attempt.uncertain = attempt.uncertain.filter(id => !completed.has(id));
      attempt.confirmed.push(...confirmed);
      attempt.rejected.push(...rejected);
      await save();
    },
  };
  return {
    progress,
    async finish(
      status: "completed" | "interrupted", message: string | null = null,
      outcomes?: Pick<ExportAttempt, "confirmed" | "rejected" | "uncertain" | "unsent">,
    ) {
      if (outcomes) Object.assign(attempt, outcomes);
      attempt.status = status;
      attempt.message = message;
      await save();
    },
  };
}

function snapshot(row: typeof exportAttemptsTable.$inferSelect): ExportAttempt {
  const attempt = row.snapshot as ExportAttempt;
  // Informational only. Reading an abandoned attempt never retries a POST,
  // releases a reservation, or overwrites an active worker's snapshot.
  if (attempt.status === "running" && Date.now() - row.updatedAt.getTime() > 120_000) {
    return { ...attempt, status: "interrupted", message: "Progresso sem atualização recente. Confira os registros incertos no People antes de qualquer reenvio." };
  }
  return attempt;
}

export async function listExportAttempts() {
  const rows = await db.select().from(exportAttemptsTable)
    .orderBy(desc(exportAttemptsTable.createdAt)).limit(20);
  return rows.map(snapshot);
}

export async function getExportAttempt(integrationRef: string) {
  const [row] = await db.select().from(exportAttemptsTable)
    .where(eq(exportAttemptsTable.integrationRef, integrationRef)).limit(1);
  return row ? snapshot(row) : null;
}

/** Same startup DDL lock as the report tables: safe across server instances. */
export async function initializeExportAttempts() {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(724091514)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS export_attempts (
        integration_ref text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        snapshot jsonb NOT NULL
      );
      CREATE INDEX IF NOT EXISTS export_attempts_created_at_idx ON export_attempts (created_at DESC);
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => { discard = true; });
    throw error;
  } finally {
    client.release(discard);
  }
}
