import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Funcionario } from "../../lib/peopleClient";

// Deliberately no real database connection or credentials in these regressions.
const state = vi.hoisted(() => ({
  users: [] as Array<{ id: number; decargoId: string; name: string; email: string; active: boolean; role: string }>,
  remote: [] as Funcionario[],
  reports: [] as Array<{ id: string; completedAt: Date; expiresAt: Date; result: unknown }>,
  failReportWrite: false,
  failRead: false,
  remoteError: false,
  insert: vi.fn(), audit: vi.fn(), globalAudit: vi.fn(), fetchRemote: vi.fn(), providerInsert: vi.fn(),
  usersTable: {}, providersTable: {},
  commit: vi.fn(), rollback: vi.fn(), info: vi.fn(), error: vi.fn(),
  history: [] as object[],
  failAudit: false, failImport: false, failFetch: false,
}));
vi.mock("@workspace/db", async () => {
  // Schema only; never import the package's database client.
  const { userSyncReportsTable } = await import("../../../../../lib/db/src/schema/user-sync-reports");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const auditLogsTable = {};
  return {
  usersTable: state.usersTable, providersTable: state.providersTable, teamsTable: {}, auditLogsTable,
  userSyncReportsTable,
  pool: { query: vi.fn(), connect: vi.fn(async () => ({ query: vi.fn(), release: vi.fn() })) },
  db: {
    select: (fields?: unknown) => {
      if (state.failRead) throw new Error("history unavailable");
      return { from: () => ({
      where: (predicate: Parameters<InstanceType<typeof PgDialect>["sqlToQuery"]>[0]) => {
        const params = new PgDialect().sqlToQuery(predicate).params as string[];
        const id = params.length > 1 ? params[0] : null;
        const timestamp = params.at(-1)!;
        const now = new Date(timestamp);
        const rows = state.reports.map((row, index) => ({ ...row, runOrder: index }))
          .filter(row => row.expiresAt > now && (!id || row.id === id))
          .sort((a, b) => +b.completedAt - +a.completedAt || b.runOrder - a.runOrder)
          .map(row => fields ? {
            id: row.id, completedAt: row.completedAt, expiresAt: row.expiresAt,
            synced: (row.result as { synced: number }).synced,
            created: (row.result as { created: number }).created,
            skipped: (row.result as { skipped: number }).skipped,
            conflicts: (row.result as { conflicts: number }).conflicts,
          } : row);
        const limit = (count: number) => Object.assign(Promise.resolve(rows.slice(0, count)), {
          offset: async (offset: number) => rows.slice(offset, offset + count),
        });
        return { orderBy: () => ({ limit }), limit };
      },
    }) };
    },
    delete: () => ({ where: async (predicate: Parameters<InstanceType<typeof PgDialect>["sqlToQuery"]>[0]) => {
      const [timestamp] = new PgDialect().sqlToQuery(predicate).params as string[];
      const now = new Date(timestamp);
      state.reports = state.reports.filter(row => row.expiresAt > now);
    } }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const pendingUsers = structuredClone(state.users);
      const pendingHistory = structuredClone(state.history);
      const pendingReports = structuredClone(state.reports);
      try {
        const result = await callback({
          execute: vi.fn(),
          select: () => ({ from: async (table: unknown) => table === state.usersTable ? [...pendingUsers] : [] }),
          insert: (table: unknown) => ({
            values: (value: object) => {
              if (table === state.providersTable) {
                state.providerInsert(value);
                return Promise.resolve();
              }
              if (table === auditLogsTable) {
                state.audit(value);
                if (state.failAudit) return Promise.reject(new Error("audit failed: private@example.invalid"));
                pendingHistory.push(value);
                return Promise.resolve();
              }
              if (table === userSyncReportsTable) {
                if (state.failReportWrite) throw new Error("report database unavailable");
                pendingReports.push(value as typeof state.reports[number]);
                return Promise.resolve();
              }
              return { returning: async () => {
                state.insert(value);
                if (state.failImport) throw new Error("insert failed: private@example.invalid");
                const user = {
                  id: 100 + pendingUsers.length, teamId: null,
                  ...(value as Omit<typeof state.users[number], "id">),
                };
                pendingUsers.push(user);
                return [user];
              } };
            },
          }),
        });
        state.users = pendingUsers;
        state.history = pendingHistory;
        state.reports = pendingReports;
        state.commit();
        return result;
      } catch (err) {
        state.rollback();
        throw err;
      }
    },
    },
  };
});
vi.mock("../../lib/peopleClient", () => ({ fetchFuncionarios: async () => {
  state.fetchRemote();
  if (state.remoteError) throw new Error("upstream unavailable");
  if (state.failFetch) throw new Error("upstream failed: private@example.invalid");
  return state.remote;
} }));
vi.mock("../../lib/peopleUserSync", () => ({
  peopleUserSyncEnabled: () => false, getPeopleSyncAccess: vi.fn(), PeopleUserSyncError: class extends Error {},
}));
vi.mock("../../lib/audit", () => ({ logAudit: state.globalAudit }));
vi.mock("../../middlewares/requireAuth", () => ({
  requireAuth: vi.fn(),
  requireRole: () => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers["x-test-role"] !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    next();
  },
}));
import router from "../users";
import { SyncUsersResponse, GetLatestUserSyncReportResponse, ListUserSyncReportsResponse, GetUserSyncReportResponse } from "@workspace/api-zod";
import { pruneUserSyncReports, makeUserSyncReport, initializeUserSyncReports, getUserSyncReport } from "../../lib/userSyncReports";

let server: Server, base: string;
const source = (id: number, email: string | null, demitido = false): Funcionario =>
  ({ id_funcionario: id, nome: `Pessoa ${id}`, email_principal: email, demitido });

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { info: state.info, error: state.error } as unknown as typeof req.log;
    req.currentUser = { id: 1 } as typeof req.currentUser;
    next();
  });
  app.use("/users", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

describe("Manual registration remains independent of enablement", () => {
  it("creates the normalized user and provider with the creation body", async () => {
    const response = await fetch(`${base}/users`, {
      method: "POST", headers: { "x-test-role": "admin", "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  Pessoa   Local  ", email: " LOCAL@example.invalid ",
        role: "gestor", active: false, dailyRate: 123.45,
      }),
    });
    expect(response.status).toBe(201);
    const created = await response.json() as { id: number; decargoId: string };
    expect(created.decargoId).toMatch(/^manual-/);
    expect(state.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      name: "Pessoa Local", email: "local@example.invalid", role: "gestor", active: false,
    }));
    expect(state.providerInsert).toHaveBeenCalledExactlyOnceWith({
      decargoId: created.decargoId, name: "Pessoa Local", email: "local@example.invalid",
      teamId: null, active: false, dailyRate: "123.45",
    });
    expect(state.globalAudit).toHaveBeenCalledWith(expect.objectContaining({
      entityId: created.id, action: "criado manualmente",
    }));
  });
  it("rejects a duplicate without creating or enabling another person", async () => {
    state.users = [{ id: 2, decargoId: "manual-existing", email: "local@example.invalid", name: "Pessoa Local", active: false, role: "gestor" }];
    const response = await fetch(`${base}/users`, {
      method: "POST", headers: { "x-test-role": "admin", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pessoa Local", email: "local@example.invalid", role: "gestor" }),
    });
    expect(response.status).toBe(409);
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.providerInsert).not.toHaveBeenCalled();
  });
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  state.users = []; state.remote = []; state.reports = []; state.history = [];
  state.failReportWrite = false; state.failRead = false; state.remoteError = false;
  state.failAudit = false; state.failImport = false; state.failFetch = false;
  vi.clearAllMocks();
});

describe("POST /users/sync administrative report", () => {
  it("returns conflicts while importing safe employees and preserves local accounts", async () => {
    state.users = [{ id: 2, decargoId: "10", email: "old@example.invalid", name: "Inativa", active: false, role: "gestor" }];
    const original = structuredClone(state.users[0]);
    state.remote = [
      source(10, "new@example.invalid"), source(20, " SAFE@example.invalid ", true),
      source(30, null), source(40, "DUP@example.invalid"), source(41, " dup@example.invalid "),
    ];
    const response = await fetch(`${base}/users/sync`, { method: "POST", headers: { "x-test-role": "admin" } });
    expect(response.status).toBe(200);
    const data = SyncUsersResponse.parse(await response.json());
    expect(data).toMatchObject({ synced: 5, created: 1, skipped: 1, conflicts: 3 });
    expect(data.conflictDetails).toHaveLength(3);
    expect(data.conflictDetails[0].localAccounts[0]).toMatchObject({ localUserId: 2, active: false });
    expect(state.users[0]).toEqual(original);
    expect(state.commit).toHaveBeenCalledOnce();
    expect(state.globalAudit).not.toHaveBeenCalled();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toEqual({
      entityType: "user", entityId: 0, action: "sync", userId: 1,
      newValues: { synced: 5, created: 1, skipped: 1, conflicts: 3, timestamp: expect.any(Date) },
    });
    expect(JSON.stringify(state.history)).not.toMatch(/example\.invalid|Pessoa|Inativa|conflictDetails|employeeId/);
    expect(state.insert).toHaveBeenCalledExactlyOnceWith({
      decargoId: "20", name: "Pessoa 20", email: "safe@example.invalid", role: "prestador", active: false,
    });
    // A repeated attempt does not reactivate or update the imported employee.
    const repeated = await fetch(`${base}/users/sync`, { method: "POST", headers: { "x-test-role": "admin" } });
    expect(await repeated.json()).toMatchObject({ created: 0, skipped: 2, conflicts: 3 });
    expect(state.insert).toHaveBeenCalledTimes(1);
  });

  it("returns an empty report when no employee conflicts", async () => {
    const response = await fetch(`${base}/users/sync`, { method: "POST", headers: { "x-test-role": "admin" } });
    expect(await response.json()).toEqual({ synced: 0, created: 0, skipped: 0, conflicts: 0, conflictDetails: [] });
    expect(state.history).toHaveLength(1);
  });

  it("rolls back all imports if audit fails, keeps accounts intact and allows a safe retry", async () => {
    state.users = [{ id: 2, decargoId: "10", email: "existing@example.invalid", name: "Inativa", active: false, role: "gestor" }];
    state.remote = [source(10, "existing@example.invalid"), source(20, "first@example.invalid"), source(30, "second@example.invalid")];
    const before = structuredClone(state.users);
    const previousReport = makeUserSyncReport({ synced: 0, created: 0, skipped: 0, conflicts: 0, conflictDetails: [] });
    state.reports = [previousReport];
    state.failAudit = true;
    const response = await fetch(`${base}/users/sync`, { method: "POST", headers: { "x-test-role": "admin" } });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "USER_SYNC_NOT_COMMITTED",
      error: "Não foi possível concluir a sincronização. Nenhum usuário foi importado nesta tentativa. Tente novamente.",
    });
    expect(state.insert).toHaveBeenCalledTimes(2);
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.users).toEqual(before);
    expect(state.history).toEqual([]);
    expect(state.reports).toEqual([previousReport]);
    expect(state.commit).not.toHaveBeenCalled();
    expect(state.rollback).toHaveBeenCalledOnce();
    expect(state.globalAudit).not.toHaveBeenCalled();
    expect(state.info).not.toHaveBeenCalledWith(expect.anything(), "User sync complete");
    expect(JSON.stringify(state.error.mock.calls)).not.toContain("private@example.invalid");

    state.failAudit = false;
    const retry = await fetch(`${base}/users/sync`, { method: "POST", headers: { "x-test-role": "admin" } });
    expect(retry.status).toBe(200);
    expect(SyncUsersResponse.parse(await retry.json())).toMatchObject({ created: 2, skipped: 1, conflicts: 0 });
    expect(state.users).toHaveLength(3);
    expect(state.users[0]).toEqual(before[0]);
    expect(state.history).toHaveLength(1);
    expect(state.reports).toHaveLength(2);
    expect(state.commit).toHaveBeenCalledOnce();
  });

  it("does not write history or report success if importing fails", async () => {
    state.remote = [source(20, "safe@example.invalid")];
    state.failImport = true;
    const response = await fetch(`${base}/users/sync`, { method: "POST", headers: { "x-test-role": "admin" } });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "USER_SYNC_NOT_COMMITTED" });
    expect(state.users).toEqual([]);
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.history).toEqual([]);
    expect(state.rollback).toHaveBeenCalledOnce();
    expect(state.commit).not.toHaveBeenCalled();
  });

  it("distinguishes an upstream failure without importing or leaking error details", async () => {
    state.failFetch = true;
    const response = await fetch(`${base}/users/sync`, { method: "POST", headers: { "x-test-role": "admin" } });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Não foi possível consultar os funcionários no DECARGO People. Tente novamente.",
      code: "PEOPLE_FETCH_FAILED",
    });
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.commit).not.toHaveBeenCalled();
    expect(state.rollback).not.toHaveBeenCalled();
  });

  it("does not expose conflict evidence to non-admin callers", async () => {
    const response = await fetch(`${base}/users/sync`, { method: "POST", headers: { "x-test-role": "gestor" } });
    expect(response.status).toBe(403);
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
});

describe("persisted user sync reports", () => {
  const read = (role = "admin") => fetch(`${base}/users/sync-reports/latest`, { headers: { "x-test-role": role } });
  const run = () => fetch(`${base}/users/sync`, { method: "POST", headers: { "x-test-role": "admin" } });

  it("serves the saved snapshot after a new request without contacting People", async () => {
    state.users = [{ id: 2, decargoId: "10", email: "old@example.invalid", name: "Nome original", active: false, role: "gestor" }];
    state.remote = [source(10, "new@example.invalid"), source(20, "safe@example.invalid")];
    const result = await (await run()).json();
    state.users[0].name = "Nome atual";
    const response = await read();
    const body = GetLatestUserSyncReportResponse.parse(await response.json());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.retentionDays).toBe(30);
    expect(body.report?.result).toEqual(result);
    expect(JSON.stringify(body.report)).toContain("Nome original");
    expect(JSON.stringify(body.report)).not.toContain("Nome atual");
    expect(JSON.stringify(body.report)).not.toContain("safe@example.invalid");
    expect(+new Date(body.report!.expiresAt) - +new Date(body.report!.completedAt)).toBe(30 * 86400_000);
    expect(state.fetchRemote).toHaveBeenCalledTimes(1);
  });

  it("returns null with no history, including when the newest report has expired", async () => {
    expect(await (await read()).json()).toEqual({ report: null, retentionDays: 30 });
    state.reports.push(makeUserSyncReport({ synced: 0, created: 0, skipped: 0, conflicts: 0, conflictDetails: [] },
      new Date(Date.now() - 31 * 86400_000)));
    expect(await (await read()).json()).toEqual({ report: null, retentionDays: 30 });
    await pruneUserSyncReports();
    expect(state.reports).toEqual([]);
    expect(state.fetchRemote).not.toHaveBeenCalled();
  });

  it("keeps per-run summaries and replaces the displayed conflict report with the latest zero-conflict run", async () => {
    state.remote = [source(10, "same@example.invalid"), source(11, "same@example.invalid")];
    await run();
    state.reports[0].completedAt = new Date(Date.now() - 1000);
    state.remote = [];
    await run();
    const body = await (await read()).json() as { report: { result: { conflicts: number } } };
    expect(body.report.result.conflicts).toBe(0);
    expect(state.reports).toHaveLength(2);
  });

  it("preserves the last completed report when a subsequent People attempt fails", async () => {
    await run();
    const saved = await (await read()).json();
    state.remoteError = true;
    expect((await run()).status).toBe(502);
    expect(await (await read()).json()).toEqual(saved);
    expect(state.reports).toHaveLength(1);
    expect(state.fetchRemote).toHaveBeenCalledTimes(2);
  });

  it("rolls back new employees if the report cannot be persisted", async () => {
    state.remote = [source(10, "safe@example.invalid")];
    state.failReportWrite = true;
    expect((await run()).status).toBe(500);
    expect(state.users).toEqual([]);
    expect(state.reports).toEqual([]);
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("reports a history outage explicitly, never as an empty report or a new import", async () => {
    state.failRead = true;
    const response = await read();
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty("error");
    expect(state.fetchRemote).not.toHaveBeenCalled();
  });

  it("never serves evidence at the exact expiration boundary", async () => {
    const now = new Date();
    state.reports.push(makeUserSyncReport({ synced: 0, created: 0, skipped: 0, conflicts: 0, conflictDetails: [] },
      new Date(now.getTime() - 30 * 86400_000)));
    await pruneUserSyncReports(now);
    expect(state.reports).toEqual([]);
  });

  it.each(["gestor", "funcionario", "prestador", ""])("does not expose the history to %s", async role => {
    expect((await read(role)).status).toBe(403);
    expect(state.fetchRemote).not.toHaveBeenCalled();
  });

  it("purges expired evidence on startup without changing unexpired reports", async () => {
    const result = { synced: 0, created: 0, skipped: 0, conflicts: 0, conflictDetails: [] };
    state.reports.push(makeUserSyncReport(result, new Date(Date.now() - 31 * 86400_000)), makeUserSyncReport(result));
    await initializeUserSyncReports();
    expect(state.reports).toHaveLength(1);
  });
});

describe("browsing retained executions", () => {
  const read = (path: string, role = "admin") => fetch(`${base}/users/sync-reports${path}`, { headers: { "x-test-role": role } });
  const result = { synced: 0, created: 0, skipped: 0, conflicts: 0, conflictDetails: [] };

  it("paginates metadata only, newest first, with a stable tie breaker and without People", async () => {
    const date = new Date();
    state.reports.push(makeUserSyncReport(result, date), makeUserSyncReport(result, date),
      makeUserSyncReport(result, new Date(date.getTime() - 1000)),
      makeUserSyncReport(result, new Date(date.getTime() - 31 * 86400_000)));
    const response = await read("?page=1&pageSize=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const first = ListUserSyncReportsResponse.parse(await response.json());
    expect(first).toMatchObject({ page: 1, pageSize: 1, hasMore: true, retentionDays: 30 });
    expect(first.reports[0].id).toBe(state.reports[1].id);
    const second = ListUserSyncReportsResponse.parse(await (await read("?page=2&pageSize=1")).json());
    expect(second.reports[0].id).toBe(state.reports[0].id);
    const third = ListUserSyncReportsResponse.parse(await (await read("?page=3&pageSize=1")).json());
    expect(third).toMatchObject({ hasMore: false });
    expect(third.reports[0].id).toBe(state.reports[2].id);
    expect(await (await read("?page=4&pageSize=1")).json()).toMatchObject({ reports: [], hasMore: false });
    expect(Object.keys(first.reports[0]).sort()).toEqual(
      ["id", "completedAt", "expiresAt", "synced", "created", "skipped", "conflicts"].sort());
    expect(state.fetchRemote).not.toHaveBeenCalled();
  });

  it("reads the requested older snapshot, never substituting the newest or current person", async () => {
    state.users = [{ id: 2, decargoId: "10", email: "old@example.invalid", name: "Nome histórico", active: false, role: "gestor" }];
    state.remote = [source(10, "new@example.invalid")];
    await fetch(`${base}/users/sync`, { method: "POST", headers: { "x-test-role": "admin" } });
    const historical = state.reports[0];
    state.users[0].name = "Nome atual";
    state.reports.push(makeUserSyncReport(result));
    state.fetchRemote.mockClear();
    const response = await read(`/${historical.id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = GetUserSyncReportResponse.parse(await response.json());
    expect(body.id).toBe(historical.id);
    expect(body.result.conflicts).toBe(1);
    expect(JSON.stringify(body)).toContain("Nome histórico");
    expect(JSON.stringify(body)).not.toContain("Nome atual");
    expect(state.fetchRemote).not.toHaveBeenCalled();
  });

  it("rejects expired and unknown IDs on direct access even before pruning", async () => {
    const now = new Date();
    const expired = makeUserSyncReport(result, new Date(now.getTime() - 30 * 86400_000));
    state.reports.push(expired);
    expect(await getUserSyncReport(expired.id, now)).toBeNull();
    expect((await read(`/${expired.id}`)).status).toBe(404);
    expect((await read(`/${makeUserSyncReport(result).id}`)).status).toBe(404);
    expect(await (await read("")).json()).toMatchObject({ reports: [], hasMore: false });
    expect(state.reports).toHaveLength(1);
  });

  it.each(["?page=0", "?page=1.5", "?page=10001", "?pageSize=0", "?pageSize=51",
    "?pageSize=2.5", "?page=abc", "/not-a-uuid"])("rejects invalid input %s", async path => {
    expect((await read(path)).status).toBe(400);
    expect(state.fetchRemote).not.toHaveBeenCalled();
  });

  it.each(["gestor", "funcionario", "prestador", ""])("protects both new endpoints from %s", async role => {
    expect((await read("", role)).status).toBe(403);
    expect((await read(`/${makeUserSyncReport(result).id}`, role)).status).toBe(403);
    expect(state.fetchRemote).not.toHaveBeenCalled();
  });

  it("reports history failures as 503 rather than empty success or missing runs", async () => {
    state.failRead = true;
    expect((await read("")).status).toBe(503);
    expect((await read(`/${makeUserSyncReport(result).id}`)).status).toBe(503);
    expect(state.fetchRemote).not.toHaveBeenCalled();
  });
});
