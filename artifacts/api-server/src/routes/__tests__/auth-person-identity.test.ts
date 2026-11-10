import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import app from "../../app";
import { db, pool, usersTable, providersTable, teamsTable, diariasTable, auditLogsTable } from "@workspace/db";
import { signLocalJwt } from "../../lib/localJwt";
import * as peopleClient from "../../lib/peopleClient";

let server: Server;
let base: string;
const userIds: number[] = [];
const providerIds: number[] = [];
const diariaIds: number[] = [];
const auditIds: number[] = [];
let teamId: number;
const suffix = randomUUID();
let counter = 0;
type HandoffBody = { access_token: string; usuario: { id: number; role: string; teamId: number | null } };
type DiariaList = { data: Array<{ id: number }>; total: number };
type ProviderList = Array<{ id: number; decargoId: string; dailyRate: string | null }>;

beforeAll(async () => {
  // Refuse to run these mutating fixtures against an external/production DB.
  const target = await pool.query("SELECT current_database() AS name");
  if (process.env.NODE_ENV === "production" || target.rows[0].name !== "heliumdb") {
    throw new Error("Identity fixtures require the Replit development database");
  }
  vi.stubEnv("SESSION_SECRET", "identity-fixture-session");
  vi.stubEnv("DECARGO_ID_HANDOFF_SECRET", "identity-fixture-handoff");
  vi.stubEnv("DECARGO_ID_APP_CODE", "identity-fixture-app");
  vi.stubEnv("PEOPLE_USER_SYNC_ENABLED", "false");
  const [team] = await db.insert(teamsTable).values({ name: `__IDENTITY_${suffix}` }).returning();
  teamId = team.id;
  await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (auditIds.length) await db.delete(auditLogsTable).where(inArray(auditLogsTable.id, auditIds));
  if (diariaIds.length) await db.delete(diariasTable).where(inArray(diariasTable.id, diariaIds));
  if (providerIds.length) await db.delete(providersTable).where(inArray(providersTable.id, providerIds));
  if (teamId) await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
  if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function person(role = "prestador", decargoId = `manual-${randomUUID()}`) {
  const [user] = await db.insert(usersTable).values({
    decargoId, name: "__IDENTITY_SAME_NAME__", email: `identity-${suffix}-${counter++}@test.invalid`,
    role, teamId, active: true,
  }).returning();
  userIds.push(user.id);
  return user;
}

async function provider(user: Awaited<ReturnType<typeof person>>, options: { decargoId?: string; email?: string | null } = {}) {
  const [p] = await db.insert(providersTable).values({
    decargoId: options.decargoId ?? user.decargoId,
    email: options.email === undefined ? user.email : options.email,
    name: user.name, teamId, dailyRate: "321.45", active: true,
  }).returning();
  providerIds.push(p.id);
  const [diaria] = await db.insert(diariasTable).values({
    providerId: p.id, teamId, createdBy: user.id, workDate: "2096-06-15",
    value: "321.45", status: "pendente_aprovacao",
  }).returning();
  diariaIds.push(diaria.id);
  return { p, diaria };
}

function session(user: Awaited<ReturnType<typeof person>>) {
  return signLocalJwt({ userId: user.id, decargoId: user.decargoId, email: user.email,
    name: user.name, role: user.role, teamId: user.teamId });
}

function get(path: string, token: string) {
  return fetch(`${base}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

function authenticatedWrite(path: string, token: string, body: unknown, method = "PATCH") {
  return fetch(`${base}/api${path}`, { method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body) });
}

async function handoff(user: Awaited<ReturnType<typeof person>>, claims: Record<string, unknown> = {}) {
  const token = jwt.sign({
    sub: user.email, email: user.email, name: user.name, id_usuario: 810000000 + counter++,
    papel: "admin", email_verified: true, jti: randomUUID(), ...claims,
  }, process.env.DECARGO_ID_HANDOFF_SECRET!, {
    issuer: "decargo-id", audience: process.env.DECARGO_ID_APP_CODE!, expiresIn: 90,
  });
  return fetch(`${base}/api/auth/handoff`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
}

describe("manual person → DECARGO ID, stable financial ownership", () => {
  it.each(["prestador", "funcionario", "gestor", "admin"])("preserves the %s account, provider, rate and diária after repeated login", async role => {
    const user = await person(role);
    const { p, diaria } = await provider(user);
    for (let i = 0; i < 2; i++) {
      const response = await handoff(user);
      expect(response.status).toBe(200);
      const body = await response.json() as HandoffBody;
      expect(body.usuario).toMatchObject({ id: user.id, role, teamId });
      const me = await get("/auth/me", body.access_token);
      expect(await me.json()).toMatchObject({ id: user.id, decargoId: user.decargoId, role });
      if (role !== "gestor") {
        const detail = await get(`/diarias/${diaria.id}`, body.access_token);
        expect(detail.status).toBe(200);
        expect(await detail.json()).toMatchObject({ id: diaria.id, providerId: p.id,
          value: role === "admin" ? "321.45" : null });
      }
      const [stored] = await db.select().from(diariasTable).where(eq(diariasTable.id, diaria.id));
      expect(stored).toMatchObject({ providerId: p.id, value: "321.45", createdBy: user.id });
      const [storedProvider] = await db.select().from(providersTable).where(eq(providersTable.id, p.id));
      expect(storedProvider).toMatchObject({ decargoId: p.decargoId, dailyRate: "321.45" });
    }
    if (role === "prestador" || role === "funcionario") {
      const oldSessionList = await get(`/diarias?providerId=${p.id}`, session(user));
      expect((await oldSessionList.json() as DiariaList).data.map(r => r.id)).toEqual([diaria.id]);
    }
  });

  it("does not grant a missing link by numeric collision or the same name", async () => {
    const user = await person("funcionario", String(820000000 + counter++));
    const other = await person();
    const { p, diaria } = await provider(other, { decargoId: user.decargoId });
    const response = await handoff(user, { id_usuario: Number(user.decargoId) });
    expect(response.status).toBe(200);
    const { access_token } = await response.json() as HandoffBody;
    expect((await get(`/diarias/${diaria.id}`, access_token)).status).toBe(404);
    const list = await get(`/diarias?providerId=${p.id}`, access_token);
    expect(await list.json()).toMatchObject({ data: [], total: 0 });
  });

  it("recovers an older rebound account by unique normalized email, without rewriting any provider", async () => {
    const user = await person("prestador", String(830000000 + counter++));
    const { p, diaria } = await provider(user, {
      decargoId: `manual-${randomUUID()}`, email: ` ${user.email.toUpperCase()} `,
    });
    const response = await handoff(user, { email: ` ${user.email.toUpperCase()} ` });
    expect(response.status).toBe(200);
    const { access_token } = await response.json() as HandoffBody;
    const detail = await get(`/diarias/${diaria.id}`, access_token);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ providerId: p.id, value: null });
    const list = await get(`/diarias?providerId=${p.id}`, access_token);
    expect((await list.json() as DiariaList).data.map(r => r.id)).toEqual([diaria.id]);
    const providersResponse = await get("/providers", access_token);
    expect((await providersResponse.json() as ProviderList).find(row => row.id === p.id))
      .toMatchObject({ decargoId: p.decargoId, dailyRate: null });
  });

  it.each([null, "", "other@test.invalid"])("handles manual provider email %s without numeric/name guesses", async email => {
    const user = await person();
    const { p, diaria } = await provider(user, { email });
    const response = await handoff(user);
    expect(response.status).toBe(200);
    const { access_token } = await response.json() as HandoffBody;
    expect((await get(`/diarias/${diaria.id}`, access_token)).status).toBe(email === "other@test.invalid" ? 404 : 200);
    const list = await get(`/diarias?providerId=${p.id}`, access_token);
    expect((await list.json() as DiariaList).total).toBe(email === "other@test.invalid" ? 0 : 1);
  });

  it("fails closed when providers share an email", async () => {
    const user = await person();
    const first = await provider(user);
    const second = await provider(user, { decargoId: `manual-${randomUUID()}` });
    const response = await handoff(user);
    expect(response.status).toBe(200);
    const { access_token } = await response.json() as HandoffBody;
    for (const { p, diaria } of [first, second]) {
      expect((await get(`/diarias/${diaria.id}`, access_token)).status).toBe(404);
      expect(await (await get(`/diarias?providerId=${p.id}`, access_token)).json()).toMatchObject({ total: 0, data: [] });
    }
  });

  it("fails closed for duplicate user emails, including already-issued sessions", async () => {
    const user = await person();
    const { p, diaria } = await provider(user);
    const token = session(user);
    const duplicate = await person();
    await db.update(usersTable).set({ email: ` ${user.email.toUpperCase()} ` }).where(eq(usersTable.id, duplicate.id));
    expect((await handoff(user)).status).toBe(409);
    expect((await get(`/diarias/${diaria.id}`, token)).status).toBe(404);
    expect(await (await get(`/diarias?providerId=${p.id}`, token)).json()).toMatchObject({ total: 0, data: [] });
  });

  it.each([true, false])("preserves both people on active=%s account ID collision", async active => {
    const user = await person();
    const own = await provider(user);
    const other = await person("admin", String(840000000 + counter++));
    const unrelated = await provider(other);
    await db.update(usersTable).set({ active }).where(eq(usersTable.id, other.id));
    const response = await handoff(user, { id_usuario: Number(other.decargoId) });
    expect(response.status).toBe(200);
    const { access_token, usuario } = await response.json() as HandoffBody;
    expect(usuario).toMatchObject({ id: user.id, role: "prestador" });
    expect((await get(`/diarias/${own.diaria.id}`, access_token)).status).toBe(200);
    expect((await get(`/diarias/${unrelated.diaria.id}`, access_token)).status).toBe(404);
    const [unchanged] = await db.select().from(usersTable).where(eq(usersTable.id, other.id));
    expect(unchanged).toMatchObject({ email: other.email, decargoId: other.decargoId, role: "admin", active });
  });

  it("rejects an inactive email-matched account without changing its identity", async () => {
    const user = await person();
    await db.update(usersTable).set({ active: false }).where(eq(usersTable.id, user.id));
    expect((await handoff(user)).status).toBe(403);
    const [stored] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
    expect(stored).toMatchObject({ decargoId: user.decargoId, active: false });
    expect((await get("/auth/me", session(user))).status).toBe(401);
  });

  it("revalidates permissions from the DB, not the old JWT role", async () => {
    const user = await person("admin");
    const { diaria } = await provider(user);
    const token = session(user);
    await db.update(usersTable).set({ role: "prestador" }).where(eq(usersTable.id, user.id));
    expect(await (await get(`/diarias/${diaria.id}`, token)).json()).toMatchObject({ value: null });
  });

  it.each([
    { email_verified: false }, { email_verified: "true" }, { email: null },
    { email: "" }, { sub: "different@test.invalid" }, { id_usuario: "123" },
  ])("rejects invalid identity claims %j without modifying the account", async claims => {
    const user = await person();
    expect((await handoff(user, claims)).status).toBe(401);
    const [stored] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
    expect(stored).toMatchObject({ decargoId: user.decargoId, email: user.email, role: user.role });
  });

  it("accepts the legacy signed-email handoff with no email_verified flag", async () => {
    const user = await person();
    expect((await handoff(user, { email_verified: undefined })).status).toBe(200);
  });

  it("returns an empty scope when the person has no provider at all", async () => {
    const user = await person();
    const response = await handoff(user);
    expect(response.status).toBe(200);
    const { access_token } = await response.json() as HandoffBody;
    expect(await (await get("/diarias", access_token)).json()).toMatchObject({ total: 0, data: [] });
    expect(await db.select().from(providersTable).where(eq(providersTable.email, user.email))).toEqual([]);
  });

  it("retains synced provider ownership after an explicit admin-confirmed email link and repeated handoff", async () => {
    const admin = await person("admin");
    const user = await person("prestador", String(850000000 + counter++));
    const remoteId = 860000000 + counter++;
    // Exactly the People sync shape: it contains NO email or user-account ID.
    const remote = [{
      id_prestador: remoteId, titular_do_contrato: user.name, cnpj: null,
      tem_contrato_ativo: true, data_inicio_contrato: null, data_fim_contrato: null,
    }];
    const syncMock = vi.spyOn(peopleClient, "fetchPrestadores").mockResolvedValue(remote);
    try {
      expect((await authenticatedWrite("/providers/sync", session(admin), {}, "POST")).status).toBe(200);
      // When local-only people exist, new remote records await explicit review.
      // This fixture deliberately imports a distinct provider before testing
      // the separate, existing administrator-confirmed email association.
      expect((await authenticatedWrite("/providers/reconciliation", session(admin), {
        externalId: String(remoteId), action: "separate", confirmed: true,
        evidence: "Administrador conferiu contrato e confirmou cadastro distinto.",
      }, "POST")).status).toBe(200);
      const [p] = await db.select().from(providersTable).where(eq(providersTable.decargoId, String(remoteId)));
      providerIds.push(p.id);
      expect(p).toMatchObject({ email: null, syncedAt: expect.any(Date) });
      expect(await (await get(`/diarias?providerId=${p.id}`, session(user))).json()).toMatchObject({ total: 0 });

      // The administrator attests the association; never infer it from numbers
      // or identical names. Existing provider/diária identifiers stay intact.
      const confirmation = await authenticatedWrite(`/providers/${p.id}`, session(admin),
        { email: ` ${user.email.toUpperCase()} `, teamId, dailyRate: 321.45 });
      expect(confirmation.status).toBe(200);
      const [diaria] = await db.insert(diariasTable).values({
        providerId: p.id, teamId, createdBy: admin.id, workDate: "2096-06-15",
        value: "321.45", status: "pendente_aprovacao",
      }).returning();
      diariaIds.push(diaria.id);

      // Subsequent additive sync must not remove the confirmed link or rate.
      expect((await authenticatedWrite("/providers/sync", session(admin), {}, "POST")).status).toBe(200);
      for (let i = 0; i < 2; i++) {
        const response = await handoff(user);
        expect(response.status).toBe(200);
        const { access_token, usuario } = await response.json() as HandoffBody;
        expect(usuario).toMatchObject({ id: user.id, role: user.role });
        expect(await (await get(`/diarias/${diaria.id}`, access_token)).json())
          .toMatchObject({ providerId: p.id, value: null });
        expect((await (await get(`/diarias?providerId=${p.id}`, access_token)).json() as DiariaList).data)
          .toMatchObject([{ id: diaria.id }]);
      }
      const [unchanged] = await db.select().from(providersTable).where(eq(providersTable.id, p.id));
      expect(unchanged).toMatchObject({ decargoId: String(remoteId), email: user.email, dailyRate: "321.45" });
      expect(await (await get(`/diarias/${diaria.id}`, session(admin))).json()).toMatchObject({ value: "321.45" });
    } finally {
      syncMock.mockRestore();
    }
  });

  it("allows only administrators to confirm a provider email and refuses duplicate or malformed links", async () => {
    const admin = await person("admin");
    const user = await person();
    const own = await provider(user);
    const other = await person();
    const unlinked = await provider(other, { email: null });
    expect((await authenticatedWrite(`/providers/${unlinked.p.id}`, session(user), { email: user.email })).status).toBe(403);
    expect((await authenticatedWrite(`/providers/${unlinked.p.id}`, session(admin), { email: user.email })).status).toBe(409);
    expect((await authenticatedWrite(`/providers/${unlinked.p.id}`, session(admin), { email: "not-an-email" })).status).toBe(400);
    expect((await get(`/diarias/${own.diaria.id}`, session(user))).status).toBe(200);
    expect((await get(`/diarias/${unlinked.diaria.id}`, session(user))).status).toBe(404);
  });

  it.each(["prestador", "funcionario"])("isolates all dashboard endpoints for %s before and after confirmed-email handoff", async role => {
    const user = await person(role, String(870000000 + counter++));
    const other = await person();
    // Numeric collision must not authorize even aggregate/dashboard data.
    const unrelated = await provider(other, { decargoId: user.decargoId });
    const own = await provider(user, { decargoId: `manual-${randomUUID()}`, email: null });
    const audits = await db.insert(auditLogsTable).values([own, unrelated].map(({ diaria }) => ({
      entityType: "diaria", entityId: diaria.id, action: "create", userId: user.id,
    }))).returning();
    auditIds.push(...audits.map(a => a.id));

    const before = await handoff(user);
    expect(before.status).toBe(200);
    const tokenBefore = (await before.json() as HandoffBody).access_token;
    expect(await (await get("/dashboard/summary", tokenBefore)).json()).toMatchObject({ pendentes: 0 });
    for (const path of ["/dashboard/by-team", "/dashboard/by-provider", "/dashboard/recent-activity"]) {
      const response = await get(path, tokenBefore);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    }

    const admin = await person("admin");
    expect((await authenticatedWrite(`/providers/${own.p.id}`, session(admin), { email: user.email })).status).toBe(200);
    const after = await handoff(user);
    expect(after.status).toBe(200);
    const tokenAfter = (await after.json() as HandoffBody).access_token;
    const summary = await get("/dashboard/summary", tokenAfter);
    expect(summary.status).toBe(200);
    expect(await summary.json()).toMatchObject({
      pendentes: 1, totalValorAprovadas: null, totalValorExportadas: null, totalValorPagas: null,
    });
    expect(await (await get("/dashboard/by-provider", tokenAfter)).json())
      .toEqual([expect.objectContaining({ providerId: own.p.id, total: 1, totalValor: null })]);
    // Both providers share a team: its total must still exclude the other person.
    expect(await (await get("/dashboard/by-team", tokenAfter)).json())
      .toEqual([expect.objectContaining({ teamId, total: 1, totalValor: null })]);
    expect(await (await get("/dashboard/recent-activity", tokenAfter)).json())
      .toEqual([expect.objectContaining({ diariaId: own.diaria.id })]);
    expect((await get("/dashboard/summary", session({ ...user, role: "gestor" }))).status).toBe(200);
    // A gestor's DB role, not JWT role, is enforced on these endpoints.
    await db.update(usersTable).set({ role: "gestor" }).where(eq(usersTable.id, user.id));
    expect((await get("/dashboard/summary", tokenAfter)).status).toBe(403);
  });
});
