import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import type { Request } from "express";
import { db, peopleSyncSessionsTable } from "@workspace/db";
import type { HandoffClaims } from "./handoff";
import { logger } from "./logger";

const PREFIX = "/api/integration/diarias/user-sync";
const MAX_TTL_SECONDS = 8 * 60 * 60;

export class PeopleUserSyncError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function peopleUserSyncEnabled(): boolean {
  return process.env.PEOPLE_USER_SYNC_ENABLED === "true";
}

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new PeopleUserSyncError(503, "PEOPLE_SYNC_UNAVAILABLE", "Proteção da sessão não configurada.");
  return Buffer.from(hkdfSync("sha256", secret, "decargo-diarias", "people-sync-token-v1", 32));
}

export function encryptPeopleToken(token: string, binding: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(binding));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString("base64url")).join(".");
}

export function decryptPeopleToken(value: string, binding: string): string {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Sessão criptografada inválida");
  const [iv, tag, ciphertext] = parts.map(part => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAAD(Buffer.from(binding));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export interface PeopleSyncAccess { token: string }

async function request<T>(path: string, token?: string, code?: string): Promise<T> {
  const base = process.env.PEOPLE_API_URL;
  const apiKey = process.env.PEOPLE_USER_SYNC_API_KEY;
  if (!base || !apiKey) throw new PeopleUserSyncError(503, "PEOPLE_SYNC_UNAVAILABLE",
    "Sincronização por usuário não configurada. Contate o administrador.");
  if (new URL(base).protocol !== "https:") throw new PeopleUserSyncError(503, "PEOPLE_SYNC_UNAVAILABLE",
    "A integração com o People exige HTTPS.");
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}${PREFIX}${path}`, {
      method: code || path === "/revoke" ? "POST" : "GET",
      headers: {
        "X-Diarias-Sync-Key": apiKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(code ? { "Content-Type": "application/json" } : {}),
      },
      ...(code ? { body: JSON.stringify({ code }) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PeopleUserSyncError(503, "PEOPLE_SYNC_UNAVAILABLE", "DECARGO People indisponível. Tente novamente mais tarde.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { code?: string } | null;
    const upstreamCode = body && typeof body === "object" ? body.code : undefined;
    if (upstreamCode === "PEOPLE_SYNC_CLIENT_UNAUTHORIZED" || response.status >= 500 || response.status === 404) {
      throw new PeopleUserSyncError(503, "PEOPLE_SYNC_UNAVAILABLE",
        "A integração por usuário não está disponível no DECARGO People. Contate o administrador.");
    }
    if (response.status === 401) throw new PeopleUserSyncError(409, "PEOPLE_SYNC_REAUTH_REQUIRED",
      "Acesso ao People expirado ou revogado. Saia do Diárias e entre novamente pelo DECARGO ID.");
    if (response.status === 403) throw new PeopleUserSyncError(403,
      upstreamCode === "PEOPLE_SYNC_ACCOUNT_ACTION_REQUIRED" ? upstreamCode : "PEOPLE_SYNC_PERMISSION_DENIED",
      upstreamCode === "PEOPLE_SYNC_ACCOUNT_ACTION_REQUIRED"
        ? "Conclua a troca de senha ou o aceite de privacidade no DECARGO People."
        : "Sua conta no DECARGO People não tem permissão para consultar estes cadastros.");
    throw new PeopleUserSyncError(502, "PEOPLE_SYNC_INVALID_RESPONSE", "DECARGO People recusou a solicitação de sincronização.");
  }
  if (response.status === 204) return undefined as T;
  try { return await response.json() as T; }
  catch { throw new PeopleUserSyncError(502, "PEOPLE_SYNC_INVALID_RESPONSE", "Resposta inválida do DECARGO People."); }
}

export async function createPeopleSyncSession(userId: number, claims: HandoffClaims): Promise<string> {
  if (!claims.people_sync_code || !/^dsc_[A-Za-z0-9_-]{43}$/.test(claims.people_sync_code)) {
    throw new PeopleUserSyncError(409, "PEOPLE_SYNC_REAUTH_REQUIRED",
      "O login não incluiu acesso à sincronização. Entre novamente pelo DECARGO ID após configurar a integração.");
  }
  const result = await request<{ access_token: string; expires_in: number; id_usuario: number; email: string }>(
    "/exchange", undefined, claims.people_sync_code);
  if (!result || typeof result !== "object" || !/^dst_[A-Za-z0-9_-]{43}$/.test(result.access_token) ||
      !Number.isInteger(result.expires_in) || result.expires_in < 1 || result.expires_in > MAX_TTL_SECONDS ||
      result.id_usuario !== claims.id_usuario || typeof result.email !== "string" ||
      result.email.trim().toLowerCase() !== claims.email.trim().toLowerCase()) {
    throw new PeopleUserSyncError(502, "PEOPLE_SYNC_INVALID_RESPONSE", "Identidade ou acesso inválido na resposta do DECARGO People.");
  }
  const id = randomUUID();
  await db.delete(peopleSyncSessionsTable).where(lte(peopleSyncSessionsTable.expiresAt, new Date()));
  await db.insert(peopleSyncSessionsTable).values({
    id, userId, encryptedToken: encryptPeopleToken(result.access_token, `${userId}:${id}`),
    expiresAt: new Date(Date.now() + result.expires_in * 1000),
  });
  return id;
}

export async function getPeopleSyncAccess(req: Request): Promise<PeopleSyncAccess> {
  const userId = req.currentUser?.id;
  const sessionId = req.peopleSyncSessionId;
  if (!userId || !sessionId) throw new PeopleUserSyncError(409, "PEOPLE_SYNC_REAUTH_REQUIRED",
    "Esta sessão não possui acesso ao People. Saia do Diárias e entre novamente pelo DECARGO ID.");
  const [session] = await db.select().from(peopleSyncSessionsTable).where(and(
    eq(peopleSyncSessionsTable.id, sessionId), eq(peopleSyncSessionsTable.userId, userId),
    gt(peopleSyncSessionsTable.expiresAt, new Date()),
  )).limit(1);
  if (!session) throw new PeopleUserSyncError(409, "PEOPLE_SYNC_REAUTH_REQUIRED",
    "Acesso ao People expirado. Saia do Diárias e entre novamente pelo DECARGO ID.");
  try { return { token: decryptPeopleToken(session.encryptedToken, `${userId}:${sessionId}`) }; }
  catch { throw new PeopleUserSyncError(409, "PEOPLE_SYNC_REAUTH_REQUIRED", "Sessão do People inválida. Entre novamente pelo DECARGO ID."); }
}

export function requestPeopleSync<T>(path: string, access: PeopleSyncAccess): Promise<T> {
  return request<T>(path, access.token);
}

export async function revokePeopleSyncSession(userId: number, sessionId: string): Promise<void> {
  const [session] = await db.delete(peopleSyncSessionsTable).where(and(
    eq(peopleSyncSessionsTable.id, sessionId), eq(peopleSyncSessionsTable.userId, userId),
  )).returning();
  if (!session) return;
  try {
    const token = decryptPeopleToken(session.encryptedToken, `${userId}:${sessionId}`);
    await request<void>("/revoke", token);
  } catch {
    // A sessão local é sempre removida; eventual falha externa não impede logout.
    logger.warn({ userId }, "Acesso local ao People removido; revogação remota indisponível");
  }
}