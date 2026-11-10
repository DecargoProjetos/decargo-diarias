import { randomUUID, randomInt } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool, usersTable, providersTable, diariasTable, teamsTable, auditLogsTable, type Provider, type User } from "@workspace/db";
import app from "../../app";
import { signLocalJwt } from "../../lib/localJwt";
import * as people from "../../lib/peopleClient";
import { linkedProviderSql, providerBelongsToUser } from "../../lib/providerIdentity";

const suffix = randomUUID();
let admin: User, manager: User;
let server: Server, base: string, teamId: number;
let remote: people.Prestador[] = [];
const userIds: number[] = [], providerIds: number[] = [], diariaIds: number[] = [];
let sequence = randomInt(100000000, 900000000);

function cnpjFixture(): string {
  let digits = `87${String(sequence++).padStart(10, "0")}`;
  for (const length of [12, 13]) {
    let weight = length - 7, sum = 0;
    for (const digit of digits) {
      sum += Number(digit) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    digits += String(remainder < 2 ? 0 : 11 - remainder);
  }
  return digits;
}
function remotePerson(cnpj = cnpjFixture()): people.Prestador {
  return { id_prestador: sequence++, titular_do_contrato: `__RECON_REMOTE_${suffix}`,
    cnpj, tem_contrato_ativo: true, data_inicio_contrato: null, data_fim_contrato: null };
}
async function request(path: string, data?: unknown, actor = admin) {
  const response = await fetch(`${base}/api${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signLocalJwt({
      userId: actor.id, decargoId: actor.decargoId, email: actor.email, name: actor.name,
      role: actor.role as "admin", teamId: actor.teamId,
    })}` },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: response.status, data: await response.json() };
}
async function localPerson(legacy = false) {
  const [user] = await db.insert(usersTable).values({
    decargoId: `manual-${randomUUID()}`, name: `__RECON_LOCAL_${randomUUID()}`,
    email: `recon-${randomUUID()}@test.invalid`, role: "gestor", teamId, active: true,
  }).returning();
  userIds.push(user.id);
  const [provider] = await db.insert(providersTable).values({
    decargoId: legacy ? user.decargoId : `local-user:${user.id}`, name: user.name, email: user.email,
    teamId, dailyRate: "321.45", active: false,
  }).returning();
  providerIds.push(provider.id);
  return { user, provider };
}
async function imported(person: people.Prestador, fields: Partial<Provider> = {}) {
  const [provider] = await db.insert(providersTable).values({
    decargoId: String(person.id_prestador), name: person.titular_do_contrato,
    cnpj: person.cnpj, active: true, syncedAt: new Date(), ...fields,
  }).returning();
  providerIds.push(provider.id);
  return provider;
}
function input(local: Provider, person = remote[0]) {
  return { externalId: String(person.id_prestador), action: "link", localProviderId: local.id,
    verifiedCnpj: person.cnpj, evidence: "Contrato e documento do titular conferidos independentemente.", confirmed: true };
}
async function diaria(providerId: number) {
  const [record] = await db.insert(diariasTable).values({
    providerId, teamId, createdBy: admin.id, workDate: "2026-10-01", value: "321.45",
  }).returning();
  diariaIds.push(record.id);
  return record;
}

describe("Provider reconciliation HTTP contract and preservation", () => {
  beforeAll(async () => {
    const target = await pool.query("SELECT current_database() AS name");
    if (process.env.NODE_ENV === "production" || target.rows[0].name !== "heliumdb") {
      throw new Error("Reconciliation fixtures require the Replit development database");
    }
    vi.stubEnv("PEOPLE_USER_SYNC_ENABLED", "false");
    [admin, manager] = await db.insert(usersTable).values(["admin", "gestor"].map(role => ({
      decargoId: `__RECON_${role}_${suffix}`, name: `__RECON_ACTOR_${role}_${suffix}`,
      email: `recon-${role}-${suffix}@test.invalid`, role, active: true,
    }))).returning();
    userIds.push(admin.id, manager.id);
    const [team] = await db.insert(teamsTable).values({ name: `__RECON_TEAM_${suffix}` }).returning();
    teamId = team.id;
    vi.spyOn(people, "fetchPrestadores").mockImplementation(async () => remote);
    vi.spyOn(people, "fetchFuncionarios").mockResolvedValue([]);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => { remote = [remotePerson()]; });
  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (admin) await db.delete(auditLogsTable).where(eq(auditLogsTable.userId, admin.id));
    if (diariaIds.length) await db.delete(diariasTable).where(inArray(diariasTable.id, diariaIds));
    if (providerIds.length) await db.delete(providersTable).where(inArray(providersTable.id, providerIds));
    if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    if (teamId) await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
    if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  });
  it("withholds new remote prestadores instead of duplicating local people on sync/reload", async () => {
    const { provider } = await localPerson();
    const before = await db.select().from(providersTable).where(eq(providersTable.id, provider.id));
    for (let i = 0; i < 2; i++) {
      const result = await request("/providers/sync", {});
      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({ created: 0, pending: 1 });
    }
    expect(await db.select().from(providersTable).where(eq(providersTable.decargoId, String(remote[0].id_prestador)))).toHaveLength(0);
    expect(await db.select().from(providersTable).where(eq(providersTable.id, provider.id))).toEqual(before);
    const list = await request("/providers/reconciliation");
    expect(list.status).toBe(200);
    expect(list.data).toContainEqual(expect.objectContaining({ externalId: String(remote[0].id_prestador) }));
  });
  it.each([false, true])("preserves local user/provider/history and stable ownership (legacy=%s)", async legacy => {
    const { user, provider } = await localPerson(legacy);
    const history = await diaria(provider.id);
    expect((await request("/providers/reconciliation", input(provider))).status).toBe(200);
    const [updated] = await db.select().from(providersTable).where(eq(providersTable.id, provider.id));
    providerIds.push(updated.id);
    expect(updated).toMatchObject({
      id: provider.id, decargoId: String(remote[0].id_prestador), localReference: provider.decargoId,
      email: provider.email, name: provider.name, teamId, dailyRate: "321.45", active: false,
    });
    expect(await db.select().from(usersTable).where(eq(usersTable.id, user.id))).toEqual([user]);
    expect(await db.select().from(diariasTable).where(eq(diariasTable.id, history.id))).toEqual([history]);
    expect(providerBelongsToUser(updated, user)).toBe(true);
    const linked = await pool.query(`SELECT ${linkedProviderSql("$1")} AS id`, [user.id]);
    expect(linked.rows[0].id).toBe(provider.id);
    const audits = await db.select().from(auditLogsTable).where(eq(auditLogsTable.entityId, provider.id));
    expect(audits.some(a => a.action === "identidade People reconciliada" && a.newValues)).toBe(true);
    expect((await request("/providers/sync", {})).data).toMatchObject({ created: 0, skipped: 1, pending: 0 });
  });
  it("requires administrator role and explicit independently verified evidence", async () => {
    const { provider } = await localPerson();
    expect((await request("/providers/reconciliation", input(provider), manager)).status).toBe(403);
    expect((await request("/providers/reconciliation", undefined, manager)).status).toBe(403);
    for (const changed of [
      { confirmed: false }, { evidence: "name" }, { verifiedCnpj: "invalid" }, { localProviderId: undefined },
    ]) expect((await request("/providers/reconciliation", { ...input(provider), ...changed })).status).toBe(400);
    expect((await request("/providers/reconciliation", { ...input(provider), verifiedCnpj: cnpjFixture() })).status).toBe(409);
    expect(await db.select().from(providersTable).where(eq(providersTable.id, provider.id))).toEqual([provider]);
  });
  it("re-fetches People and rejects removed or changed evidence before linking", async () => {
    const { provider } = await localPerson();
    const confirmation = input(provider);
    remote = [];
    expect((await request("/providers/reconciliation", confirmation)).status).toBe(409);
    remote = [{ ...remotePerson(), id_prestador: Number(confirmation.externalId) }];
    expect((await request("/providers/reconciliation", confirmation)).status).toBe(409);
    expect(await db.select().from(providersTable).where(eq(providersTable.id, provider.id))).toEqual([provider]);
  });
  it("blocks ambiguous upstream IDs and CNPJ collisions with other local people", async () => {
    const { provider } = await localPerson();
    remote.push({ ...remote[0] });
    expect((await request("/providers/reconciliation", input(provider))).status).toBe(409);
    const candidates = await request("/providers/reconciliation");
    expect((candidates.data as Array<{ conflict: string | null }>)[0].conflict).toContain("identificador");
    remote.pop();
    const other = await localPerson();
    await db.update(providersTable).set({ cnpj: remote[0].cnpj }).where(eq(providersTable.id, other.provider.id));
    expect((await request("/providers/reconciliation", input(provider))).status).toBe(409);
  });
  it("resolves only pristine already-imported duplicates, keeping the local provider id", async () => {
    const { provider } = await localPerson();
    const duplicate = await imported(remote[0], { active: false });
    expect((await request("/providers/reconciliation", input(provider))).status).toBe(200);
    expect(await db.select().from(providersTable).where(eq(providersTable.id, duplicate.id))).toHaveLength(0);
    const [updated] = await db.select().from(providersTable).where(eq(providersTable.id, provider.id));
    expect(updated.active).toBe(false);
    expect(updated.dailyRate).toBe("321.45");
  });
  it("refuses to discard a duplicate's existing diária history", async () => {
    const { provider } = await localPerson();
    const duplicate = await imported(remote[0]);
    const history = await diaria(duplicate.id);
    expect((await request("/providers/reconciliation", input(provider))).status).toBe(409);
    expect(await db.select().from(providersTable).where(eq(providersTable.id, provider.id))).toEqual([provider]);
    expect(await db.select().from(providersTable).where(eq(providersTable.id, duplicate.id))).toEqual([duplicate]);
    expect(await db.select().from(diariasTable).where(eq(diariasTable.id, history.id))).toEqual([history]);
  });
  it("refuses to discard a duplicate's administrator edits recorded in audit", async () => {
    const { provider } = await localPerson();
    const duplicate = await imported(remote[0]);
    await db.insert(auditLogsTable).values({
      userId: admin.id, entityType: "provider", entityId: duplicate.id, action: "atualizado",
      newValues: { active: false },
    });
    expect((await request("/providers/reconciliation", input(provider))).status).toBe(409);
  });
  it("allows only one confirmation when two requests race, and rejects later rebindings", async () => {
    const { provider } = await localPerson();
    const results = await Promise.all([
      request("/providers/reconciliation", input(provider)),
      request("/providers/reconciliation", input(provider)),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const another = await localPerson();
    expect((await request("/providers/reconciliation", input(another.provider))).status).toBe(409);
  });
  it("allows separately confirmed homonyms, without linking or changing existing people", async () => {
    const { provider } = await localPerson();
    remote[0].titular_do_contrato = provider.name;
    const result = await request("/providers/reconciliation", {
      ...input(provider), action: "separate", localProviderId: undefined, verifiedCnpj: undefined,
    });
    expect(result.status).toBe(200);
    const [created] = await db.select().from(providersTable).where(eq(providersTable.decargoId, String(remote[0].id_prestador)));
    providerIds.push(created.id);
    expect(created.localReference).toBeNull();
    expect(await db.select().from(providersTable).where(eq(providersTable.id, provider.id))).toEqual([provider]);
    expect((await request("/providers/reconciliation", { ...input(provider), action: "separate" })).status).toBe(409);
  });
  it("refuses separate import when a CNPJ is already assigned locally", async () => {
    const { provider } = await localPerson();
    await db.update(providersTable).set({ cnpj: remote[0].cnpj }).where(eq(providersTable.id, provider.id));
    expect((await request("/providers/reconciliation", { ...input(provider), action: "separate" })).status).toBe(409);
  });
  it("employee synchronization preserves email-matched local accounts and reports numeric collisions", async () => {
    const { user, provider } = await localPerson();
    const employeeId = sequence++;
    const employees = vi.mocked(people.fetchFuncionarios);
    employees.mockResolvedValueOnce([{
      id_funcionario: employeeId, nome: "Remote changed name", email_principal: ` ${user.email.toUpperCase()} `,
      demitido: false,
    }]);
    expect((await request("/users/sync", {})).data).toMatchObject({ created: 0, skipped: 1, conflicts: 0 });
    expect(await db.select().from(usersTable).where(eq(usersTable.id, user.id))).toEqual([user]);
    expect(await db.select().from(providersTable).where(eq(providersTable.id, provider.id))).toEqual([provider]);
    const [collision] = await db.insert(usersTable).values({
      decargoId: String(employeeId), name: "__RECON_UNRELATED_ACCOUNT__", email: `collision-${suffix}@test.invalid`,
      role: "prestador", active: false,
    }).returning();
    userIds.push(collision.id);
    employees.mockResolvedValueOnce([{
      id_funcionario: employeeId, nome: "Different person", email_principal: `different-${suffix}@test.invalid`,
      demitido: false,
    }]);
    expect((await request("/users/sync", {})).data).toMatchObject({ created: 0, skipped: 0, conflicts: 1 });
    expect(await db.select().from(usersTable).where(eq(usersTable.id, collision.id))).toEqual([collision]);
  });
  it("employee synchronization rejects ambiguous local emails without selecting a first match", async () => {
    const first = await localPerson();
    const second = await localPerson();
    await db.update(usersTable).set({ email: first.user.email }).where(eq(usersTable.id, second.user.id));
    vi.mocked(people.fetchFuncionarios).mockResolvedValueOnce([{
      id_funcionario: sequence++, nome: first.user.name, email_principal: first.user.email, demitido: false,
    }]);
    expect((await request("/users/sync", {})).data).toMatchObject({ created: 0, skipped: 0, conflicts: 1 });
  });
});
