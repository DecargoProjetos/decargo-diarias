import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { request } from "node:http";
import type { Server } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { ExportAttempt } from "@workspace/api-zod";

const mocks = vi.hoisted(() => ({ query: vi.fn(), update: vi.fn(), insert: vi.fn(), select: vi.fn(), transaction: vi.fn(), audit: vi.fn() }));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../../lib/db/src/schema"),
  pool: { query: mocks.query },
  db: { update: mocks.update, select: mocks.select, transaction: mocks.transaction },
}));
vi.mock("../../lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("../../middlewares/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (req: express.Request, res: express.Response, next: () => void) => {
    if (req.headers["x-test-role"] !== "admin") { res.sendStatus(403); return; }
    req.currentUser = { id: 1, name: "Admin fictício", role: "admin" } as never;
    next();
  },
}));
import router from "../diarias";
import { exportAttemptsTable } from "@workspace/db";

const nativeFetch = globalThis.fetch;
type Row = { id: number; exportTarget: string; integrationId: string | null; status: string; providerDecargoId: string; cnpj: string; workDate: string; value: string; paymentDate: string };
let rows: Row[];
let store: Map<string, { integrationRef: string; snapshot: unknown; createdAt: Date; updatedAt: Date }>;
let server: Server;
let base: string;
let release: () => void;
let reachedSecondBatch: Promise<void>;
let sent: () => void;
let posts: number;

function params(condition: SQL) { return new PgDialect().sqlToQuery(condition).params; }
beforeEach(async () => {
  vi.resetAllMocks();
  store = new Map();
  rows = Array.from({ length: 1001 }, (_, index) => ({
    id: index + 1, exportTarget: "diaria_extra", integrationId: null, status: "disponivel_exportacao",
    providerDecargoId: String(index + 1), cnpj: String(index + 1).padStart(14, "0"),
    workDate: "2026-10-01", value: "100", paymentDate: "2026-10-31",
  }));
  mocks.query.mockImplementation(async () => ({ rows }));
  mocks.insert.mockImplementation(() => ({
    values: async (value: { integrationRef: string; snapshot: unknown }) => {
      store.set(value.integrationRef, { ...value, snapshot: JSON.parse(JSON.stringify(value.snapshot)), createdAt: new Date(), updatedAt: new Date() });
    },
  }));
  mocks.update.mockImplementation(table => ({
    set: (values: Record<string, unknown>) => ({
      where: (condition: SQL) => {
        const args = params(condition);
        const ref = args.find(p => typeof p === "string" && p.startsWith("EXP-")) as string;
        if (table === exportAttemptsTable) {
          const row = store.get(ref)!;
          Object.assign(row, values, { snapshot: JSON.parse(JSON.stringify(values.snapshot)) });
          return Promise.resolve();
        }
        const ids = args.filter((p): p is number => typeof p === "number");
        const matching = rows.filter(row => ids.includes(row.id) && (
          args.includes("disponivel_exportacao") ? row.status === "disponivel_exportacao" && row.integrationId === null
          : !ref || row.integrationId === ref
        ));
        matching.forEach(row => Object.assign(row, values));
        const result = Promise.resolve() as Promise<void> & { returning: () => Promise<{ id: number }[]> };
        result.returning = async () => matching.map(row => ({ id: row.id }));
        return result;
      },
    }),
  }));
  mocks.transaction.mockImplementation(async callback => {
    const previousRows = rows.map(row => ({ ...row }));
    const previousStore = new Map(store);
    try {
      return await callback({ update: mocks.update, insert: mocks.insert });
    } catch (error) {
      rows = previousRows;
      store = previousStore;
      throw error;
    }
  });
  mocks.select.mockImplementation(() => {
    let ref: string | undefined;
    const chain = {
      from: () => chain, orderBy: () => chain,
      where: (condition: SQL) => { ref = params(condition)[0] as string; return chain; },
      limit: async (count: number) => [...store.values()].filter(row => !ref || row.integrationRef === ref).slice(0, count),
    };
    return chain;
  });
  posts = 0;
  reachedSecondBatch = new Promise(resolve => { sent = resolve; });
  vi.stubEnv("PEOPLE_API_URL", "https://people.test");
  vi.stubEnv("DECARGO_PEOPLE_API_KEY", "synthetic-key");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/diarias", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}/api/diarias/export/attempts`;
});
afterEach(async () => {
  release?.();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function mockPeople(failSecond: boolean, target: string) {
  vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
    if (!input.startsWith("https://people.test/api/integration/")) throw new Error(`Blocked unexpected network: ${input}`);
    if (init.method === "GET") return new Response(JSON.stringify({
      service: "people-financial-integration", version: 2, ready: true,
      supportedTargets: ["diarias", "descontos"],
    }));
    posts++;
    if (posts === 2) {
      sent();
      await new Promise<void>(resolve => { release = resolve; });
      if (failSecond) throw new Error("Synthetic connection loss after remote receipt");
    }
    const errors = posts === 1 ? [
      target === "falta" ? { cnpj: rows[0].cnpj } : { id_prestador: 1, dia_trabalhado: rows[0].workDate },
    ] : [];
    return new Response(JSON.stringify({ total: 500, inserted: 499, errors }));
  }));
}
async function read(): Promise<ExportAttempt[]>;
async function read(path: string): Promise<ExportAttempt>;
async function read(path = ""): Promise<ExportAttempt | ExportAttempt[]> {
  const response = await nativeFetch(`${base}${path}`, { headers: { "x-test-role": "admin" } });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return await response.json() as ExportAttempt | ExportAttempt[];
}
async function disconnect() {
  const client = request(base.replace("/attempts", ""), {
    method: "POST", headers: { "Content-Type": "application/json", "x-test-role": "admin" },
  });
  client.on("error", () => {}); // Deliberately destroy the browser connection.
  client.end(JSON.stringify({ diariaIds: rows.map(row => row.id) }));
  await reachedSecondBatch;
  client.destroy();
}

describe("persistent progress after losing the browser connection (no real database or People)", () => {
  it.each(["diaria_extra", "falta"])("retains all four outcomes and never resends an uncertain %s batch on consultation", async target => {
    rows.forEach(row => { row.exportTarget = target; });
    mockPeople(true, target);
    await disconnect();
    const [running] = await read();
    expect(running).toMatchObject({ status: "running", rejected: [1], unsent: [1001] });
    expect(running.confirmed).toHaveLength(499);
    expect(running.uncertain).toHaveLength(500);
    release();
    await vi.waitFor(() => expect([...store.values()][0].snapshot).toMatchObject({ status: "interrupted" }));
    // A new screen knows no client-side reference; it discovers the persisted attempt.
    const [reopened] = await read();
    const later = await read(`/${reopened.integrationRef}`);
    expect(later).toMatchObject({
      status: "interrupted", rejected: [1], unsent: [1001],
      confirmed: Array.from({ length: 499 }, (_, i) => i + 2),
      uncertain: Array.from({ length: 500 }, (_, i) => i + 501),
    });
    expect(posts).toBe(2);
    expect(rows[0].integrationId).toBeNull();
    expect(rows[1000].integrationId).toBeNull();
    expect(rows[500].integrationId).toBe(reopened.integrationRef);
    expect(rows[1].status).toBe("exportada");
    const retry = await nativeFetch(base.replace("/attempts", ""), {
      method: "POST", headers: { "Content-Type": "application/json", "x-test-role": "admin" },
      body: JSON.stringify({ diariaIds: [501] }),
    });
    expect(retry.status).toBe(409);
    expect(posts).toBe(2);
  });
  it("continues a successful export after disconnect and makes the final receipt consultable", async () => {
    mockPeople(false, "diaria_extra");
    await disconnect();
    release();
    await vi.waitFor(() => expect([...store.values()][0].snapshot).toMatchObject({ status: "completed" }));
    const [attempt] = await read();
    expect(attempt).toMatchObject({ status: "completed", rejected: [1], uncertain: [], unsent: [] });
    expect(attempt.confirmed).toHaveLength(1000);
    expect(posts).toBe(3);
  });
  it("does not expose attempts to non-admins and reports unknown references", async () => {
    expect((await nativeFetch(base)).status).toBe(403);
    expect((await nativeFetch(`${base}/missing`, { headers: { "x-test-role": "admin" } })).status).toBe(404);
    expect(posts).toBe(0);
  });
  it("does not send or retain reservations if the persistent attempt cannot be created", async () => {
    mockPeople(false, "diaria_extra");
    mocks.insert.mockImplementationOnce(() => ({ values: async () => { throw new Error("Synthetic journal write failure"); } }));
    const response = await nativeFetch(base.replace("/attempts", ""), {
      method: "POST", headers: { "Content-Type": "application/json", "x-test-role": "admin" },
      body: JSON.stringify({ diariaIds: [1] }),
    });
    expect(response.status).toBe(500);
    expect(posts).toBe(0);
    expect(rows[0].integrationId).toBeNull();
    expect(store.size).toBe(0);
  });
  it.each(["before", "after"])("stops safely when the journal fails %s a financial POST", async phase => {
    mockPeople(false, "diaria_extra");
    const normalUpdate = mocks.update.getMockImplementation()!;
    let failed = false;
    mocks.update.mockImplementation(table => {
      if (table !== exportAttemptsTable) return normalUpdate(table);
      return {
        set: (values: { snapshot: { status: string; confirmed: number[] } }) => {
          if (!failed && values.snapshot.status === "running" && (
            phase === "before" || values.snapshot.confirmed.length > 0
          )) {
            failed = true;
            return { where: async () => { throw new Error("Synthetic progress write failure"); } };
          }
          return normalUpdate(table).set(values);
        },
      };
    });
    const response = await nativeFetch(base.replace("/attempts", ""), {
      method: "POST", headers: { "Content-Type": "application/json", "x-test-role": "admin" },
      body: JSON.stringify({ diariaIds: rows.map(row => row.id) }),
    });
    expect(response.status).toBe(502);
    const [attempt] = await read();
    expect(attempt.status).toBe("interrupted");
    expect(attempt.uncertain).toEqual([]);
    expect(posts).toBe(phase === "before" ? 0 : 1);
    expect(attempt.confirmed).toHaveLength(phase === "before" ? 0 : 499);
    expect(attempt.rejected).toEqual(phase === "before" ? [] : [1]);
    expect(attempt.unsent).toHaveLength(phase === "before" ? 1001 : 501);
    expect(rows[1000].integrationId).toBeNull();
  });
  it("shows stale progress as interrupted without changing stored evidence or sending anything", async () => {
    store.set("EXP-old", {
      integrationRef: "EXP-old", createdAt: new Date(0), updatedAt: new Date(0),
      snapshot: { integrationRef: "EXP-old", status: "running", confirmed: [1], rejected: [], uncertain: [2], unsent: [3] },
    });
    expect(await read("/EXP-old")).toMatchObject({ status: "interrupted", confirmed: [1], uncertain: [2], unsent: [3] });
    expect(store.get("EXP-old")!.snapshot).toMatchObject({ status: "running" });
    expect(posts).toBe(0);
  });
});
