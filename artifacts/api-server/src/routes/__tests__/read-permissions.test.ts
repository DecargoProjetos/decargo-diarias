import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import app from "../../app";
import { signLocalJwt } from "../../lib/localJwt";
import {
  db,
  diariasTable,
  providersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";

type Role = "admin" | "gestor" | "prestador" | "funcionario";

type DiariaList = {
  data: Array<{
    id: number;
    providerId: number;
    providerName: string;
    teamId: number;
    value: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type DiariaDetail = {
  id: number;
  providerId: number;
  teamId: number;
  value: string | null;
};

type ProviderListItem = {
  id: number;
  teamId: number | null;
  dailyRate: string | null;
};

let server: Server;
let apiBaseUrl = "";
const userIds: number[] = [];
const teamIds: number[] = [];
const providerIds: number[] = [];
const diariaIds: number[] = [];
const tokens = {} as Record<Role, string>;
const fixture = {} as Record<
  "managedPrestador" | "managedFuncionario" | "outside",
  { providerId: number; teamId: number; diariaId: number; value: string }
>;
const startDate = "2097-04-01";
const endDate = "2097-04-03";

function authenticatedGet(path: string, role: Role) {
  return fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${tokens[role]}` },
  });
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-session-secret";

  const users = await db.insert(usersTable).values([
    {
      decargoId: "__test_read_permissions_admin__",
      name: "__TEST_READ_PERMISSIONS_ADMIN__",
      email: "__test_read_permissions_admin@test.invalid__",
      role: "admin",
      active: true,
    },
    {
      decargoId: "__test_read_permissions_gestor__",
      name: "__TEST_READ_PERMISSIONS_GESTOR__",
      email: "__test_read_permissions_gestor@test.invalid__",
      role: "gestor",
      active: true,
    },
    {
      decargoId: "__test_read_permissions_prestador__",
      name: "__TEST_READ_PERMISSIONS_PRESTADOR__",
      email: "__test_read_permissions_prestador@test.invalid__",
      role: "prestador",
      active: true,
    },
    {
      decargoId: "__test_read_permissions_funcionario__",
      name: "__TEST_READ_PERMISSIONS_FUNCIONARIO__",
      email: "__test_read_permissions_funcionario@test.invalid__",
      role: "funcionario",
      active: true,
    },
  ]).returning();
  userIds.push(...users.map((user) => user.id));

  const byRole = Object.fromEntries(users.map((user) => [user.role, user])) as Record<Role, typeof users[number]>;
  const teams = await db.insert(teamsTable).values([
    { name: "__TEST_READ_PERMISSIONS_MANAGED__", managerId: byRole.gestor.id },
    { name: "__TEST_READ_PERMISSIONS_OUTSIDE__", managerId: byRole.admin.id },
  ]).returning();
  teamIds.push(...teams.map((team) => team.id));

  const providers = await db.insert(providersTable).values([
    {
      decargoId: byRole.prestador.decargoId,
      name: "__TEST_READ_PERMISSIONS_PROVIDER_PRESTADOR__",
      teamId: teams[0].id,
      dailyRate: "111.00",
      active: true,
    },
    {
      decargoId: byRole.funcionario.decargoId,
      name: "__TEST_READ_PERMISSIONS_PROVIDER_FUNCIONARIO__",
      teamId: teams[0].id,
      dailyRate: "222.00",
      active: true,
    },
    {
      decargoId: "__test_read_permissions_provider_outside__",
      name: "__TEST_READ_PERMISSIONS_PROVIDER_OUTSIDE__",
      teamId: teams[1].id,
      dailyRate: "333.00",
      active: true,
    },
  ]).returning();
  providerIds.push(...providers.map((provider) => provider.id));

  const diarias = await db.insert(diariasTable).values([
    {
      providerId: providers[0].id,
      teamId: teams[0].id,
      managerId: byRole.gestor.id,
      workDate: startDate,
      value: "111.00",
      status: "pendente_aprovacao",
      createdBy: byRole.admin.id,
    },
    {
      providerId: providers[1].id,
      teamId: teams[0].id,
      managerId: byRole.gestor.id,
      workDate: "2097-04-02",
      value: "222.00",
      status: "pendente_aprovacao",
      createdBy: byRole.admin.id,
    },
    {
      providerId: providers[2].id,
      teamId: teams[1].id,
      managerId: byRole.admin.id,
      workDate: endDate,
      value: "333.00",
      status: "pendente_aprovacao",
      createdBy: byRole.admin.id,
    },
  ]).returning();
  diariaIds.push(...diarias.map((diaria) => diaria.id));

  fixture.managedPrestador = {
    providerId: providers[0].id,
    teamId: teams[0].id,
    diariaId: diarias[0].id,
    value: "111.00",
  };
  fixture.managedFuncionario = {
    providerId: providers[1].id,
    teamId: teams[0].id,
    diariaId: diarias[1].id,
    value: "222.00",
  };
  fixture.outside = {
    providerId: providers[2].id,
    teamId: teams[1].id,
    diariaId: diarias[2].id,
    value: "333.00",
  };

  for (const role of ["admin", "gestor", "prestador", "funcionario"] as const) {
    const user = byRole[role];
    tokens[role] = signLocalJwt({
      userId: user.id,
      decargoId: user.decargoId,
      email: user.email,
      name: user.name,
      role: user.role,
      teamId: user.teamId,
    });
  }

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (diariaIds.length) {
    await db.delete(diariasTable).where(inArray(diariasTable.id, diariaIds));
  }
  if (providerIds.length) {
    await db.delete(providersTable).where(inArray(providersTable.id, providerIds));
  }
  if (teamIds.length) {
    await db.update(teamsTable).set({ managerId: null }).where(inArray(teamsTable.id, teamIds));
    await db.delete(teamsTable).where(inArray(teamsTable.id, teamIds));
  }
  if (userIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe("GET /api/diarias — permissões por papel", () => {
  const cases: Array<{
    role: Role;
    visible: Array<keyof typeof fixture>;
    financialValuesVisible: boolean;
  }> = [
    { role: "admin", visible: ["managedPrestador", "managedFuncionario", "outside"], financialValuesVisible: true },
    { role: "gestor", visible: ["managedPrestador", "managedFuncionario"], financialValuesVisible: false },
    { role: "prestador", visible: ["managedPrestador"], financialValuesVisible: false },
    { role: "funcionario", visible: ["managedFuncionario"], financialValuesVisible: false },
  ];

  for (const testCase of cases) {
    it(`${testCase.role} recebe apenas as equipes permitidas e o valor adequado`, async () => {
      const response = await authenticatedGet(
        `/api/diarias?startDate=${startDate}&endDate=${endDate}&pageSize=100`,
        testCase.role,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json() as DiariaList;
      const expected = testCase.visible.map((key) => fixture[key]);

      expect(body).toMatchObject({
        total: expected.length,
        page: 1,
        pageSize: 100,
        totalPages: expected.length ? 1 : 0,
      });
      expect(body.data.map((row) => row.id).sort()).toEqual(expected.map((row) => row.diariaId).sort());
      expect(new Set(body.data.map((row) => row.teamId))).toEqual(new Set(expected.map((row) => row.teamId)));
      for (const row of body.data) {
        const expectedRow = expected.find((item) => item.diariaId === row.id)!;
        expect(row.value).toBe(testCase.financialValuesVisible ? expectedRow.value : null);
      }
    });
  }

  it("ordena por nome do prestador antes da paginação quando solicitado", async () => {
    const response = await authenticatedGet(
      `/api/diarias?startDate=${startDate}&endDate=${endDate}&sortBy=providerName&pageSize=100`,
      "admin",
    );

    expect(response.status).toBe(200);
    const body = await response.json() as DiariaList;
    expect(body.data.map((row) => row.providerName)).toEqual([
      "__TEST_READ_PERMISSIONS_PROVIDER_FUNCIONARIO__",
      "__TEST_READ_PERMISSIONS_PROVIDER_OUTSIDE__",
      "__TEST_READ_PERMISSIONS_PROVIDER_PRESTADOR__",
    ]);
  });
});

describe("GET /api/diarias/:id — permissões por registro", () => {
  const allowedCases: Array<{
    role: Role;
    target: keyof typeof fixture;
    financialValueVisible: boolean;
  }> = [
    { role: "admin", target: "outside", financialValueVisible: true },
    { role: "gestor", target: "managedPrestador", financialValueVisible: false },
    { role: "prestador", target: "managedPrestador", financialValueVisible: false },
    { role: "funcionario", target: "managedFuncionario", financialValueVisible: false },
  ];

  for (const testCase of allowedCases) {
    it(`${testCase.role} acessa uma diária vinculada ao seu escopo`, async () => {
      const expected = fixture[testCase.target];
      const response = await authenticatedGet(`/api/diarias/${expected.diariaId}`, testCase.role);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json() as DiariaDetail;
      expect(body).toMatchObject({
        id: expected.diariaId,
        providerId: expected.providerId,
        teamId: expected.teamId,
        value: testCase.financialValueVisible ? expected.value : null,
      });
    });
  }

  it("gestor recebe 404 ao tentar acessar uma diária fora das equipes gerenciadas", async () => {
    const response = await authenticatedGet(`/api/diarias/${fixture.outside.diariaId}`, "gestor");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Diária não encontrada" });
  });

  it.each([
    ["prestador", "managedFuncionario"],
    ["funcionario", "managedPrestador"],
  ] as const)("%s recebe 404 ao tentar acessar uma diária sem vínculo com o prestador", async (role, target) => {
    const response = await authenticatedGet(`/api/diarias/${fixture[target].diariaId}`, role);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Diária não encontrada" });
  });
});

describe("GET /api/providers — permissões por papel", () => {
  const cases: Array<{
    role: Role;
    visible: Array<keyof typeof fixture>;
    financialValuesVisible: boolean;
  }> = [
    { role: "admin", visible: ["managedPrestador", "managedFuncionario", "outside"], financialValuesVisible: true },
    { role: "gestor", visible: ["managedPrestador", "managedFuncionario"], financialValuesVisible: false },
    { role: "prestador", visible: ["managedPrestador", "managedFuncionario", "outside"], financialValuesVisible: false },
    { role: "funcionario", visible: ["managedPrestador", "managedFuncionario", "outside"], financialValuesVisible: false },
  ];

  for (const testCase of cases) {
    it(`${testCase.role} recebe as equipes permitidas e diária padrão protegida`, async () => {
      const response = await authenticatedGet("/api/providers", testCase.role);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json() as ProviderListItem[];
      const fixtureRows = body.filter((row) => providerIds.includes(row.id));
      const expected = testCase.visible.map((key) => fixture[key]);

      expect(fixtureRows.map((row) => row.id).sort()).toEqual(expected.map((row) => row.providerId).sort());
      expect(new Set(fixtureRows.map((row) => row.teamId))).toEqual(new Set(expected.map((row) => row.teamId)));
      for (const row of fixtureRows) {
        const expectedRow = expected.find((item) => item.providerId === row.id)!;
        expect(row.dailyRate).toBe(testCase.financialValuesVisible ? expectedRow.value : null);
      }
    });
  }
});