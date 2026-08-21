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

let server: Server;
let apiBaseUrl = "";
let adminId: number;
let gestorId: number;
let teamId: number;
let providerId: number;
let adminToken: string;
let gestorToken: string;
const createdDiariaIds: number[] = [];

async function createDiaria(status: "pendente_aprovacao" | "exportada" | "paga") {
  const [diaria] = await db
    .insert(diariasTable)
    .values({
      providerId,
      teamId,
      managerId: adminId,
      workDate: "2026-08-01",
      value: "100.00",
      status,
      createdBy: adminId,
    })
    .returning({ id: diariasTable.id });
  createdDiariaIds.push(diaria.id);
  return diaria.id;
}

function deleteRequest(id: number, token: string) {
  return fetch(`${apiBaseUrl}/api/diarias/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-session-secret";
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const [admin, gestor] = await db
    .insert(usersTable)
    .values([
      {
        decargoId: "__test_delete_admin__",
        name: "__TEST_DELETE_ADMIN__",
        email: "__test_delete_admin@test.invalid__",
        role: "admin",
        active: true,
      },
      {
        decargoId: "__test_delete_gestor__",
        name: "__TEST_DELETE_GESTOR__",
        email: "__test_delete_gestor@test.invalid__",
        role: "gestor",
        active: true,
      },
    ])
    .returning({ id: usersTable.id, decargoId: usersTable.decargoId, email: usersTable.email, name: usersTable.name, role: usersTable.role, teamId: usersTable.teamId });
  adminId = admin.id;
  gestorId = gestor.id;

  const [team] = await db
    .insert(teamsTable)
    .values({ name: "__TEST_DELETE_TEAM__" })
    .returning({ id: teamsTable.id });
  teamId = team.id;

  const [provider] = await db
    .insert(providersTable)
    .values({
      decargoId: "__test_delete_provider__",
      name: "__TEST_DELETE_PROVIDER__",
      teamId,
      active: true,
    })
    .returning({ id: providersTable.id });
  providerId = provider.id;

  adminToken = signLocalJwt({
    userId: admin.id,
    decargoId: admin.decargoId,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    teamId: admin.teamId ?? null,
  });
  gestorToken = signLocalJwt({
    userId: gestor.id,
    decargoId: gestor.decargoId,
    email: gestor.email,
    name: gestor.name,
    role: gestor.role,
    teamId: gestor.teamId ?? null,
  });
});

afterAll(async () => {
  if (createdDiariaIds.length) {
    await db.delete(auditLogsTable).where(
      and(
        eq(auditLogsTable.entityType, "diaria"),
        inArray(auditLogsTable.entityId, createdDiariaIds),
      ),
    );
    await db.delete(diariasTable).where(inArray(diariasTable.id, createdDiariaIds));
  }
  await db.delete(providersTable).where(eq(providersTable.id, providerId));
  await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
  await db.delete(usersTable).where(inArray(usersTable.id, [adminId, gestorId]));
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

describe("DELETE /api/diarias/:id — permanent deletion", () => {
  it("denies a non-admin and leaves the diária intact", async () => {
    const id = await createDiaria("pendente_aprovacao");
    const response = await deleteRequest(id, gestorToken);

    expect(response.status).toBe(403);
    const [stillThere] = await db.select({ id: diariasTable.id }).from(diariasTable).where(eq(diariasTable.id, id));
    expect(stillThere?.id).toBe(id);
  });

  it("permanently deletes an eligible diária and retains its audit trace", async () => {
    const id = await createDiaria("pendente_aprovacao");
    const response = await deleteRequest(id, adminToken);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id, deleted: true });

    const [removed] = await db.select({ id: diariasTable.id }).from(diariasTable).where(eq(diariasTable.id, id));
    expect(removed).toBeUndefined();

    const [audit] = await db
      .select()
      .from(auditLogsTable)
      .where(and(
        eq(auditLogsTable.entityType, "diaria"),
        eq(auditLogsTable.entityId, id),
        eq(auditLogsTable.action, "excluido_permanentemente"),
      ));
    expect(audit?.userId).toBe(adminId);
    expect(audit?.newValues).toEqual({ deleted: true });
  });

  it.each(["exportada", "paga"] as const)("rejects deletion of a %s diária", async (status) => {
    const id = await createDiaria(status);
    const response = await deleteRequest(id, adminToken);

    expect(response.status).toBe(400);
    const [stillThere] = await db.select({ id: diariasTable.id }).from(diariasTable).where(eq(diariasTable.id, id));
    expect(stillThere?.id).toBe(id);
  });
});