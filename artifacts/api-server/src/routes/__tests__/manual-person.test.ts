import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, providersTable, type User } from "@workspace/db";
import app from "../../app";
import { signLocalJwt } from "../../lib/localJwt";

let server: Server;
let base: string;
let admin: User;
let manager: User;
const users: number[] = [];
const providers: number[] = [];
const suffix = randomUUID();

function token(user: User) {
  return signLocalJwt({
    userId: user.id, decargoId: user.decargoId, email: user.email,
    name: user.name, role: user.role, teamId: user.teamId,
  });
}

async function create(data: unknown, user = admin) {
  const response = await fetch(`${base}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token(user)}` },
    body: JSON.stringify(data),
  });
  const result = await response.json() as Pick<User, "id" | "decargoId" | "name" | "email" | "active"> & {
    error?: string;
    code?: string;
  };
  if (response.status === 201) {
    users.push(result.id);
    const rows = await db.select({ id: providersTable.id }).from(providersTable)
      .where(eq(providersTable.decargoId, result.decargoId));
    providers.push(...rows.map(row => row.id));
  }
  return { status: response.status, result };
}

describe("Manual person registration", () => {
  beforeAll(async () => {
    [admin, manager] = await db.insert(usersTable).values(["admin", "gestor"].map(role => ({
      decargoId: `__test_manual_actor_${suffix}_${role}`,
      name: `__Test actor ${suffix} ${role}`, email: `${role}-${suffix}@test.invalid`,
      role, active: true,
    }))).returning();
    users.push(admin.id, manager.id);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (providers.length) await db.delete(providersTable).where(inArray(providersTable.id, providers));
    if (users.length) await db.delete(usersTable).where(inArray(usersTable.id, users));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it("creates a user and linked provider atomically with optional daily rate", async () => {
    const { status, result } = await create({
      name: `  __Teste  José ${suffix}  `,
      email: `  CREATE-${suffix}@TEST.INVALID `,
      role: "funcionario", dailyRate: 123.45,
    });
    expect(status).toBe(201);
    expect(result.name).toBe(`__Teste José ${suffix}`);
    expect(result.email).toBe(`create-${suffix}@test.invalid`);
    expect(result.active).toBe(true);
    const [provider] = await db.select().from(providersTable).where(eq(providersTable.decargoId, result.decargoId));
    expect(provider.email).toBe(result.email);
    expect(provider.dailyRate).toBe("123.45");
    expect(provider.syncedAt).toBeNull();
  });

  it("blocks an existing email without changing that person's name, role or active status", async () => {
    const response = await create({
      name: `Different name ${suffix}`, email: `  ADMIN-${suffix}@TEST.INVALID  `,
      role: "prestador", active: false,
    });
    expect(response.status).toBe(409);
    expect(response.result.error).toContain("já possui registro");
    const [unchanged] = await db.select().from(usersTable).where(eq(usersTable.id, admin.id));
    expect(unchanged).toEqual(admin);
  });

  it("blocks the same full name with accent, case and spacing differences", async () => {
    const response = await create({
      name: `__TESTE   JOSE ${suffix}`, email: `other-name-${suffix}@test.invalid`, role: "admin",
    });
    expect(response.status).toBe(409);
    expect(response.result.code).toBe("PERSON_ALREADY_REGISTERED");
  });

  it("checks inactive synced providers without email", async () => {
    const [provider] = await db.insert(providersTable).values({
      decargoId: `__test_remote_${suffix}`, name: `__Prestador André ${suffix}`, active: false,
    }).returning();
    providers.push(provider.id);
    const response = await create({
      name: `__PRESTADOR  ANDRE ${suffix}`, email: `remote-${suffix}@test.invalid`, role: "prestador",
    });
    expect(response.status).toBe(409);
    const [unchanged] = await db.select().from(providersTable).where(eq(providersTable.id, provider.id));
    expect(unchanged.active).toBe(false);
    expect(unchanged.email).toBeNull();
  });

  it("checks email against the provider source too", async () => {
    const [provider] = await db.insert(providersTable).values({
      decargoId: `__test_remote_email_${suffix}`, name: `__Provider with email ${suffix}`,
      email: `provider-${suffix}@test.invalid`, active: true,
    }).returning();
    providers.push(provider.id);
    const response = await create({
      name: `Other provider name ${suffix}`, email: `PROVIDER-${suffix}@TEST.INVALID`, role: "prestador",
    });
    expect(response.status).toBe(409);
  });

  it("allows only one registration when two requests race", async () => {
    const data = { name: `__Concurrent ${suffix}`, email: `concurrent-${suffix}@test.invalid`, role: "prestador" };
    const responses = await Promise.all([create(data), create(data)]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const rows = await db.select().from(usersTable).where(eq(usersTable.email, data.email));
    expect(rows).toHaveLength(1);
  });

  it("rejects a non-admin before creating a record", async () => {
    const response = await create({
      name: `__Forbidden ${suffix}`, email: `forbidden-${suffix}@test.invalid`, role: "admin",
    }, manager);
    expect(response.status).toBe(403);
  });

  it.each([
    {},
    { name: "   ", email: "valid@test.invalid", role: "prestador" },
    { name: "__Bad email", email: "invalid", role: "prestador" },
    { name: "__Bad type", email: "valid@test.invalid", role: "owner" },
    { name: "__Bad rate", email: "valid@test.invalid", role: "prestador", dailyRate: -1 },
  ])("validates mandatory fields, types and optional values: %j", async data => {
    expect((await create(data)).status).toBe(400);
  });

  it("rejects a nonexistent team without leaving a partial person", async () => {
    const email = `invalid-team-${suffix}@test.invalid`;
    const response = await create({
      name: `__Invalid team ${suffix}`, email, role: "prestador", teamId: 2147483647,
    });
    expect(response.status).toBe(400);
    expect(await db.select().from(usersTable).where(eq(usersTable.email, email))).toHaveLength(0);
    expect(await db.select().from(providersTable).where(eq(providersTable.email, email))).toHaveLength(0);
  });
});
