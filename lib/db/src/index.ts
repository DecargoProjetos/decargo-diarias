import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool, types } = pg;

// Postgres DATE (OID 1082) deve chegar como string "yyyy-MM-dd", nunca como
// Date JS — senão vira timestamp UTC na serialização JSON e a data "volta"
// um dia no fuso do Brasil (UTC-3).
types.setTypeParser(1082, (value: string) => value);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
