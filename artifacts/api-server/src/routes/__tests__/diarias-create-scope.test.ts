import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq } from "drizzle-orm";
import app from "../../app";
import { signLocalJwt } from "../../lib/localJwt";
import {
  db,
  diariaTypesTable,
  diariasTable,
  providersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";

let server: Server;
let apiBaseUrl = "";
let gestorId: number;
let adminId: number;
let managedTeamId: number;
let outsideTeamId: number;
let outsideProviderId: number;
let typeId: number;
let gestorToken: string;
const workDate = "2098-01-15";

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-session-secret";
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const [gestor, admin] = await db.insert(usersTable).values([
    { decargoId: "__test_create_scope_gestor__", name: "__TEST_CREATE_SCOPE_GESTOR__", email: "__test_create_scope_gestor@test.invalid__", role: "gestor", active: true },
    { decargoId: "__test_create_scope_admin__", name: "__TEST_CREATE_SCOPE_ADMIN__", email: "__test_create_scope_admin@test.invalid__", role: "admin", active: true },
  ]).returning();
  gestorId = gestor.id;
  adminId = admin.id;

  const [managedTeam, outsideTeam] = await db.insert(teamsTable).values([
    { name: "__TEST_CREATE_SCOPE_MANAGED__", managerId: gestorId },
    { name: "__TEST_CREATE_SCOPE_OUTSIDE__", managerId: adminId },
  ]).returning();
  managedTeamId = managedTeam.id;
  outsideTeamId = outsideTeam.id;

  const [provider] = await db.insert(providersTable).values({
    decargoId: "__test_create_scope_provider__",
    name: "__TEST_CREATE_SCOPE_PROVIDER__",
    teamId: outsideTeamId,
    dailyRate: "250.00",
    active: true,
  }).returning();
  outsideProviderId = provider.id;

  const [type] = await db.insert(diariaTypesTable).values({
    description: "__TEST_CREATE_SCOPE_TYPE__",
    active: true,
  }).returning();
  typeId = type.id;

  gestorToken = signLocalJwt({
    userId: gestorId,
    decargoId: gestor.decargoId,
    email: gestor.email,
    name: gestor.name,
    role: gestor.role,
    teamId: gestor.teamId,
  });
});

afterAll(async () => {
  await db.delete(diariasTable).where(and(
    eq(diariasTable.providerId, outsideProviderId),
    eq(diariasTable.workDate, workDate),
  ));
  await db.delete(providersTable).where(eq(providersTable.id, outsideProviderId));
  await db.delete(diariaTypesTable).where(eq(diariaTypesTable.id, typeId));
  await db.delete(teamsTable).where(eq(teamsTable.id, managedTeamId));
  await db.delete(teamsTable).where(eq(teamsTable.id, outsideTeamId));
  await db.delete(usersTable).where(eq(usersTable.id, gestorId));
  await db.delete(usersTable).where(eq(usersTable.id, adminId));
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe("POST /api/diarias — gestor provider scope", () => {
  it("rejects a forged managed team for a provider outside the gestor's scope", async () => {
    const response = await fetch(`${apiBaseUrl}/api/diarias`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gestorToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        providerId: outsideProviderId,
        teamId: managedTeamId,
        typeId,
        workDate,
        value: 1,
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "A equipe informada não corresponde à equipe atual do prestador",
    });
    const rows = await db.select({ id: diariasTable.id }).from(diariasTable).where(and(
      eq(diariasTable.providerId, outsideProviderId),
      eq(diariasTable.workDate, workDate),
    ));
    expect(rows).toHaveLength(0);
  });
});