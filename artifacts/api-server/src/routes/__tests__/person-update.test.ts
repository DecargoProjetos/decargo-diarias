import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, usersTable, providersTable, teamsTable, auditLogsTable, diariaTypesTable, diariasTable, type User } from "@workspace/db";
import app from "../../app";
import { signLocalJwt } from "../../lib/localJwt";
import { localProviderReference, hasLocalProviderReference } from "../../lib/providerIdentity";
import { isolatedPersonDb } from "./helpers/isolatedPersonDb";
import * as peopleClient from "../../lib/peopleClient";
import * as peopleUserSync from "../../lib/peopleUserSync";

let isolated: Awaited<ReturnType<typeof isolatedPersonDb>>;
let server: Server;
let base: string;
let admin: User;
let teamId: number;
let otherTeamId: number;
let typeId: number;
let sequence = 0;
const token = (user: User) => signLocalJwt({
  userId: user.id, decargoId: user.decargoId, email: user.email,
  name: user.name, role: user.role, teamId: user.teamId,
});
async function request(path: string, data?: unknown, actor: User | null = admin, method = "PATCH") {
  return fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json",
      ...(actor ? { Authorization: `Bearer ${token(actor)}` } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
}
async function pair(kind: "local" | "manual" | "email" | "local-reconciled" | "manual-reconciled" = "local", role = "funcionario") {
  const n = ++sequence;
  const [user] = await db.insert(usersTable).values({
    decargoId: kind.startsWith("manual") ? `manual-person-${n}` : `employee-${n}`,
    name: `Person ${n}`, email: `person-${n}@test.invalid`, role, teamId,
  }).returning();
  const [provider] = await db.insert(providersTable).values({
    decargoId: kind === "local" ? localProviderReference(user.id) :
      kind === "manual" ? user.decargoId : `provider-${n}`,
    localReference: kind === "local-reconciled" ? localProviderReference(user.id) :
      kind === "manual-reconciled" ? user.decargoId : null,
    name: user.name, email: kind.startsWith("manual") || kind === "local-reconciled" ? null : user.email,
    teamId, dailyRate: "123.45",
  }).returning();
  return { user, provider };
}
async function current(userId: number, providerId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [provider] = await db.select().from(providersTable).where(eq(providersTable.id, providerId));
  return { user, provider };
}
function version(pair: Awaited<ReturnType<typeof current>>) {
  return {
    expectedUpdatedAt: pair.user.updatedAt.toISOString(),
    expectedProviderId: pair.provider.id,
    expectedProviderUpdatedAt: pair.provider.updatedAt.toISOString(),
  };
}

describe("Atomic person editing (isolated PostgreSQL schema)", () => {
  beforeAll(async () => {
    isolated = await isolatedPersonDb();
    const teams = await db.insert(teamsTable).values([{ name: "Team" }, { name: "Other team" }]).returning();
    [teamId, otherTeamId] = teams.map(t => t.id);
    admin = (await pair("local", "admin")).user;
    const [type] = await db.insert(diariaTypesTable).values({ description: "Extra" }).returning();
    typeId = type.id;
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    if (isolated) await isolated.cleanup();
  });

  it("keeps manual creation separate from enablement after combining the user routes", async () => {
    const input = { name: "Manual merge verification", email: "manual-merge@test.invalid",
      role: "funcionario", teamId, dailyRate: 90 };
    const response = await request("/users", input, admin, "POST");
    expect(response.status).toBe(201);
    const created = await response.json() as { id: number; decargoId: string };
    const [provider] = await db.select().from(providersTable).where(eq(providersTable.decargoId, created.decargoId));
    expect(provider).toMatchObject({ name: input.name, dailyRate: "90.00", teamId, active: true });
    expect((await request("/users", { ...input, active: false }, admin, "POST")).status).toBe(409);
    expect((await current(created.id, provider.id)).user.active).toBe(true);
  });

  it("preserves additive employee synchronization and manual deactivation after the merge", async () => {
    const original = await pair("manual");
    await request(`/users/${original.user.id}`, { active: false });
    const snapshot = await current(original.user.id, original.provider.id);
    const enabled = vi.spyOn(peopleUserSync, "peopleUserSyncEnabled").mockReturnValue(false);
    const fetchEmployees = vi.spyOn(peopleClient, "fetchFuncionarios").mockResolvedValue([{
      id_funcionario: 999001, nome: "Remote changed name",
      email_principal: original.user.email.toUpperCase(), demitido: false,
    }]);
    try {
      const response = await request("/users/sync", {}, admin, "POST");
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ created: 0, skipped: 1, conflicts: 0 });
      expect(await current(original.user.id, original.provider.id)).toEqual(snapshot);
    } finally {
      enabled.mockRestore();
      fetchEmployees.mockRestore();
    }
  });

  for (const kind of ["local", "manual", "email", "local-reconciled", "manual-reconciled"] as const) {
    it(`updates name/team/rate together for ${kind} links without changing IDs or history`, async () => {
      const original = await pair(kind, "gestor");
      const diaria = await request("/diarias", {
        providerId: original.provider.id, teamId, typeId, workDate: "2026-10-09", value: 123.45,
      }, admin, "POST");
      expect(diaria.status).toBe(201);
      const response = await request(`/users/${original.user.id}`, {
        ...version(original), name: "Edited name", teamId: otherTeamId, dailyRate: 250.25,
      });
      expect(response.status).toBe(200);
      const edited = await current(original.user.id, original.provider.id);
      expect(edited.user).toMatchObject({ name: "Edited name", teamId: otherTeamId, role: "gestor",
        decargoId: original.user.decargoId });
      expect(edited.provider).toMatchObject({ name: "Edited name", teamId: otherTeamId, dailyRate: "250.25",
        decargoId: original.provider.decargoId });
      expect(edited.provider.localReference).toBe(original.provider.localReference);
      expect(hasLocalProviderReference(edited.provider.decargoId)).toBe(kind === "local" || kind === "manual");
      const [historical] = await db.select().from(diariasTable).where(eq(diariasTable.providerId, original.provider.id));
      expect(historical).toMatchObject({ teamId, value: "123.45", providerId: original.provider.id });
      const audits = await db.select().from(auditLogsTable).where(eq(auditLogsTable.action, "atualizado"));
      expect(audits.some(a => a.entityType === "user" && a.entityId === original.user.id)).toBe(true);
      expect(audits.some(a => a.entityType === "provider" && a.entityId === original.provider.id)).toBe(true);
      if (kind.endsWith("reconciled")) {
        expect((await request(`/users/${edited.user.id}`, { ...version(edited), active: false })).status).toBe(200);
        expect((await current(edited.user.id, edited.provider.id)).provider.active).toBe(false);
        const active = await request("/providers?activeOnly=true", undefined, admin, "GET");
        expect((await active.json() as { id: number }[]).some(p => p.id === edited.provider.id)).toBe(false);
      }
    });
  }

  for (const failure of ["provider", "audit"] as const) {
    it(`rolls back every write and audit when ${failure} fails after the user write`, async () => {
      const original = await pair();
      const transaction = vi.mocked(db.transaction).getMockImplementation()!;
      const spy = vi.spyOn(db, "transaction").mockImplementationOnce(callback => transaction(async tx => {
        if (failure === "provider") {
          const update = tx.update.bind(tx);
          vi.spyOn(tx, "update").mockImplementation(table => {
            if (table === providersTable) throw new Error("Injected second write failure");
            return update(table);
          });
        } else {
          const insert = tx.insert.bind(tx);
          let count = 0;
          vi.spyOn(tx, "insert").mockImplementation(table => {
            if (table === auditLogsTable && ++count === 2) throw new Error("Injected audit failure");
            return insert(table);
          });
        }
        return callback(tx);
      }));
      try {
        expect((await request(`/users/${original.user.id}`, {
          ...version(original), name: "Must roll back", teamId: otherTeamId, active: false, dailyRate: 999,
        })).status).toBe(500);
        expect(await current(original.user.id, original.provider.id)).toEqual(original);
        expect(await db.select().from(auditLogsTable).where(eq(auditLogsTable.entityId, original.user.id))).toHaveLength(0);
      } finally {
        // Restore the scoped implementation, not the original unscoped method.
        spy.mockImplementation(transaction);
      }
    });
  }

  it("rejects the loser of concurrent edits instead of overwriting the winner", async () => {
    const original = await pair();
    const responses = await Promise.all([100, 200].map(dailyRate => request(`/users/${original.user.id}`, {
      ...version(original), name: `Rate ${dailyRate}`, teamId: otherTeamId, dailyRate,
    })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const edited = await current(original.user.id, original.provider.id);
    expect(edited.user.name).toBe(`Rate ${Number(edited.provider.dailyRate)}`);
    const loser = responses.find(r => r.status === 409)!;
    expect(await loser.json()).toMatchObject({ code: "PERSON_EDIT_CONFLICT" });
  });

  it("detects a direct provider edit in an already-open user editor", async () => {
    const original = await pair();
    expect((await request(`/providers/${original.provider.id}`, {
      expectedUpdatedAt: original.provider.updatedAt.toISOString(), dailyRate: 222,
    })).status).toBe(200);
    expect((await request(`/users/${original.user.id}`, {
      ...version(original), name: "Stale", dailyRate: 123.45,
    })).status).toBe(409);
    expect((await current(original.user.id, original.provider.id)).provider.dailyRate).toBe("222.00");
  });

  it("rejects an editor opened before a person was enabled for diárias", async () => {
    const [user] = await db.insert(usersTable).values({
      decargoId: "not-yet-enabled", name: "Not yet enabled", email: "not-enabled@test.invalid",
      role: "funcionario", teamId,
    }).returning();
    expect((await request(`/users/${user.id}/enable-diarias`, { confirmed: true, dailyRate: 111 },
      admin, "POST")).status).toBe(201);
    expect((await request(`/users/${user.id}`, {
      expectedUpdatedAt: user.updatedAt.toISOString(), expectedProviderId: null,
      expectedProviderUpdatedAt: null, name: "Stale edit", active: false,
    })).status).toBe(409);
    const [provider] = await db.select().from(providersTable)
      .where(eq(providersTable.decargoId, localProviderReference(user.id)));
    expect(await current(user.id, provider.id)).toMatchObject({
      user: { name: user.name, active: true }, provider: { name: user.name, active: true, dailyRate: "111.00" },
    });
  });

  it("serializes editing against deactivation and removes the provider from operational lists", async () => {
    const original = await pair();
    const responses = await Promise.all([
      request(`/users/${original.user.id}`, { ...version(original), active: false }),
      request(`/providers/${original.provider.id}`, {
        expectedUpdatedAt: original.provider.updatedAt.toISOString(), name: "Concurrent",
      }),
    ]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const fresh = await current(original.user.id, original.provider.id);
    if (fresh.user.active) {
      expect((await request(`/users/${fresh.user.id}`, { ...version(fresh), active: false })).status).toBe(200);
    }
    const disabled = await current(original.user.id, original.provider.id);
    expect(disabled.user.active).toBe(false);
    expect(disabled.provider.active).toBe(false);
    const active = await request("/providers?activeOnly=true", undefined, admin, "GET");
    expect((await active.json() as { id: number }[]).some(p => p.id === original.provider.id)).toBe(false);
    expect((await request("/diarias", {
      providerId: original.provider.id, teamId, typeId, workDate: "2026-10-09", value: 123.45,
    }, admin, "POST")).status).toBe(400);
    expect((await request("/users", undefined, original.user, "GET")).status).toBe(401);
    expect((await request(`/providers/${disabled.provider.id}`, {
      expectedUpdatedAt: disabled.provider.updatedAt.toISOString(), active: true,
    })).status).toBe(200);
    const reactivated = await current(original.user.id, original.provider.id);
    expect(reactivated.user.active && reactivated.provider.active).toBe(true);
  });

  it("hides legacy status drift and rejects stale selections even before any edit", async () => {
    const original = await pair("email");
    await db.update(usersTable).set({ active: false }).where(eq(usersTable.id, original.user.id));
    const response = await request("/providers?activeOnly=true", undefined, admin, "GET");
    expect((await response.json() as { id: number }[]).some(p => p.id === original.provider.id)).toBe(false);
    expect((await request("/diarias", {
      providerId: original.provider.id, teamId, typeId, workDate: "2026-10-09", value: 100,
    }, admin, "POST")).status).toBe(400);
  });

  for (const ambiguousSide of ["providers", "users"] as const) {
    it(`blocks active candidates for an inactive email even with duplicate ${ambiguousSide}`, async () => {
      const original = await pair("email");
      await db.update(usersTable).set({ active: false }).where(eq(usersTable.id, original.user.id));
      const candidates = [original.provider.id];
      if (ambiguousSide === "providers") {
        const [duplicate] = await db.insert(providersTable).values({
          decargoId: `ambiguous-provider-${original.user.id}`, name: "Ambiguous provider",
          email: ` ${original.user.email.toUpperCase()} `, active: true, teamId, dailyRate: "100.00",
        }).returning();
        candidates.push(duplicate.id);
      } else {
        await db.insert(usersTable).values({
          decargoId: `ambiguous-user-${original.user.id}`, name: "Ambiguous active account",
          email: ` ${original.user.email.toUpperCase()} `, active: true, role: "funcionario",
        });
      }
      const active = await request("/providers?activeOnly=true", undefined, admin, "GET");
      expect(active.status).toBe(200);
      const activeIds = (await active.json() as { id: number }[]).map(p => p.id);
      for (const providerId of candidates) {
        expect(activeIds).not.toContain(providerId);
        expect((await request("/diarias", {
          providerId, teamId, typeId, workDate: "2026-10-09", value: 100,
        }, admin, "POST")).status).toBe(400);
        expect(await db.select().from(diariasTable).where(eq(diariasTable.providerId, providerId))).toHaveLength(0);
      }
      // Administrative visibility remains available for reconciliation.
      const all = await request("/providers", undefined, admin, "GET");
      expect((await all.json() as { id: number }[]).map(p => p.id)).toEqual(expect.arrayContaining(candidates));
    });
  }

  it("does not block an explicit local owner due to another inactive account's email or coincident numeric ID", async () => {
    const original = await pair("local");
    await db.insert(usersTable).values({
      decargoId: String(original.provider.id), name: original.provider.name,
      email: original.user.email, active: false, role: "funcionario",
    });
    const active = await request("/providers?activeOnly=true", undefined, admin, "GET");
    expect((await active.json() as { id: number }[]).some(p => p.id === original.provider.id)).toBe(true);
    expect((await request("/diarias", {
      providerId: original.provider.id, teamId, typeId, workDate: "2026-10-09", value: 100,
    }, admin, "POST")).status).toBe(201);
  });

  it("does not deadlock when a person launches their own diária while another admin deactivates them", async () => {
    const original = await pair("local", "admin");
    const [creation, deactivation] = await Promise.all([
      request("/diarias", {
        providerId: original.provider.id, teamId, typeId, workDate: "2026-10-09", value: 100,
      }, original.user, "POST"),
      request(`/users/${original.user.id}`, { ...version(original), active: false }),
    ]);
    expect(deactivation.status).toBe(200);
    expect([201, 400, 401]).toContain(creation.status);
    const disabled = await current(original.user.id, original.provider.id);
    expect(disabled.user.active || disabled.provider.active).toBe(false);
  });

  it("does not associate matching numeric IDs or names, and never enables an unlinked user while editing", async () => {
    const original = await pair("email");
    await db.update(providersTable).set({
      decargoId: original.user.decargoId, name: original.user.name, email: null,
    }).where(eq(providersTable.id, original.provider.id));
    expect((await request(`/users/${original.user.id}`, {
      name: "Unlinked edit", teamId: otherTeamId, active: false, expectedProviderId: null,
    })).status).toBe(200);
    const edited = await current(original.user.id, original.provider.id);
    expect(edited.provider).toMatchObject({ name: original.provider.name, active: true, teamId });
    expect((await request(`/users/${original.user.id}`, { dailyRate: 5 })).status).toBe(409);
    expect((await db.select().from(providersTable)).filter(p => p.decargoId === localProviderReference(original.user.id))).toHaveLength(0);
  });

  it("preserves admin-confirmed email ownership of an email-less synced provider", async () => {
    const original = await pair("email");
    await db.update(providersTable).set({ email: null }).where(eq(providersTable.id, original.provider.id));
    const response = await request(`/providers/${original.provider.id}`, { email: original.user.email.toUpperCase() });
    expect(response.status).toBe(200);
    expect((await current(original.user.id, original.provider.id)).provider.email).toBe(original.user.email);
    expect((await request(`/users/${original.user.id}`, { active: false })).status).toBe(200);
    expect((await current(original.user.id, original.provider.id)).provider.active).toBe(false);
  });

  it("rejects ambiguous links, invalid teams, malformed values and unauthorized edits without mutation", async () => {
    const original = await pair("email");
    for (const data of [{ dailyRate: -1 }, { dailyRate: 10.001 }, { active: "false" },
      { teamId: 999999 }, { teamId: 1.5 }, { name: " " }, { expectedUpdatedAt: "not-a-date" }]) {
      expect((await request(`/users/${original.user.id}`, data)).status).toBe(400);
      expect((await request(`/providers/${original.provider.id}`, data)).status).toBe(400);
    }
    expect((await request(`/users/${original.user.id}`, { active: false }, null)).status).toBe(401);
    expect((await request(`/providers/${original.provider.id}`, { active: false }, original.user)).status).toBe(403);
    await db.insert(providersTable).values({
      decargoId: "ambiguous", name: "Another provider", email: original.user.email,
    });
    expect((await request(`/users/${original.user.id}`, { active: false })).status).toBe(409);
    expect(await current(original.user.id, original.provider.id)).toEqual(original);
  });
});
