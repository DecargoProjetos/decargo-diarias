import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import app from "../../app";
import { db, usersTable, providersTable, peopleSyncSessionsTable, type User } from "@workspace/db";
import { decryptPeopleToken, encryptPeopleToken } from "../../lib/peopleUserSync";
import { signLocalJwt, verifyLocalJwt } from "../../lib/localJwt";

const realFetch = globalThis.fetch;
const upstream = vi.fn<typeof fetch>();
const tokenA = `dst_${"a".repeat(43)}`;
const tokenB = `dst_${"b".repeat(43)}`;
let server: Server;
let base: string;
let admin: User;
let otherAdmin: User;
let manager: User;
const userIds: number[] = [];
const providerIds: number[] = [];
const employeeId = Math.floor(Date.now() / 10);
const providerId = employeeId + 100;

async function call(path: string, token: string, method = "POST") {
  return realFetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
}

function localToken(user: User, sessionId?: string) {
  return signLocalJwt({
    userId: user.id, decargoId: user.decargoId, email: user.email, name: user.name,
    role: user.role, teamId: user.teamId, ...(sessionId ? { peopleSyncSessionId: sessionId } : {}),
  });
}

async function login(user: User, delegated = tokenA, includeCode = true) {
  upstream.mockResolvedValueOnce(Response.json({
    access_token: delegated, expires_in: 28_800, id_usuario: Number(user.decargoId), email: user.email,
  }));
  const handoff = jwt.sign({
    sub: user.email, email: user.email, name: user.name, id_usuario: Number(user.decargoId),
    jti: randomUUID(), ...(includeCode ? { people_sync_code: `dsc_${"c".repeat(43)}` } : {}),
  }, process.env.DECARGO_ID_HANDOFF_SECRET!, {
    issuer: "decargo-id", audience: process.env.DECARGO_ID_APP_CODE!, expiresIn: 90,
  });
  const response = await realFetch(`${base}/api/auth/handoff`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: handoff }),
  });
  expect(response.status).toBe(200);
  const result = await response.json() as { access_token: string };
  return result.access_token as string;
}

describe("People access is delegated to an individual Diárias session", () => {
  beforeAll(async () => {
    const suffix = randomUUID();
    [admin, otherAdmin, manager] = await db.insert(usersTable).values(
      ["admin", "admin", "gestor"].map((role, index) => ({
        decargoId: String(employeeId + 200 + index), name: "__TEST_PEOPLE_SYNC__",
        email: `__test_people_sync_${suffix}_${index}@test.invalid`, role, active: true,
      })),
    ).returning();
    userIds.push(admin.id, otherAdmin.id, manager.id);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    vi.stubEnv("PEOPLE_USER_SYNC_ENABLED", "true");
    vi.stubEnv("PEOPLE_USER_SYNC_API_KEY", "test-only-sync-key");
    vi.stubEnv("PEOPLE_API_URL", "https://people.example.invalid");
    vi.stubGlobal("fetch", upstream);
    upstream.mockReset();
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  afterAll(async () => {
    if (providerIds.length) await db.delete(providersTable).where(inArray(providersTable.id, providerIds));
    if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it("preserves the legacy login when the rollout is off", async () => {
    vi.stubEnv("PEOPLE_USER_SYNC_ENABLED", "false");
    const access = await login(admin, tokenA, false);
    expect(verifyLocalJwt(access).peopleSyncSessionId).toBeUndefined();
    expect(upstream).not.toHaveBeenCalled();
  });

  it("keeps the People token encrypted in the backend, not in the browser JWT", async () => {
    const access = await login(admin);
    const payload = verifyLocalJwt(access);
    expect(payload.peopleSyncSessionId).toBeTruthy();
    expect(JSON.stringify(payload)).not.toContain(tokenA);
    const [session] = await db.select().from(peopleSyncSessionsTable)
      .where(eq(peopleSyncSessionsTable.id, payload.peopleSyncSessionId!));
    expect(session.userId).toBe(admin.id);
    expect(session.encryptedToken).not.toContain(tokenA);
    expect(decryptPeopleToken(session.encryptedToken, `${admin.id}:${session.id}`)).toBe(tokenA);
    expect(upstream.mock.calls[0][0]).toBe("https://people.example.invalid/api/integration/diarias/user-sync/exchange");
    expect(upstream.mock.calls[0][1]?.headers).toMatchObject({ "X-Diarias-Sync-Key": "test-only-sync-key" });
    expect(upstream.mock.calls[0][1]?.redirect).toBe("error");
  });

  it("cannot substitute the encrypted token into a different user or session", () => {
    const encrypted = encryptPeopleToken(tokenA, "user:session-a");
    expect(() => decryptPeopleToken(encrypted, "other:session-a")).toThrow();
    expect(() => decryptPeopleToken(encrypted, "user:session-b")).toThrow();
  });

  it("maintains independent simultaneous sessions without a global user-token cache", async () => {
    const accessA = await login(admin, tokenA);
    const accessB = await login(otherAdmin, tokenB);
    expect(verifyLocalJwt(accessA).peopleSyncSessionId).not.toBe(verifyLocalJwt(accessB).peopleSyncSessionId);
    upstream.mockImplementation(async (_url, options) => {
      const bearer = (options?.headers as Record<string, string>)?.Authorization;
      if (bearer === `Bearer ${tokenA}`) return Response.json([]);
      if (bearer === `Bearer ${tokenB}`) return Response.json([]);
      throw new Error("Unexpected caller");
    });
    const results = await Promise.all([
      call("/api/providers/sync", accessA), call("/api/providers/sync", accessB),
    ]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    const bearers = upstream.mock.calls.slice(2).map(([, options]) => (options?.headers as Record<string, string>).Authorization);
    expect(bearers.sort()).toEqual([`Bearer ${tokenA}`, `Bearer ${tokenB}`]);
  });

  it("rejects local admin access without a delegated session, never falling back to service login", async () => {
    const response = await call("/api/users/sync", localToken(admin));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PEOPLE_SYNC_REAUTH_REQUIRED" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("checks session ownership even for another local administrator", async () => {
    const access = await login(admin);
    upstream.mockClear();
    const response = await call("/api/providers/sync",
      localToken(otherAdmin, verifyLocalJwt(access).peopleSyncSessionId));
    expect(response.status).toBe(409);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("keeps syncing admin-only and does not exchange a token for a manager", async () => {
    const access = await login(manager);
    expect(verifyLocalJwt(access).peopleSyncSessionId).toBeUndefined();
    expect(upstream).not.toHaveBeenCalled();
    expect((await call("/api/users/sync", access)).status).toBe(403);
    expect((await call("/api/providers/sync", access)).status).toBe(403);
  });

  it("imports employees and providers through their scoped endpoints", async () => {
    const access = await login(admin);
    upstream.mockImplementation(async url => {
      if (String(url).includes("/funcionarios")) return Response.json({
        data: [{ id_funcionario: employeeId, nome: "__TEST_IMPORTED_USER__",
          email_principal: `__test_imported_${employeeId}@test.invalid`, demitido: false }], total: 1,
      });
      return Response.json([{ id_prestador: providerId, titular_do_contrato: "__TEST_IMPORTED_PROVIDER__",
        cnpj: null, tem_contrato_ativo: true, data_inicio_contrato: null, data_fim_contrato: null }]);
    });
    const responses = await Promise.all([
      call("/api/users/sync", access), call("/api/providers/sync", access),
    ]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    for (const response of responses) expect(await response.json()).toMatchObject({ synced: 1, created: 1 });
    const [user] = await db.select().from(usersTable).where(eq(usersTable.decargoId, String(employeeId)));
    const [provider] = await db.select().from(providersTable).where(eq(providersTable.decargoId, String(providerId)));
    userIds.push(user.id); providerIds.push(provider.id);
    expect(user.role).toBe("prestador");
    expect(provider.active).toBe(true);
    expect(upstream.mock.calls.slice(1).every(([url]) => String(url).includes("/user-sync/"))).toBe(true);
  });

  it("surfaces the user's People permission denial without service-account retry", async () => {
    const access = await login(admin);
    upstream.mockClear();
    upstream.mockResolvedValue(Response.json({ code: "PEOPLE_SYNC_PERMISSION_DENIED" }, { status: 403 }));
    const response = await call("/api/providers/sync", access);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PEOPLE_SYNC_PERMISSION_DENIED",
      error: expect.stringContaining("Sua conta no DECARGO People") });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("gives a relogin instruction when the People token expires or is revoked", async () => {
    const access = await login(admin);
    upstream.mockClear();
    upstream.mockResolvedValue(Response.json({ code: "PEOPLE_SYNC_REAUTH_REQUIRED" }, { status: 401 }));
    const response = await call("/api/users/sync", access);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("entre novamente") });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("rejects locally expired sessions without calling the People API", async () => {
    const access = await login(admin);
    await db.update(peopleSyncSessionsTable).set({ expiresAt: new Date(0) })
      .where(eq(peopleSyncSessionsTable.id, verifyLocalJwt(access).peopleSyncSessionId!));
    upstream.mockClear();
    expect((await call("/api/providers/sync", access)).status).toBe(409);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("logout revokes only its own session and blocks further syncing with the old JWT", async () => {
    const access = await login(admin, tokenA);
    const otherAccess = await login(admin, tokenB);
    upstream.mockClear();
    upstream.mockResolvedValue(new Response(null, { status: 204 }));
    expect((await call("/api/auth/logout", access)).status).toBe(200);
    const [remaining] = await db.select().from(peopleSyncSessionsTable)
      .where(eq(peopleSyncSessionsTable.id, verifyLocalJwt(otherAccess).peopleSyncSessionId!));
    expect(remaining).toBeTruthy();
    expect((await call("/api/users/sync", access)).status).toBe(409);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toBe("https://people.example.invalid/api/integration/diarias/user-sync/revoke");
    expect(upstream.mock.calls[0][1]?.headers).toMatchObject({ Authorization: `Bearer ${tokenA}` });
  });

  it("removes the local delegation even when remote revocation is unavailable", async () => {
    const access = await login(admin);
    upstream.mockRejectedValue(new Error("Upstream unavailable"));
    expect((await call("/api/auth/logout", access)).status).toBe(200);
    expect((await call("/api/providers/sync", access)).status).toBe(409);
  });

  it("refuses to send a delegation token over HTTP", async () => {
    const access = await login(admin);
    vi.stubEnv("PEOPLE_API_URL", "http://people.example.invalid");
    upstream.mockClear();
    expect((await call("/api/providers/sync", access)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });
});