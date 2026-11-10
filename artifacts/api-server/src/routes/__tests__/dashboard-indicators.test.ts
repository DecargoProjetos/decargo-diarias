import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { User } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetDashboardByTeamResponse,
  GetDashboardByProviderResponse,
} from "@workspace/api-zod";
import { linkedProviderSql } from "../../lib/providerIdentity";

const state = vi.hoisted(() => ({
  query: vi.fn(), select: vi.fn(), limit: vi.fn(), verify: vi.fn(),
}));

// Never load the real database or JWT secrets. Authentication and role checks
// deliberately remain real, as in dashboard-recent-activity.test.ts.
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

const endpoints = ["summary", "by-team", "by-provider"] as const;
type Endpoint = typeof endpoints[number];
const counts = {
  pendentes: 1, emAnalise: 2, aprovadas: 3, rejeitadas: 4,
  disponivelExportacao: 5, exportadas: 6, pagas: 7, canceladas: 8,
};
const money = {
  totalValorAprovadas: 123.45, totalValorExportadas: 234.56, totalValorPagas: 345.67,
};
const hiddenMoney = {
  totalValorAprovadas: null, totalValorExportadas: null, totalValorPagas: null,
};
// Own, same-team colleague, and another team: provider IDs intentionally differ
// from local user and external IDs. Do not infer ownership from team or author.
const fixtures = [
  { providerId: 11, providerName: "Pessoa vinculada", teamId: 10, teamName: "Equipe A", scale: 1 },
  { providerId: 12, providerName: "Colega da equipe", teamId: 10, teamName: "Equipe A", scale: 2 },
  { providerId: 13, providerName: "Outra pessoa", teamId: 20, teamName: "Equipe B", scale: 4 },
];

let currentUser: User | undefined;
let linkedProviderId: number | null;
let server: Server;
let base: string;

function user(role: User["role"], overrides: Partial<User> = {}): User {
  return {
    id: 71, decargoId: "external-999", email: "pessoa@example.invalid",
    name: "Pessoa autenticada", role, teamId: 10, active: true, avatarUrl: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"), ...overrides,
  };
}

function get(endpoint: Endpoint, token: string | null = "controlled-token", search = "") {
  return fetch(`${base}/api/dashboard/${endpoint}${search}`, {
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
  });
}

function groupedCounts(scale: number, endpoint: Endpoint) {
  return {
    total: 36 * scale, pendentes: scale, aprovadas: 8 * scale,
    ...(endpoint === "by-team" ? { rejeitadas: 4 * scale } : {}),
    exportadas: 6 * scale, pagas: 7 * scale,
  };
}

function expectIndicatorSql(endpoint: Endpoint, scoped: boolean) {
  expect(state.query).toHaveBeenCalledTimes(1);
  const [sql, params] = state.query.mock.calls[0] as [string, unknown[]];
  const normalized = sql.replace(/\s+/g, " ").trim();
  expect(normalized).toContain("FROM diarias d JOIN providers p ON p.id = d.provider_id");
  const suffix = endpoint === "summary" ? ""
    : endpoint === "by-team" ? " GROUP BY t.id, t.name ORDER BY total DESC"
    : " GROUP BY p.id, p.name, t.name ORDER BY total DESC LIMIT 20";
  // Match the entire outer WHERE, not just a substring: an OR fallback, a
  // team-wide scope or a supplied query-string identity must fail this check.
  expect(normalized.slice(normalized.indexOf(" WHERE 1=1"))).toBe(
    ` WHERE 1=1${scoped ? ` AND p.id = ${linkedProviderSql("$1").replace(/\s+/g, " ")}` : ""}${suffix}`,
  );
  expect(params).toEqual(scoped ? [currentUser!.id] : []);
  if (scoped) {
    expect(normalized).toContain("explicit_provider.local_reference = 'local-user:' || $1::text");
    expect(normalized).toContain("FROM providers lp JOIN users lu ON lu.id = ($1)::integer");
    expect(normalized).toContain("lower(trim(lp.email)) = lower(trim(lu.email))");
    expect(normalized).toContain("HAVING count(*) = 1");
  }
  if (endpoint === "summary") {
    for (const field of Object.keys(money)) expect(sql).toContain(`AS "${field}"`);
  } else {
    expect(normalized).toContain(
      `${endpoint === "by-provider" ? "LEFT " : ""}JOIN teams t ON t.id = d.team_id`,
    );
    expect(sql).toContain('SUM(d.value::numeric) AS "totalValor"');
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
  state.verify.mockReturnValue({ userId: 71 });
  state.limit.mockImplementation(async () => currentUser ? [currentUser] : []);
  state.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: state.limit }) }),
  });
  // Canned aggregation simulates PG strings/nulls. It does not execute SQL;
  // independent exact SQL assertions above are what verify the access boundary.
  state.query.mockImplementation(async (sql: string, params: unknown[]) => {
    const selected = fixtures.filter(row => params.length === 0 || row.providerId === linkedProviderId);
    if (!sql.includes("GROUP BY")) {
      const scale = selected.reduce((sum, row) => sum + row.scale, 0);
      return { rows: [{
        ...Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, String(value * scale)])),
        ...Object.fromEntries(Object.entries(money).map(([key, value]) =>
          [key, scale === 0 ? null : (value * scale).toFixed(2)])),
      }] };
    }
    const endpoint = sql.includes('AS "providerId"') ? "by-provider" : "by-team";
    const groups = new Map<number, { identity: Record<string, unknown>; scale: number }>();
    for (const row of selected) {
      const key = endpoint === "by-provider" ? row.providerId : row.teamId;
      const group = groups.get(key) ?? {
        identity: endpoint === "by-provider"
          ? { providerId: row.providerId, providerName: row.providerName, teamName: row.teamName }
          : { teamId: row.teamId, teamName: row.teamName },
        scale: 0,
      };
      group.scale += row.scale;
      groups.set(key, group);
    }
    return { rows: [...groups.values()].sort((a, b) => b.scale - a.scale).map(group => ({
      ...group.identity,
      ...Object.fromEntries(Object.entries(groupedCounts(group.scale, endpoint))
        .map(([key, value]) => [key, String(value)])),
      totalValor: (1000.25 * group.scale).toFixed(2),
    })) };
  });
});

describe.each(endpoints)("GET /dashboard/%s (isolated)", endpoint => {
  it.each(["prestador", "funcionario"] as const)(
    "scopes %s by authenticated local identity and hides all financial fields",
    async role => {
      currentUser = user(role);
      const response = await get(endpoint, "controlled-token",
        "?userId=999&providerId=12&teamId=20&role=admin&canSeeFinancials=true");
      expect(response.status).toBe(200);
      const body = await response.json();
      if (endpoint === "summary") {
        expect(body).toEqual({ ...counts, ...hiddenMoney });
        GetDashboardSummaryResponse.parse(body);
      } else {
        expect(body).toEqual([{
          ...(endpoint === "by-team"
            ? { teamId: 10, teamName: "Equipe A" }
            : { providerId: 11, providerName: "Pessoa vinculada", teamName: "Equipe A" }),
          ...groupedCounts(1, endpoint), totalValor: null,
        }]);
        (endpoint === "by-team" ? GetDashboardByTeamResponse : GetDashboardByProviderResponse).parse(body);
      }
      expect(state.verify).toHaveBeenCalledWith("controlled-token");
      expect(state.limit).toHaveBeenCalledWith(1);
      expectIndicatorSql(endpoint, true);
    },
  );

  it.each([
    { role: "prestador", teamId: 10 }, { role: "prestador", teamId: null },
    { role: "funcionario", teamId: 10 }, { role: "funcionario", teamId: null },
  ] as const)("returns zero/empty indicators for unlinked $role with teamId $teamId", async ({ role, teamId }) => {
    currentUser = user(role, { teamId });
    linkedProviderId = null;
    const response = await get(endpoint);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(endpoint === "summary"
      ? { ...Object.fromEntries(Object.keys(counts).map(key => [key, 0])), ...hiddenMoney }
      : []);
    expectIndicatorSql(endpoint, true);
  });

  it("keeps global counts and financial values for an administrator", async () => {
    const response = await get(endpoint, "controlled-token", "?providerId=11&teamId=10");
    expect(response.status).toBe(200);
    const body = await response.json();
    if (endpoint === "summary") {
      expect(body).toEqual({
        pendentes: 7, emAnalise: 14, aprovadas: 21, rejeitadas: 28,
        disponivelExportacao: 35, exportadas: 42, pagas: 49, canceladas: 56,
        totalValorAprovadas: 864.15, totalValorExportadas: 1641.92, totalValorPagas: 2419.69,
      });
      GetDashboardSummaryResponse.parse(body);
    } else {
      const expectedGroups = endpoint === "by-team"
        ? [
          { teamId: 20, teamName: "Equipe B", scale: 4 },
          { teamId: 10, teamName: "Equipe A", scale: 3 },
        ]
        : [...fixtures].reverse().map(({ providerId, providerName, teamName, scale }) =>
          ({ providerId, providerName, teamName, scale }));
      expect(body).toEqual(expectedGroups.map(({ scale, ...identity }) => ({
        ...identity, ...groupedCounts(scale, endpoint), totalValor: 1000.25 * scale,
      })));
      (endpoint === "by-team" ? GetDashboardByTeamResponse : GetDashboardByProviderResponse).parse(body);
    }
    expectIndicatorSql(endpoint, false);
  });

  it.each([10, null])("denies a gestor with teamId %j before querying indicators", async teamId => {
    currentUser = user("gestor", { teamId });
    const response = await get(endpoint);
    expect(response.status).toBe(403);
    expect(state.limit).toHaveBeenCalledWith(1);
    expect(state.query).not.toHaveBeenCalled();
  });

  it("uses the refreshed role instead of a former admin claim", async () => {
    state.verify.mockReturnValue({ userId: 71, role: "admin" });
    currentUser = user("gestor");
    expect((await get(endpoint)).status).toBe(403);
    expect(state.query).not.toHaveBeenCalled();
  });

  it("denies missing authentication without any database access", async () => {
    expect((await get(endpoint, null)).status).toBe(401);
    expect(state.verify).not.toHaveBeenCalled();
    expect(state.select).not.toHaveBeenCalled();
    expect(state.query).not.toHaveBeenCalled();
  });

  it("denies invalid tokens without any database access", async () => {
    state.verify.mockImplementation(() => { throw new Error("Invalid test token"); });
    expect((await get(endpoint, "invalid-token")).status).toBe(401);
    expect(state.select).not.toHaveBeenCalled();
    expect(state.query).not.toHaveBeenCalled();
  });

  it.each(["inactive", "deleted"] as const)("denies a now %s user", async condition => {
    currentUser = condition === "inactive" ? user("admin", { active: false }) : undefined;
    expect((await get(endpoint)).status).toBe(401);
    expect(state.limit).toHaveBeenCalledWith(1);
    expect(state.query).not.toHaveBeenCalled();
  });
});
