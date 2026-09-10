import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import app from "../../app";
import { signLocalJwt } from "../../lib/localJwt";
import {
  auditLogsTable,
  db,
  diariasTable,
  providersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";

type Role = "admin" | "gestor" | "prestador" | "funcionario";
type DiariaStatus =
  | "pendente_aprovacao"
  | "em_analise"
  | "disponivel_exportacao"
  | "rejeitada"
  | "exportada";

type MutationCase = {
  name: string;
  method: "PATCH" | "POST" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  initialStatus: DiariaStatus;
  expected?: Record<string, unknown>;
};

let server: Server;
let apiBaseUrl = "";
let adminId: number;
let teamId: number;
let providerId: number;
const userIds: number[] = [];
const diariaIds: number[] = [];
const tokens = {} as Record<Role, string>;

const mutationCases: MutationCase[] = [
  {
    name: "editar",
    method: "PATCH",
    path: "",
    body: { observations: "__TEST_CHANGED__", value: 999 },
    initialStatus: "pendente_aprovacao",
    expected: { observations: "__TEST_CHANGED__", value: "999.00" },
  },
  {
    name: "alterar data de pagamento",
    method: "PATCH",
    path: "/payment-date",
    body: { paymentDate: "2098-02-15" },
    initialStatus: "pendente_aprovacao",
    expected: { paymentDate: "2098-02-15" },
  },
  {
    name: "reverter",
    method: "POST",
    path: "/revert",
    initialStatus: "rejeitada",
    expected: { status: "pendente_aprovacao" },
  },
  {
    name: "aprovar",
    method: "POST",
    path: "/approve",
    body: { note: "__TEST_APPROVED__" },
    initialStatus: "pendente_aprovacao",
    expected: { status: "disponivel_exportacao", actionNote: "__TEST_APPROVED__" },
  },
  {
    name: "rejeitar",
    method: "POST",
    path: "/reject",
    body: { note: "__TEST_REJECTED__" },
    initialStatus: "pendente_aprovacao",
    expected: { status: "rejeitada", actionNote: "__TEST_REJECTED__" },
  },
  {
    name: "solicitar correção",
    method: "POST",
    path: "/request-correction",
    body: { note: "__TEST_CORRECTION__" },
    initialStatus: "pendente_aprovacao",
    expected: { status: "solicitacao_correcao", actionNote: "__TEST_CORRECTION__" },
  },
  {
    name: "marcar como paga",
    method: "POST",
    path: "/mark-paid",
    initialStatus: "exportada",
    expected: { status: "paga" },
  },
  {
    name: "excluir",
    method: "DELETE",
    path: "",
    initialStatus: "pendente_aprovacao",
  },
];

async function createDiaria(status: DiariaStatus) {
  const [diaria] = await db
    .insert(diariasTable)
    .values({
      providerId,
      teamId,
      managerId: adminId,
      workDate: "2098-02-01",
      value: "123.45",
      paymentDate: "2098-02-10",
      observations: "__TEST_ORIGINAL__",
      status,
      createdBy: adminId,
    })
    .returning();
  diariaIds.push(diaria.id);
  return diaria;
}

function mutate(id: number, testCase: MutationCase, role: Role) {
  return fetch(`${apiBaseUrl}/api/diarias/${id}${testCase.path}`, {
    method: testCase.method,
    headers: {
      Authorization: `Bearer ${tokens[role]}`,
      ...(testCase.body ? { "Content-Type": "application/json" } : {}),
    },
    body: testCase.body ? JSON.stringify(testCase.body) : undefined,
  });
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-session-secret";

  const users = await db.insert(usersTable).values(
    (["admin", "gestor", "prestador", "funcionario"] as const).map((role) => ({
      decargoId: `__test_write_permissions_${role}__`,
      name: `__TEST_WRITE_PERMISSIONS_${role.toUpperCase()}__`,
      email: `__test_write_permissions_${role}@test.invalid__`,
      role,
      active: true,
    })),
  ).returning();
  userIds.push(...users.map((user) => user.id));
  const byRole = Object.fromEntries(users.map((user) => [user.role, user])) as Record<Role, typeof users[number]>;
  adminId = byRole.admin.id;

  const [team] = await db.insert(teamsTable)
    .values({ name: "__TEST_WRITE_PERMISSIONS_TEAM__", managerId: byRole.gestor.id })
    .returning();
  teamId = team.id;

  const [provider] = await db.insert(providersTable).values({
    decargoId: byRole.prestador.decargoId,
    name: "__TEST_WRITE_PERMISSIONS_PROVIDER__",
    teamId,
    dailyRate: "123.45",
    active: true,
  }).returning();
  providerId = provider.id;

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
    await db.delete(auditLogsTable).where(and(
      eq(auditLogsTable.entityType, "diaria"),
      inArray(auditLogsTable.entityId, diariaIds),
    ));
    await db.delete(diariasTable).where(inArray(diariasTable.id, diariaIds));
  }
  await db.delete(providersTable).where(eq(providersTable.id, providerId));
  await db.update(teamsTable).set({ managerId: null }).where(eq(teamsTable.id, teamId));
  await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
  await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe("mutações de /api/diarias/:id — permissões por papel", () => {
  for (const testCase of mutationCases) {
    it.each(["gestor", "prestador", "funcionario"] as const)(
      `%s recebe 403 ao tentar ${testCase.name} e o registro permanece inalterado`,
      async (role) => {
        const original = await createDiaria(testCase.initialStatus);
        const response = await mutate(original.id, testCase, role);

        expect(response.status).toBe(403);
        const [persisted] = await db.select().from(diariasTable).where(eq(diariasTable.id, original.id));
        expect(persisted).toEqual(original);
      },
    );
  }

  for (const testCase of mutationCases.filter((item) => item.method !== "DELETE")) {
    it(`admin pode ${testCase.name} e recebe o valor financeiro`, async () => {
      const original = await createDiaria(testCase.initialStatus);
      const response = await mutate(original.id, testCase, "admin");

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        id: original.id,
        value: testCase.expected?.value ?? "123.45",
        ...testCase.expected,
      });
    });
  }

  it("admin pode excluir uma diária elegível", async () => {
    const diaria = await createDiaria("pendente_aprovacao");
    const response = await mutate(diaria.id, mutationCases.at(-1)!, "admin");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: diaria.id, deleted: true });
    const [persisted] = await db.select().from(diariasTable).where(eq(diariasTable.id, diaria.id));
    expect(persisted).toBeUndefined();
  });

  it("admin pode revogar aprovações em lote antes da exportação", async () => {
    const first = await createDiaria("disponivel_exportacao");
    const second = await createDiaria("disponivel_exportacao");
    const approvedAt = new Date("2098-02-02T12:00:00Z");
    await db.update(diariasTable).set({
      approvedAt,
      approvedBy: adminId,
    }).where(inArray(diariasTable.id, [first.id, second.id]));

    const response = await fetch(`${apiBaseUrl}/api/diarias/bulk-reject`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.admin}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        diariaIds: [first.id, second.id],
        note: "__TEST_REVOKED_APPROVAL__",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      succeeded: [first.id, second.id],
      failed: [],
    });

    const persisted = await db.select({
      status: diariasTable.status,
      actionNote: diariasTable.actionNote,
      approvedAt: diariasTable.approvedAt,
      approvedBy: diariasTable.approvedBy,
    }).from(diariasTable).where(inArray(diariasTable.id, [first.id, second.id]));

    expect(persisted).toHaveLength(2);
    for (const row of persisted) {
      expect(row).toEqual({
        status: "rejeitada",
        actionNote: "__TEST_REVOKED_APPROVAL__",
        approvedAt: null,
        approvedBy: null,
      });
    }
  });

  it("não revoga aprovação reservada por uma exportação em andamento", async () => {
    const diaria = await createDiaria("disponivel_exportacao");
    await db.update(diariasTable).set({
      integrationId: "__TEST_EXPORT_IN_PROGRESS__",
      approvedAt: new Date("2098-02-02T12:00:00Z"),
      approvedBy: adminId,
    }).where(eq(diariasTable.id, diaria.id));

    const response = await fetch(`${apiBaseUrl}/api/diarias/bulk-reject`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.admin}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        diariaIds: [diaria.id],
        note: "__TEST_MUST_REMAIN_APPROVED__",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      succeeded: [],
      failed: [{ id: diaria.id, reason: "Diária está em processo de exportação" }],
    });

    const [persisted] = await db.select({
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
      approvedBy: diariasTable.approvedBy,
    }).from(diariasTable).where(eq(diariasTable.id, diaria.id));
    expect(persisted).toEqual({
      status: "disponivel_exportacao",
      integrationId: "__TEST_EXPORT_IN_PROGRESS__",
      approvedBy: adminId,
    });
  });
});