import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(), clientQuery: vi.fn(), release: vi.fn(), connect: vi.fn(),
}));
vi.mock("@workspace/db", () => ({
  pool: { query: mocks.poolQuery, connect: mocks.connect },
}));
vi.mock("../../middlewares/requireAuth", () => ({
  requireRole: () => (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
    if (req.headers.authorization !== "Bearer synthetic-admin") return res.status(403).json({ error: "Forbidden" });
    req.currentUser = { id: 42, role: "admin", name: "Administrador de teste" };
    next();
  },
}));
import router from "../exportRecovery";

let server: Server;
let base: string;
const row = {
  id: 101, status: "disponivel_exportacao", integrationId: "EXP-SYNTHETIC",
  exportedAt: null, exportedBy: null, awaitingConfirmation: true,
};
const confirmation = {
  reservations: [{ id: row.id, integrationId: row.integrationId }],
  confirmedNotExported: true, reason: "Conferência externa sintética, sem exportação.",
};

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/diarias/export", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/diarias/export`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.poolQuery.mockResolvedValue({ rows: [row] });
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  mocks.clientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FOR UPDATE")) return { rows: [row] };
    if (sql.includes("UPDATE diarias")) return { rows: [{ id: row.id }] };
    if (sql.includes("information_schema")) return { rows: [{ present: true }] };
    return { rows: [] };
  });
});
async function post(path: string, body: unknown, token = "synthetic-admin") {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const result = await response.json() as {
    eligible?: unknown[]; skipped?: unknown[]; released?: number; releasedIds?: number[]; error?: string;
  };
  return { status: response.status, body: result };
}

describe("export reservation recovery (fully mocked, no database access)", () => {
  it.each(["", "synthetic-gestor"])("rejects unauthenticated/non-admin access (%s)", async (token) => {
    for (const path of ["/recovery/preview", "/recovery"]) {
      expect((await post(path, path.endsWith("preview") ? { diariaIds: [101] } : confirmation, token)).status).toBe(token ? 403 : 401);
    }
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("previews only failed available reservations, with no writes", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [
      row, { ...row, id: 102, awaitingConfirmation: false },
      { ...row, id: 103, status: "exportada" }, { ...row, id: 104, status: "paga" },
      { ...row, id: 105, integrationId: null },
    ] });
    const result = await post("/recovery/preview", { diariaIds: [101, 102, 103, 104, 105, 106] });
    expect(result.status).toBe(200);
    expect(result.body.eligible).toEqual([{ id: 101, integrationId: row.integrationId }]);
    expect(result.body.skipped).toHaveLength(5);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each([{ diariaIds: [] }, { diariaIds: [1, 1] }, { diariaIds: ["101"] }, { diariaIds: [-1] }])("rejects invalid selection $diariaIds", async ({ diariaIds }) => {
    expect((await post("/recovery/preview", { diariaIds })).status).toBe(400);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
  it.each([
    { ...confirmation, confirmedNotExported: false },
    { ...confirmation, reason: "curto" },
    { ...confirmation, reservations: [{ id: 101 }] },
  ])("requires explicit confirmation, reason and exact reference", async (body) => {
    expect((await post("/recovery", body)).status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("releases only the reservation, preserving financial state and auditing atomically", async () => {
    const result = await post("/recovery", confirmation);
    expect(result).toEqual({ status: 200, body: { released: 1, releasedIds: [101] } });
    const commands = mocks.clientQuery.mock.calls.map((args) => args[0]);
    const update = commands.find((sql) => sql.includes("UPDATE diarias"));
    expect(update).toContain("d.integration_id = expected.reference");
    expect(update).toContain("d.status = 'disponivel_exportacao'");
    expect(update).toContain("d.exported_at IS NULL");
    expect(update).not.toMatch(/SET\s+(status|value|payment_date)/);
    const auditIndex = commands.findIndex((sql) => sql.includes("INSERT INTO audit_logs"));
    expect(auditIndex).toBeGreaterThan(commands.findIndex((sql) => sql.includes("UPDATE diarias")));
    expect(commands.indexOf("COMMIT")).toBeGreaterThan(auditIndex);
    expect(commands[auditIndex]).toContain("user_name_at_action");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it.each([
    { ...row, integrationId: "EXP-NEWER" },
    { ...row, awaitingConfirmation: false },
    { ...row, status: "exportada" },
    { ...row, status: "paga" },
    { ...row, exportedAt: "2026-09-07" },
  ])("never releases a changed, active or already integrated reservation", async (current) => {
    mocks.clientQuery.mockImplementation(async (sql: string) => ({
      rows: sql.includes("FOR UPDATE") ? [current] : [],
    }));
    expect((await post("/recovery", confirmation)).status).toBe(409);
    expect(mocks.clientQuery.mock.calls.some((args) => args[0].includes("UPDATE diarias"))).toBe(false);
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });
  it("rolls back the release when audit persistence fails", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FOR UPDATE")) return { rows: [row] };
      if (sql.includes("UPDATE diarias")) return { rows: [{ id: 101 }] };
      if (sql.includes("information_schema")) return { rows: [{ present: false }] };
      if (sql.includes("INSERT INTO audit_logs")) throw new Error("Synthetic audit failure");
      return { rows: [] };
    });
    expect((await post("/recovery", confirmation)).status).toBe(503);
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.clientQuery).not.toHaveBeenCalledWith("COMMIT");
  });
});
