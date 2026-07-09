import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "@workspace/db";

const PgStore = connectPg(session);

declare module "express-session" {
  interface SessionData {
    userId: number;
    codeVerifier?: string;
    state?: string;
    nonce?: string;
  }
}

const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error("SESSION_SECRET not set");

export const sessionMiddleware = session({
  store: new PgStore({
    pool,
    createTableIfMissing: true,
    tableName: "sessions",
    pruneSessionInterval: 60 * 60, // 1 hour
  }),
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: "lax",
  },
});
