import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db, usersTable, providersTable, teamsTable, diariasTable, diariaTypesTable, auditLogsTable, type User } from "@workspace/db";
import { signLocalJwt } from "../../lib/localJwt";
import { localProviderReference } from "../../lib/providerIdentity";

const { pushDiariasToPeople, pushFaltasToPeople } = vi.hoisted(() => ({
  pushDiariasToPeople: vi.fn(), pushFaltasToPeople: vi.fn(),
}));
vi.mock("../../lib/peopleClient", () => ({
  checkPeopleExportAvailability: vi.fn().mockResolvedValue(undefined),
  fetchFuncionarios: vi.fn(), fetchPrestadores: vi.fn(),
  pushDiariasToPeople, pushFaltasToPeople,
}));
import app from "../../app";

let server: Server;
let base: string;
let admin: User;
let teamId: number;
const suffix = randomUUID();
const userIds: number[] = [];
const providerIds: number[] = [];
const diariaIds: number[] = [];
const typeIds: number[] = [];
const actors: User[] = [];

function token(user: User) {
  return signLocalJwt({ userId: user.id, decargoId: user.decargoId, email: user.email,
    name: user.name, role: user.role, teamId: user.teamId });
}
async function person(label: string, overrides: Partial<typeof usersTable.$inferInsert> = {}) {
  const [user] = await db.insert(usersTable).values({
    decargoId: `__enable_${suffix}_${label}`, name: `__Enable ${suffix} ${label}`,
    email: `${label}-${suffix}@test.invalid`, role: "funcionario", teamId,
    ...overrides,
  }).returning();
  userIds.push(user.id);
  return user;
}
async function request(path: string, data: unknown, actor: User | null = admin, method = "POST") {
  return fetch(`${base}/api${path}`, {
    method, headers: { "Content-Type": "application/json",
      ...(actor ? { Authorization: `Bearer ${token(actor)}` } : {}) },
    ...(method !== "GET" ? { body: JSON.stringify(data) } : {}),
  });
}
async function enable(user: User, dailyRate = 123.45) {
  const response = await request(`/users/${user.id}/enable-diarias`, { confirmed: true, dailyRate });
  if (response.status === 201) {
    const result = await response.clone().json() as { providerId: number };
    providerIds.push(result.providerId);
  }
  return response;
}
async function linked(user: User) {
  return db.select().from(providersTable).where(eq(providersTable.decargoId, localProviderReference(user.id)));
}

describe("Explicit enablement of an existing person", () => {
  beforeAll(async () => {
    process.env.SESSION_SECRET ??= "test-session-secret";
    const [team] = await db.insert(teamsTable).values({ name: `__Enable team ${suffix}` }).returning();
    teamId = team.id;
    admin = await person("admin", { role: "admin" });
    for (const role of ["gestor", "funcionario", "prestador"]) actors.push(await person(role, { role }));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (diariaIds.length) await db.delete(diariasTable).where(inArray(diariasTable.id, diariaIds));
    if (providerIds.length) await db.delete(providersTable).where(inArray(providersTable.id, providerIds));
    if (typeIds.length) await db.delete(diariaTypesTable).where(inArray(diariaTypesTable.id, typeIds));
    await db.delete(auditLogsTable).where(and(eq(auditLogsTable.entityType, "user"), inArray(auditLogsTable.entityId, userIds)));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  });

  it("creates only a local provider and rate, preserving every existing person field and auditing", async () => {
    const user = await person("preserved", { role: "gestor", active: false });
    const response = await enable(user);
    expect(response.status).toBe(201);
    const [provider] = await linked(user);
    expect(await response.json()).toEqual({ providerId: provider.id, dailyRate: 123.45, localOnly: true });
    expect(provider).toMatchObject({ name: user.name, email: user.email, teamId: user.teamId,
      active: false, dailyRate: "123.45", syncedAt: null, cnpj: null });
    expect(Number.isNaN(Number(provider.decargoId))).toBe(true);
    const [unchanged] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
    expect(unchanged).toEqual(user);
    const audits = await db.select().from(auditLogsTable).where(and(
      eq(auditLogsTable.entityId, user.id), eq(auditLogsTable.action, "diárias habilitadas")));
    expect(audits).toHaveLength(1);
    expect(audits[0].userId).toBe(admin.id);
  });

  it("a duplicate registration never enables or changes the existing person", async () => {
    const user = await person("duplicate", { active: false, role: "gestor" });
    const response = await request("/users", { name: `Changed ${suffix}`, email: user.email.toUpperCase(),
      role: "admin", active: true, teamId: null, dailyRate: 999 });
    expect(response.status).toBe(409);
    expect(await linked(user)).toHaveLength(0);
    const [unchanged] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
    expect(unchanged).toEqual(user);
  });

  it("listing or editing an old manual account cannot silently create a provider", async () => {
    const user = await person("old-manual", { decargoId: `manual-${suffix}` });
    expect((await request("/users", undefined, admin, "GET")).status).toBe(200);
    expect((await request(`/users/${user.id}`, { name: user.name }, admin, "PATCH")).status).toBe(200);
    expect(await linked(user)).toHaveLength(0);
    expect(await db.select().from(providersTable).where(eq(providersTable.decargoId, user.decargoId))).toHaveLength(0);
    expect((await enable(user, 0)).status).toBe(201);
  });

  it("serializes concurrent enablement and never overwrites the winner's rate", async () => {
    const user = await person("race");
    const responses = await Promise.all([enable(user, 100), enable(user, 200)]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const [provider] = await linked(user);
    const winner = responses.find(response => response.status === 201)!;
    const result = await winner.json() as { dailyRate: number };
    expect(Number(provider.dailyRate)).toBe(result.dailyRate);
    expect(await linked(user)).toHaveLength(1);
    expect((await enable(user, 999)).status).toBe(409);
    expect((await linked(user))[0]).toEqual(provider);
  });

  it("rolls back provider and rate if the transactional audit fails", async () => {
    const user = await person("rollback");
    const transaction = db.transaction.bind(db);
    const mock = vi.spyOn(db, "transaction").mockImplementationOnce(callback =>
      transaction(async tx => {
        const insert = tx.insert.bind(tx);
        vi.spyOn(tx, "insert").mockImplementation(table => {
          if (table === auditLogsTable) throw new Error("Intentional test audit failure");
          return insert(table);
        });
        return callback(tx);
      }),
    );
    try {
      expect((await enable(user)).status).toBe(500);
      expect(await linked(user)).toHaveLength(0);
      const [unchanged] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
      expect(unchanged).toEqual(user);
    } finally {
      mock.mockRestore();
    }
  });

  it("rejects pre-existing confirmed and ambiguous provider links without any mutation", async () => {
    for (const [label, ref, email, expected] of [
      ["known", "same", "same", "DIARIAS_ALREADY_ENABLED"],
      ["ambiguous", "other", "same", "PROVIDER_IDENTITY_CONFLICT"],
      ["no-email", "other", "none", "PROVIDER_IDENTITY_CONFLICT"],
    ]) {
      const user = await person(label);
      const [provider] = await db.insert(providersTable).values({
        decargoId: ref === "same" ? user.decargoId : `__provider_${suffix}_${label}`,
        email: email === "same" ? user.email : null, name: user.name, dailyRate: "87.00",
      }).returning();
      providerIds.push(provider.id);
      const response = await enable(user);
      expect(response.status).toBe(409);
      expect((await response.json() as { code: string }).code).toBe(expected);
      expect(await linked(user)).toHaveLength(0);
      expect((await db.select().from(providersTable).where(eq(providersTable.id, provider.id)))[0]).toEqual(provider);
    }
  });

  it("does not borrow a colliding numeric id, and only exposes the person's local diárias", async () => {
    const user = await person("numeric", { decargoId: `98${Date.now()}` });
    const [other] = await db.insert(providersTable).values({
      decargoId: user.decargoId, name: `__Different provider ${suffix}`, teamId,
    }).returning();
    providerIds.push(other.id);
    expect((await enable(user)).status).toBe(201);
    const [own] = await linked(user);
    const rows = await db.insert(diariasTable).values([own, other].map(provider => ({
      providerId: provider.id, teamId, workDate: "2096-01-01", value: "123.45", createdBy: admin.id,
    }))).returning();
    diariaIds.push(...rows.map(row => row.id));
    const list = await request("/diarias", undefined, user, "GET");
    const body = await list.json() as { data: { id: number }[] };
    expect(body.data.map(row => row.id)).toEqual([rows[0].id]);
    expect((await request(`/diarias/${rows[1].id}`, undefined, user, "GET")).status).toBe(404);
    expect((await request(`/diarias/${rows[0].id}`, undefined, user, "GET")).status).toBe(200);
    const [unchanged] = await db.select().from(providersTable).where(eq(providersTable.id, other.id));
    expect(unchanged).toEqual(other);
    // Rebinding the external login identifier does not lose this local link.
    await db.update(usersTable).set({ decargoId: `__rebound_${suffix}` }).where(eq(usersTable.id, user.id));
    const reboundList = await request("/diarias", undefined, user, "GET");
    expect((await reboundList.json() as { data: { id: number }[] }).data.map(row => row.id)).toEqual([rows[0].id]);
  });

  it("never exports locally enabled providers, including falta with a manually entered CNPJ", async () => {
    const user = await person("export");
    expect((await enable(user)).status).toBe(201);
    const [provider] = await linked(user);
    await db.update(providersTable).set({ cnpj: "12345678000100" }).where(eq(providersTable.id, provider.id));
    for (const exportTarget of ["diaria_extra", "falta"] as const) {
      const [type] = await db.insert(diariaTypesTable).values({
        description: `__Enable ${suffix} ${exportTarget}`, exportTarget,
      }).returning();
      typeIds.push(type.id);
      const [diaria] = await db.insert(diariasTable).values({
        providerId: provider.id, teamId, typeId: type.id, workDate: "2096-01-01",
        paymentDate: "2096-02-01", value: "123.45", createdBy: admin.id, status: "disponivel_exportacao",
      }).returning();
      diariaIds.push(diaria.id);
      const response = await request("/diarias/export", { diariaIds: [diaria.id] });
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).toContain("Vínculo apenas local");
      expect((await db.select().from(diariasTable).where(eq(diariasTable.id, diaria.id)))[0]).toEqual(diaria);
    }
    expect(pushDiariasToPeople).not.toHaveBeenCalled();
    expect(pushFaltasToPeople).not.toHaveBeenCalled();
  });

  it("allows only administrators, including when the target is the caller", async () => {
    for (const actor of actors) {
      expect((await request(`/users/${actor.id}/enable-diarias`, { confirmed: true, dailyRate: 10 }, actor)).status).toBe(403);
      expect(await linked(actor)).toHaveLength(0);
    }
    expect((await request(`/users/${admin.id}/enable-diarias`, { confirmed: true, dailyRate: 10 }, null)).status).toBe(401);
  });

  it.each([{}, { confirmed: false, dailyRate: 10 }, { confirmed: true }, { confirmed: true, dailyRate: -1 },
    { confirmed: true, dailyRate: 1.234 }, { confirmed: true, dailyRate: "10" },
    { confirmed: true, dailyRate: 100000000 }])("rejects invalid input without partial writes: %j", async data => {
    const response = await request(`/users/${actors[0].id}/enable-diarias`, data);
    expect(response.status).toBe(400);
    expect(await linked(actors[0])).toHaveLength(0);
  });
  it("validates local user ids and missing accounts", async () => {
    expect((await request("/users/not-a-number/enable-diarias", { confirmed: true, dailyRate: 10 })).status).toBe(400);
    expect((await request("/users/2147483647/enable-diarias", { confirmed: true, dailyRate: 10 })).status).toBe(404);
  });
});
