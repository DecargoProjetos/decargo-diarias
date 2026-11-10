/**
 * Client for the DECARGO People REST API.
 *
 * Auth model: per-user delegated access when PEOPLE_USER_SYNC_ENABLED=true.
 * Legacy service-account JWT is retained only while that rollout flag is off.
 * Financial export below keeps its separate integration-key authentication.
 *
 * Note on IDs: The funcionarios endpoint exposes `id_funcionario` (the HR
 * record ID).  The DECARGO ID handoff JWT carries `id_usuario` (the auth
 * account ID).  These may differ.  We store `id_funcionario` as `decargoId`
 * when syncing; handoff selects the local user by attested email while keeping
 * the local/HR identifier stable.
 */

import { peopleUserSyncEnabled, requestPeopleSync, PeopleUserSyncError, type PeopleSyncAccess } from "./peopleUserSync";

const baseUrl = (): string => {
  const url = process.env.PEOPLE_API_URL;
  if (!url) throw new Error("PEOPLE_API_URL not set");
  return url.replace(/\/$/, "");
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Funcionario {
  id_funcionario: number;
  nome: string;
  email_principal: string | null;
  // NOTE: the People API has no `ativo` field on funcionários — the real
  // employment-status signal is `demitido` (true once terminated). A
  // funcionário is considered active when `demitido` is false.
  demitido: boolean;
}

interface FuncionarioPage {
  total: number;
  data: Funcionario[];
}

export interface Prestador {
  id_prestador: number;
  titular_do_contrato: string;
  cnpj: string | null;
  tem_contrato_ativo: boolean;
  data_inicio_contrato: string | null;
  data_fim_contrato: string | null;
}

// ---------------------------------------------------------------------------
// Internal auth
// ---------------------------------------------------------------------------

let _token: string | null = null;

// Sync endpoints for users and providers run concurrently (Promise.allSettled
// on the frontend), so multiple `request()` calls can race to (re)login at
// the same time. Without de-duping, one call's login can overwrite `_token`
// out from under another call that already read it, or two logins can fire
// in parallel — both symptoms present as spurious/inconsistent 401s from the
// People API. `_loginPromise` ensures only one login is ever in flight, and
// every request captures the token it actually obtained in a local variable
// instead of re-reading the (possibly since-clobbered) module-level `_token`.
let _loginPromise: Promise<string> | null = null;

async function login(): Promise<string> {
  if (_loginPromise) return _loginPromise;

  _loginPromise = (async () => {
    const username = process.env.PEOPLE_SERVICE_LOGIN;
    const password = process.env.PEOPLE_SERVICE_PASSWORD;
    if (!username || !password) {
      throw new Error(
        "PEOPLE_SERVICE_LOGIN and PEOPLE_SERVICE_PASSWORD must be set for People API sync"
      );
    }

    const res = await fetch(`${baseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The People API's login schema requires `username` / `password` field
      // names specifically — `login` / `senha` fail its zod validation with a
      // 400 "Required" error even though the values are non-empty.
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      throw new Error(`People API login failed: ${res.status} — ${text}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    // Be defensive about the actual field name/shape — a wrong assumption
    // here (e.g. `access_token` instead of `token`, or a nested `data.token`)
    // would silently produce `Authorization: Bearer undefined`, which the
    // People API rejects with the exact same "Token inválido ou expirado"
    // seen from the data endpoints, making it indistinguishable from a real
    // credentials/permission problem. Fail loudly instead, with the actual
    // response keys, so a shape mismatch is diagnosable from logs alone.
    const token = data["token"] ?? data["access_token"] ?? (data["data"] as Record<string, unknown> | undefined)?.["token"];
    if (typeof token !== "string" || token.length === 0) {
      throw new Error(
        `People API login response did not contain a usable token. Response keys: ${JSON.stringify(Object.keys(data))}`
      );
    }
    _token = token;
    return token;
  })();

  try {
    return await _loginPromise;
  } finally {
    _loginPromise = null;
  }
}

async function request<T>(path: string, retried = false): Promise<T> {
  const token = _token ?? (await login());

  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 && !retried) {
    // Only clear the shared token if it's still the one that just failed —
    // a concurrent call may have already replaced it with a fresh one.
    if (_token === token) _token = null;
    return request<T>(path, true);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`People API ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Returns all active funcionários, paging automatically. */
export async function fetchFuncionarios(access?: PeopleSyncAccess): Promise<Funcionario[]> {
  if (peopleUserSyncEnabled() && !access) {
    throw new PeopleUserSyncError(409, "PEOPLE_SYNC_REAUTH_REQUIRED", "Entre novamente pelo DECARGO ID para sincronizar.");
  }
  const PAGE_SIZE = 100;
  let page = 1;
  const all: Funcionario[] = [];

  while (true) {
    const result = access
      ? await requestPeopleSync<FuncionarioPage>(`/funcionarios?limit=${PAGE_SIZE}&page=${page}`, access)
      : await request<FuncionarioPage>(`/api/funcionarios?todos=false&limit=${PAGE_SIZE}&page=${page}`);
    all.push(...result.data);
    if (all.length >= result.total || result.data.length === 0) break;
    page++;
  }

  return all;
}

/** Returns all active prestadores (endpoint returns full list, no paging). */
export async function fetchPrestadores(access?: PeopleSyncAccess): Promise<Prestador[]> {
  if (peopleUserSyncEnabled() && !access) {
    throw new PeopleUserSyncError(409, "PEOPLE_SYNC_REAUTH_REQUIRED", "Entre novamente pelo DECARGO ID para sincronizar.");
  }
  if (access) return requestPeopleSync<Prestador[]>("/prestadores", access);
  return request<Prestador[]>("/api/prestadores?ativo=true");
}

/** Clears the cached token (useful in tests or after a credential rotation). */
export function clearToken(): void {
  _token = null;
}

// ---------------------------------------------------------------------------
// Diárias export (outbound push) — Análise de Diárias > DECARGO People
// ---------------------------------------------------------------------------
//
// Unlike the sync helpers above, this does NOT use the service-account JWT
// login flow. It authenticates with a static shared secret
// (PEOPLE_INTEGRATION_KEY) sent as the `x-api-key` header, per the
// integration contract documented in the People project's
// docs/integration/diarias-push.md.

export interface DiariaExportItem {
  id_prestador: number;
  dia_trabalhado: string;
  valor_diaria: number;
  data_pagamento: string;
  anotacoes_gerais?: string;
  /**
   * Not sent to the People API — stripped before the request body is built.
   * Carried through so the caller can map People's per-item errors (which
   * only reference id_prestador/dia_trabalhado) back to our local diária id.
   */
  __localId: number;
}

/** Payload for Faltas export → DECARGO People > Folha Mensal > Descontos */
export interface FaltaExportItem {
  cnpj: string;
  tipo: string; // sempre "Desconto de Diária"
  valor: number;
  data_desconto: string; // calculado pela regra de competência
  anotacoes_gerais?: string;
  /** Tracking only — stripped before sending to People API. */
  __localId: number;
}

export interface DiariaExportError {
  [key: string]: unknown;
  __localId?: number;
}

export interface DiariaExportResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: DiariaExportError[];
  /**
   * Number of external errors that could not be mapped back to a local record.
   * Callers must treat any positive value as an uncertain batch result.
   */
  unidentifiedErrors?: number;
}

export interface ExportProgress {
  beforeBatch(ids: number[]): Promise<void>;
  afterBatch(confirmed: number[], rejected: number[]): Promise<void>;
}
export class PeopleBatchExportError extends Error {
  constructor(
    message: string,
    public readonly completedLocalIds: number[],
    public readonly rejectedLocalIds: number[],
    public readonly uncertainLocalIds: number[],
    public readonly pendingLocalIds: number[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PeopleBatchExportError";
  }
}

const INTEGRATION_BATCH_SIZE = 500;
const INTEGRATION_POST_TIMEOUT_MS = 30_000;

/**
 * One deadline for both the POST and its body. Aborting a financial request
 * does not prove People rolled it back: callers must keep this batch uncertain.
 * The race also bounds transports/body readers that fail to honor abort.
 */
async function postIntegrationBatch(path: string, apiKey: string, body: unknown): Promise<DiariaExportResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("Tempo limite de 30 segundos excedido; recebimento pelo People não confirmado"));
      controller.abort();
    }, INTEGRATION_POST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        const res = await fetch(`${baseUrl()}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`People API ${path} → ${res.status}: ${text}`);
        }
        return await res.json() as DiariaExportResult;
      })(),
      expired,
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function integrationApiKey(): string {
  const key = process.env.DECARGO_PEOPLE_API_KEY;
  if (!key) throw new Error("DECARGO_PEOPLE_API_KEY not set");
  return key;
}

/**
 * Read-only, authenticated preflight. Never fall back to a personal-data
 * endpoint or a financial POST. A successful probe is not an export receipt.
 */
export type PeopleFinancialTarget = "diarias" | "descontos";
export async function checkPeopleExportAvailability(
  requiredTargets: readonly PeopleFinancialTarget[] = ["diarias"],
): Promise<void> {
  const supportedTargets = await getPeopleExportCapabilities();
  if (requiredTargets.some(target => !supportedTargets.includes(target))) {
    throw new Error("People integration availability: required financial destination unavailable");
  }
}

/** Returns only known financial destinations from the validated v2 contract. */
export async function getPeopleExportCapabilities(): Promise<PeopleFinancialTarget[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${baseUrl()}/api/integration/availability`, {
      method: "GET",
      headers: { "x-api-key": integrationApiKey(), Accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    if (res.status !== 200) {
      throw new Error(`People integration availability: HTTP ${res.status}`);
    }
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" ||
        (data as Record<string, unknown>).service !== "people-financial-integration" ||
        (data as Record<string, unknown>).version !== 2 ||
        (data as Record<string, unknown>).ready !== true) {
      throw new Error("People integration availability: invalid response");
    }
    const supportedTargets = (data as Record<string, unknown>).supportedTargets;
    if (!Array.isArray(supportedTargets) ||
        !supportedTargets.every(target => typeof target === "string")) {
      throw new Error("People integration availability: invalid capabilities");
    }
    return (["diarias", "descontos"] as const).filter(target => supportedTargets.includes(target));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pushes a batch of faltas to DECARGO People > Folha Mensal > Descontos
 * via POST /api/integration/descontos, chunking at 500 items per request.
 *
 * Confirmed integration contract:
 * - request: { descontos: [{ cnpj, tipo, valor, data_desconto, anotacoes_gerais? }] }
 * - response: { total, inserted, updated, skipped, errors }
 */
export async function pushFaltasToPeople(items: FaltaExportItem[], progress?: ExportProgress): Promise<DiariaExportResult> {
  const apiKey = integrationApiKey();
  const merged: DiariaExportResult = {
    total: 0, inserted: 0, updated: 0, skipped: 0, errors: [], unidentifiedErrors: 0,
  };
  const completedLocalIds: number[] = [];
  const rejectedLocalIds: number[] = [];

  for (let i = 0; i < items.length; i += INTEGRATION_BATCH_SIZE) {
    const chunk = items.slice(i, i + INTEGRATION_BATCH_SIZE);
    const payload = chunk.map(({ __localId: _localId, ...rest }) => rest);
    try {
      await progress?.beforeBatch(chunk.map(item => item.__localId));
    } catch (cause) {
      throw new PeopleBatchExportError(
        "Não foi possível registrar o início do lote; nenhum registro deste lote foi enviado",
        completedLocalIds, rejectedLocalIds, [],
        items.slice(i).map(item => item.__localId), { cause },
      );
    }

    let data: DiariaExportResult;
    try {
      data = await postIntegrationBatch("/api/integration/descontos", apiKey, { descontos: payload });
    } catch (cause) {
      throw new PeopleBatchExportError(
        `Falha ao confirmar lote de descontos: ${cause instanceof Error ? cause.message : String(cause)}`,
        completedLocalIds,
        rejectedLocalIds,
        chunk.map((item) => item.__localId),
        items.slice(i + chunk.length).map((item) => item.__localId),
        { cause },
      );
    }

    merged.total += data.total ?? chunk.length;
    merged.inserted += data.inserted ?? 0;
    merged.updated += data.updated ?? 0;
    merged.skipped += data.skipped ?? 0;

    const chunkRejectedIds: number[] = [];
    let chunkHasUnidentifiedError = false;
    for (const err of data.errors ?? []) {
      const matches = chunk.filter(
        (c) => String((err as Record<string, unknown>).cnpj) === String(c.cnpj),
      );
      if (matches.length !== 1) {
        merged.unidentifiedErrors!++;
        chunkHasUnidentifiedError = true;
      } else {
        chunkRejectedIds.push(matches[0].__localId);
      }
      merged.errors.push({ ...err, __localId: matches.length === 1 ? matches[0].__localId : undefined });
    }

    if (chunkHasUnidentifiedError) {
      throw new PeopleBatchExportError(
        "People API devolveu rejeição de desconto sem identificação local inequívoca",
        completedLocalIds,
        rejectedLocalIds,
        chunk.map((item) => item.__localId),
        items.slice(i + chunk.length).map((item) => item.__localId),
      );
    }
    rejectedLocalIds.push(...chunkRejectedIds);
    const rejectedSet = new Set(chunkRejectedIds);
    completedLocalIds.push(...chunk.filter((item) => !rejectedSet.has(item.__localId)).map((item) => item.__localId));
    try {
      await progress?.afterBatch(
        chunk.filter(item => !rejectedSet.has(item.__localId)).map(item => item.__localId),
        chunkRejectedIds,
      );
    } catch (cause) {
      throw new PeopleBatchExportError(
        "People confirmou o lote, mas houve falha ao registrar seu progresso",
        completedLocalIds, rejectedLocalIds, [],
        items.slice(i + chunk.length).map(item => item.__localId), { cause },
      );
    }
  }

  return merged;
}

/**
 * Pushes a batch of diárias to DECARGO People > Folha Mensal > Diárias
 * Extras via POST /api/integration/diarias, chunking at 500 items per
 * request (the documented limit) and merging results/errors across chunks.
 * Each error item is tagged back with `__localId` only when its external key
 * identifies exactly one local diária. Failures carry prior batch progress.
 */
export async function pushDiariasToPeople(items: DiariaExportItem[], progress?: ExportProgress): Promise<DiariaExportResult> {
  const apiKey = integrationApiKey();
  const merged: DiariaExportResult = {
    total: 0, inserted: 0, updated: 0, skipped: 0, errors: [], unidentifiedErrors: 0,
  };
  const completedLocalIds: number[] = [];
  const rejectedLocalIds: number[] = [];

  for (let i = 0; i < items.length; i += INTEGRATION_BATCH_SIZE) {
    const chunk = items.slice(i, i + INTEGRATION_BATCH_SIZE);
    const payload = chunk.map(({ __localId: _localId, ...rest }) => rest);
    try {
      await progress?.beforeBatch(chunk.map(item => item.__localId));
    } catch (cause) {
      throw new PeopleBatchExportError(
        "Não foi possível registrar o início do lote; nenhum registro deste lote foi enviado",
        completedLocalIds, rejectedLocalIds, [],
        items.slice(i).map(item => item.__localId), { cause },
      );
    }

    let data: DiariaExportResult;
    try {
      data = await postIntegrationBatch("/api/integration/diarias", apiKey, { diarias: payload });
    } catch (cause) {
      throw new PeopleBatchExportError(
        `Falha ao confirmar lote de diárias extras: ${cause instanceof Error ? cause.message : String(cause)}`,
        completedLocalIds,
        rejectedLocalIds,
        chunk.map((item) => item.__localId),
        items.slice(i + chunk.length).map((item) => item.__localId),
        { cause },
      );
    }
    merged.total += data.total ?? chunk.length;
    merged.inserted += data.inserted ?? 0;
    merged.updated += data.updated ?? 0;
    merged.skipped += data.skipped ?? 0;

    const chunkRejectedIds: number[] = [];
    let chunkHasUnidentifiedError = false;
    // The People API's error entries don't carry our local id. Only tag an
    // error when its external key identifies exactly one submitted item.
    for (const err of data.errors ?? []) {
      const matches = chunk.filter(
        (c) =>
          String((err as Record<string, unknown>).id_prestador) === String(c.id_prestador) &&
          String((err as Record<string, unknown>).dia_trabalhado) === String(c.dia_trabalhado),
      );
      if (matches.length !== 1) {
        merged.unidentifiedErrors!++;
        chunkHasUnidentifiedError = true;
      } else {
        chunkRejectedIds.push(matches[0].__localId);
      }
      merged.errors.push({ ...err, __localId: matches.length === 1 ? matches[0].__localId : undefined });
    }
    if (chunkHasUnidentifiedError) {
      throw new PeopleBatchExportError(
        "People API devolveu rejeição de diária sem identificação local inequívoca",
        completedLocalIds,
        rejectedLocalIds,
        chunk.map((item) => item.__localId),
        items.slice(i + chunk.length).map((item) => item.__localId),
      );
    }
    rejectedLocalIds.push(...chunkRejectedIds);
    const rejectedSet = new Set(chunkRejectedIds);
    completedLocalIds.push(...chunk.filter((item) => !rejectedSet.has(item.__localId)).map((item) => item.__localId));
    try {
      await progress?.afterBatch(
        chunk.filter(item => !rejectedSet.has(item.__localId)).map(item => item.__localId),
        chunkRejectedIds,
      );
    } catch (cause) {
      throw new PeopleBatchExportError(
        "People confirmou o lote, mas houve falha ao registrar seu progresso",
        completedLocalIds, rejectedLocalIds, [],
        items.slice(i + chunk.length).map(item => item.__localId), { cause },
      );
    }
  }

  return merged;
}
