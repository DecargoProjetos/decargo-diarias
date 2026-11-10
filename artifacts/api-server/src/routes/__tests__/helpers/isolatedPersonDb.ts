import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Only this suite's queries use this disposable schema. No public table, row,
 * or sequence is written. Both pool queries and Drizzle transactions are
 * scoped with SET LOCAL; the search_path never includes public.
 */
export async function isolatedPersonDb() {
  const schema = `test_person_${randomUUID().replaceAll("-", "")}`;
  const query = pool.query.bind(pool);
  await query(`CREATE SCHEMA "${schema}"`);
  try {
    await query(`
      CREATE TABLE "${schema}".teams (
        id serial PRIMARY KEY, name text NOT NULL, manager_id integer,
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE "${schema}".users (
        id serial PRIMARY KEY, decargo_id text NOT NULL UNIQUE, name text NOT NULL, email text NOT NULL,
        role text NOT NULL DEFAULT 'prestador', team_id integer REFERENCES "${schema}".teams(id),
        avatar_url text, active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE "${schema}".providers (
        id serial PRIMARY KEY, decargo_id text NOT NULL UNIQUE, local_reference text UNIQUE, name text NOT NULL, email text,
        team_id integer REFERENCES "${schema}".teams(id), cnpj text, daily_rate numeric(10,2),
        active boolean NOT NULL DEFAULT true, synced_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE "${schema}".audit_logs (
        id serial PRIMARY KEY, entity_type text NOT NULL, entity_id integer NOT NULL, action text NOT NULL,
        user_id integer REFERENCES "${schema}".users(id), timestamp timestamp NOT NULL DEFAULT now(),
        old_values jsonb, new_values jsonb);
      CREATE TABLE "${schema}".diaria_types (
        id serial PRIMARY KEY, description text NOT NULL, export_target text NOT NULL DEFAULT 'diaria_extra',
        active boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE "${schema}".diarias (
        id serial PRIMARY KEY, provider_id integer NOT NULL REFERENCES "${schema}".providers(id),
        team_id integer NOT NULL REFERENCES "${schema}".teams(id),
        manager_id integer REFERENCES "${schema}".users(id), work_date date NOT NULL, start_time time,
        end_time time, value numeric(10,2) NOT NULL, type_id integer REFERENCES "${schema}".diaria_types(id),
        payment_date date, observations text, status text NOT NULL DEFAULT 'pendente_aprovacao',
        action_note text, created_at timestamp NOT NULL DEFAULT now(),
        created_by integer NOT NULL REFERENCES "${schema}".users(id), approved_at timestamp,
        approved_by integer, exported_at timestamp, exported_by integer, integration_id text,
        paid_at timestamp, cancelled_at timestamp, cancelled_by integer,
        updated_at timestamp NOT NULL DEFAULT now());
    `);
  } catch (err) {
    await query(`DROP SCHEMA "${schema}" CASCADE`);
    throw err;
  }
  const transaction = db.transaction.bind(db);
  const transactionSpy = vi.spyOn(db, "transaction").mockImplementation((callback, config) =>
    transaction(async tx => {
      await tx.execute(sql.raw(`SET LOCAL search_path TO "${schema}", pg_catalog`));
      return callback(tx);
    }, config));
  // pg/drizzle use promise queries in this app; no callback queries are needed.
  const querySpy = vi.spyOn(pool, "query").mockImplementation((async (config: unknown, values?: unknown[]) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
      const result = await client.query(config as string, values);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }) as typeof pool.query);
  return {
    async cleanup() {
      querySpy.mockRestore();
      transactionSpy.mockRestore();
      await query(`DROP SCHEMA "${schema}" CASCADE`);
    },
  };
}
