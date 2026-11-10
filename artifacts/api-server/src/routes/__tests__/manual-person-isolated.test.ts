import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateUserResponse } from "@workspace/api-zod";

// Route regression without importing the database client or using credentials.
const state = vi.hoisted(() => ({
  users: [] as Record<string, unknown>[],
  providers: [] as Record<string, unknown>[],
  teams: [] as Record<string, unknown>[],
  insert: vi.fn(), audit: vi.fn(), transaction: vi.fn(),
  update: vi.fn(), remove: vi.fn(),
}));
vi.mock("@workspace/db", () => {
  const usersTable = { id: "id", name: "users", email: "email" };
  const providersTable = { name: "providers", email: "email" };
  const teamsTable = { name: "teams", id: "id" };
  const rows = (table: unknown) => table === usersTable ? state.users
    : table === providersTable ? state.providers : state.teams;
  return {
    usersTable, providersTable, teamsTable, auditLogsTable: {},
    db: {
      delete: () => ({
        where: () => ({ returning: async () => {
          state.remove();
          return [{ id: 101 }];
        } }),
      }),
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        state.transaction();
        return callback({
          execute: vi.fn(),
          select: () => ({
            from: (table: unknown) => {
              const result = Promise.resolve([...rows(table)]);
              return Object.assign(result, {
                where: () => ({
                  limit: async () => [...rows(table)],
                  for: async () => [...rows(table)],
                }),
              });
            },
          }),
          insert: (table: unknown) => ({
            values: (value: Record<string, unknown>) => {
              state.insert(table, value);
              const record = { id: 101 + rows(table).length, createdAt: "2026-01-01T12:00:00Z", ...value };
              rows(table).push(record);
              return { returning: async () => [record] };
            },
          }),
        });
      },
    },
  };
});
vi.mock("../../lib/peopleClient", () => ({ fetchFuncionarios: vi.fn() }));
vi.mock("../../lib/peopleUserSync", () => ({
  peopleUserSyncEnabled: () => false, getPeopleSyncAccess: vi.fn(), PeopleUserSyncError: class extends Error {},
}));
vi.mock("../../lib/audit", () => ({ logAudit: state.audit }));
vi.mock("../../lib/updatePerson", () => ({
  updatePerson: state.update,
  PersonUpdateError: class extends Error {},
}));
vi.mock("../../middlewares/requireAuth", () => ({
  requireAuth: vi.fn(),
  requireRole: () => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers["x-test-role"] !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  },
}));

import router from "../users";

let server: Server, base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.currentUser = { id: 900, name: "Administrador sintético" } as typeof req.currentUser;
    next();
  });
  app.use("/users", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  state.users = []; state.providers = []; state.teams = [];
  vi.clearAllMocks();
});

const create = (body: unknown, role = "admin") => fetch(`${base}/users`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-test-role": role },
  body: JSON.stringify(body),
});
const person = { name: " Pessoa   Fictícia ", email: " TEST@example.invalid ", role: "funcionario", dailyRate: 123.45 };

describe("POST /users manual registration (isolated)", () => {
  it("creates a normalized user and matching provider, not an enablement response", async () => {
    const response = await create(person);
    expect(response.status).toBe(201);
    const created = CreateUserResponse.parse(await response.json());
    expect(created).toMatchObject({
      id: 101, name: "Pessoa Fictícia", email: "test@example.invalid",
      role: "funcionario", active: true, teamId: null,
    });
    expect(created.decargoId).toMatch(/^manual-/);
    expect(state.users).toHaveLength(1);
    expect(state.providers).toEqual([expect.objectContaining({
      decargoId: created.decargoId, name: created.name, email: created.email,
      dailyRate: "123.45", active: true, teamId: null,
    })]);
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "user", entityId: created.id, action: "criado manualmente",
      actor: { id: 900, name: "Administrador sintético" },
    }));
  });

  it("rejects an enablement body rather than treating it as user registration", async () => {
    const response = await create({ confirmed: true, dailyRate: 100 });
    expect(response.status).toBe(400);
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("rejects existing identities without altering their state", async () => {
    state.providers = [{ name: "Pessoa Fictícia", email: null, active: false, dailyRate: "90.00" }];
    const before = structuredClone(state.providers);
    const response = await create(person);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PERSON_ALREADY_REGISTERED" });
    expect(state.providers).toEqual(before);
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("rejects an unknown team before any insertion", async () => {
    const response = await create({ ...person, teamId: 999 });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TEAM" });
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("does not permit non-admin registration", async () => {
    const response = await create(person, "gestor");
    expect(response.status).toBe(403);
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("keeps explicit enablement separate from registration", async () => {
    state.users = [{
      id: 101, name: "Pessoa Fictícia", email: "test@example.invalid",
      decargoId: "test-user", active: true, teamId: null, role: "funcionario",
    }];
    const response = await fetch(`${base}/users/101/enable-diarias`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "admin" },
      body: JSON.stringify({ confirmed: true, dailyRate: 150 }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ dailyRate: 150, localOnly: true });
    expect(state.users).toHaveLength(1);
    expect(state.providers).toEqual([expect.objectContaining({
      decargoId: "local-user:101", name: "Pessoa Fictícia", dailyRate: "150.00",
    })]);
  });

  it("PATCH uses the atomic update path and never deletes an account", async () => {
    state.update.mockResolvedValue({ id: 101, active: false });
    const response = await fetch(`${base}/users/101`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-role": "admin" },
      body: JSON.stringify({ active: false }),
    });
    expect(response.status).toBe(200);
    expect(state.update).toHaveBeenCalledExactlyOnceWith("user", 101, { active: false },
      { id: 900, name: "Administrador sintético" });
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("keeps DELETE registered separately from PATCH", async () => {
    const response = await fetch(`${base}/users/101`, {
      method: "DELETE", headers: { "x-test-role": "admin" },
    });
    expect(response.status).toBe(200);
    expect(state.remove).toHaveBeenCalledOnce();
    expect(state.update).not.toHaveBeenCalled();
  });
});
