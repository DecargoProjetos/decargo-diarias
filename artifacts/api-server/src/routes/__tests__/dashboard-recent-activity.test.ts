import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { User } from "@workspace/db";
import { GetRecentActivityResponse } from "@workspace/api-zod";
import { linkedProviderSql } from "../../lib/providerIdentity";

const state = vi.hoisted(() => ({
  query: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
  verify: vi.fn(),
}));

// No real DB module or JWT secret is loaded. Keep requireAuth/requireRole real.
vi.mock("@workspace/db", async () => {
  const { pgTable, integer } = await import("drizzle-orm/pg-core");
  return {
    pool: { query: state.query },
    db: { select: state.select },
    usersTable: pgTable("users", { id: integer("id") }),
  };
});
vi.mock("../../lib/localJwt", () => ({ verifyLocalJwt: state.verify }));

import dashboardRouter from "../dashboard";

type Activity = {
  id: number;
  diariaId: number;
  providerName: string;
  teamName: string;
  action: string;
  userId: number | null;
  userName: string | null;
  userNameAtAction: string | null;
  timestamp: string;
  status: string;
};
type Fixture = { providerId: number; activity: Activity };

const baseActivity: Activity = {
  id: 20,
  diariaId: 100,
  providerName: "Pessoa beneficiária",
  teamName: "Equipe A",
  action: "aprovada",
  userId: 3,
  userName: "Responsável atual",
  userNameAtAction: "Responsável na ação",
  timestamp: "2026-10-01T10:00:00.000Z",
  status: "aprovada",
};

let currentUser: User | undefined;
let fixtures: Fixture[];
let linkedProviderId: number | null;
let server: Server;
let base: string;

function user(role: User["role"], overrides: Partial<User> = {}): User {
  return {
    id: 71, decargoId: "external-71", email: "pessoa@example.invalid",
    name: "Pessoa autenticada", role, teamId: 10, active: true,
    avatarUrl: null, createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"), ...overrides,
  };
}

function get(token: string | null = "controlled-token", search = "") {
  return fetch(`${base}/api/dashboard/recent-activity${search}`, {
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
  });
}

function expectActivitySql(scoped: boolean) {
  expect(state.query).toHaveBeenCalledTimes(1);
  const [sql, params] = state.query.mock.calls[0] as [string, unknown[]];
  const normalized = sql.replace(/\s+/g, " ").trim();
  expect(normalized).toContain('al.user_id AS "userId", u.name AS "userName"');
  expect(normalized).toContain('al.user_name_at_action AS "userNameAtAction"');
  expect(normalized).toContain("LEFT JOIN users u ON u.id = al.user_id");
  expect(normalized).toContain("JOIN diarias d ON d.id = al.entity_id");
  expect(normalized).toContain("JOIN providers p ON p.id = d.provider_id");
  expect(normalized).toContain("WHERE al.entity_type = 'diaria'");
  expect(normalized).toContain("ORDER BY al.timestamp DESC LIMIT 20");
  const where = normalized.split(" WHERE al.entity_type = 'diaria'")[1];
  if (scoped) {
    expect(sql).toContain(`p.id = ${linkedProviderSql("$1")}`);
    expect(where).toBe(
      ` AND p.id = ${linkedProviderSql("$1").replace(/\s+/g, " ")} ORDER BY al.timestamp DESC LIMIT 20`,
    );
    expect(where).not.toMatch(/\bal\.user_id\s*=/);
    expect(params).toEqual([currentUser!.id]);
  } else {
    expect(where).toBe(" ORDER BY al.timestamp DESC LIMIT 20");
    expect(params).toEqual([]);
  }
}

beforeAll(async () => {
  const app = express();
  app.use("/api/dashboard", dashboardRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve, reject) =>
  server.close(error => error ? reject(error) : resolve()),
));

beforeEach(() => {
  vi.resetAllMocks();
  currentUser = user("admin");
  linkedProviderId = 11;
  fixtures = [{ providerId: 11, activity: { ...baseActivity } }];
  state.verify.mockReturnValue({ userId: 71 });
  state.limit.mockImplementation(async () => currentUser ? [currentUser] : []);
  state.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: state.limit }) }),
  });
  // Simulate the selected rows; SQL assertions below independently verify the
  // projection, ownership predicate, joins and bound authenticated identity.
  state.query.mockImplementation(async (_sql: string, params: unknown[]) => ({
    rows: fixtures
      .filter(row => params.length === 0 || row.providerId === linkedProviderId)
      .map(row => ({ ...row.activity })),
  }));
});

describe("GET /dashboard/recent-activity (isolated)", () => {
  it("keeps the historical actor distinct from the current user and provider", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const body = GetRecentActivityResponse.parse(await response.json());
    expect(body).toEqual(GetRecentActivityResponse.parse([baseActivity]));
    expect(body[0]).toMatchObject({
      userName: "Responsável atual", userNameAtAction: "Responsável na ação",
    });
    expectActivitySql(false);
  });

  it("preserves the snapshot across a later rename and deletion", async () => {
    const initialResponse = await get();
    expect(initialResponse.status).toBe(200);
    const initial = GetRecentActivityResponse.parse(await initialResponse.json());
    fixtures[0].activity.userName = "Responsável renomeado";
    const renamedResponse = await get();
    expect(renamedResponse.status).toBe(200);
    const renamed = GetRecentActivityResponse.parse(await renamedResponse.json());
    expect(renamed[0]).toEqual({ ...initial[0], userName: "Responsável renomeado" });

    fixtures[0].activity.userId = null;
    fixtures[0].activity.userName = null;
    const deletedResponse = await get();
    expect(deletedResponse.status).toBe(200);
    const deleted = GetRecentActivityResponse.parse(await deletedResponse.json());
    expect(deleted[0]).toEqual({ ...initial[0], userId: null, userName: null });
    expect(deleted[0].userNameAtAction)
      .toBe("Responsável na ação");
    for (const [sql] of state.query.mock.calls) {
      expect(sql).toContain("LEFT JOIN users u ON u.id = al.user_id");
      expect(sql).toContain('al.user_name_at_action AS "userNameAtAction"');
    }
  });

  it.each(["Nome atual do legado", null])(
    "returns explicit null for a legacy snapshot, even with current name %j",
    async userName => {
      fixtures[0].activity = { ...baseActivity, userName, userNameAtAction: null };
      const response = await get();
      expect(response.status).toBe(200);
      const body = GetRecentActivityResponse.parse(await response.json());
      expect(body[0]).toHaveProperty("userNameAtAction", null);
      expect(body[0].userName).toBe(userName);
      expect(body[0].userNameAtAction).toBeNull();
      expectActivitySql(false);
    },
  );

  it.each(["prestador", "funcionario"] as const)(
    "limits %s to their own diarias, not actions authored by them or teammates",
    async role => {
      currentUser = user(role);
      fixtures = [
        // An administrator's action on this person's diaria must be visible.
        { providerId: 11, activity: { ...baseActivity } },
        // Same team and actor as the viewer: still somebody else's diaria.
        { providerId: 12, activity: {
          ...baseActivity, id: 21, diariaId: 101, userId: currentUser.id,
          userName: currentUser.name, userNameAtAction: currentUser.name,
        } },
        { providerId: 13, activity: {
          ...baseActivity, id: 22, diariaId: 102, teamName: "Equipe B",
        } },
      ];
      const response = await get(null);
      expect(response.status).toBe(401);
      expect(state.query).not.toHaveBeenCalled();
      const ownResponse = await get(
        "controlled-token", "?userId=3&providerId=12&teamId=999&role=admin",
      );
      expect(ownResponse.status).toBe(200);
      expect(await ownResponse.json()).toEqual([baseActivity]);
      expectActivitySql(true);
    },
  );

  it.each(["prestador", "funcionario"] as const)(
    "returns no activity for an unlinked %s without dropping the scope",
    async role => {
      currentUser = user(role, { teamId: null });
      linkedProviderId = null;
      const response = await get();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
      expectActivitySql(true);
    },
  );

  it("lets an administrator read across providers without ownership filtering", async () => {
    fixtures.push({ providerId: 12, activity: {
      ...baseActivity, id: 21, diariaId: 101, teamName: "Equipe B",
    } });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(fixtures.map(row => row.activity));
    expectActivitySql(false);
  });

  it.each([10, null])("denies a gestor with teamId %j before any activity query", async teamId => {
    currentUser = user("gestor", { teamId });
    const response = await get();
    expect(response.status).toBe(403);
    expect(state.query).not.toHaveBeenCalled();
  });

  it("denies an unauthenticated request before any database access", async () => {
    const response = await get(null);
    expect(response.status).toBe(401);
    expect(state.verify).not.toHaveBeenCalled();
    expect(state.select).not.toHaveBeenCalled();
    expect(state.query).not.toHaveBeenCalled();
  });

  it("denies an invalid token before any database access", async () => {
    state.verify.mockImplementation(() => { throw new Error("Invalid test token"); });
    const response = await get("invalid-token");
    expect(response.status).toBe(401);
    expect(state.select).not.toHaveBeenCalled();
    expect(state.query).not.toHaveBeenCalled();
  });

  it.each(["inactive", "deleted"] as const)(
    "denies a previously authenticated but now %s user",
    async condition => {
      currentUser = condition === "inactive" ? user("admin", { active: false }) : undefined;
      const response = await get();
      expect(response.status).toBe(401);
      expect(state.limit).toHaveBeenCalledWith(1);
      expect(state.query).not.toHaveBeenCalled();
    },
  );

  it("uses the revalidated role, denying a former admin now assigned gestor", async () => {
    state.verify.mockReturnValue({ userId: 71, role: "admin" });
    currentUser = user("gestor");
    const response = await get();
    expect(response.status).toBe(403);
    expect(state.query).not.toHaveBeenCalled();
  });
});
