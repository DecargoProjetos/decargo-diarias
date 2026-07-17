/**
 * Client for the DECARGO People REST API.
 *
 * Auth model: JWT via POST /api/auth/login (service-account credentials stored
 * in PEOPLE_SERVICE_LOGIN / PEOPLE_SERVICE_PASSWORD).  The token is cached in
 * process memory and refreshed automatically on 401.
 *
 * Note on IDs: The funcionarios endpoint exposes `id_funcionario` (the HR
 * record ID).  The DECARGO ID handoff JWT carries `id_usuario` (the auth
 * account ID).  These may differ.  We store `id_funcionario` as `decargoId`
 * when syncing; the first login via handoff resolves any mismatch through the
 * email-fallback / rebind flow in auth.ts.
 */

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
export async function fetchFuncionarios(): Promise<Funcionario[]> {
  const PAGE_SIZE = 100;
  let page = 1;
  const all: Funcionario[] = [];

  while (true) {
    const result = await request<FuncionarioPage>(
      `/api/funcionarios?todos=false&limit=${PAGE_SIZE}&page=${page}`
    );
    all.push(...result.data);
    if (all.length >= result.total || result.data.length === 0) break;
    page++;
  }

  return all;
}

/** Returns all active prestadores (endpoint returns full list, no paging). */
export async function fetchPrestadores(): Promise<Prestador[]> {
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
}

const INTEGRATION_BATCH_SIZE = 500;

function integrationApiKey(): string {
  const key = process.env.DECARGO_PEOPLE_API_KEY;
  if (!key) throw new Error("DECARGO_PEOPLE_API_KEY not set");
  return key;
}

/**
 * Pushes a batch of diárias to DECARGO People > Folha Mensal > Diárias
 * Extras via POST /api/integration/diarias, chunking at 500 items per
 * request (the documented limit) and merging results/errors across chunks.
 * Each error item is tagged back with `__localId` when it can be matched by
 * position, so callers can tell which local diária a given error belongs to.
 */
export async function pushDiariasToPeople(items: DiariaExportItem[]): Promise<DiariaExportResult> {
  const apiKey = integrationApiKey();
  const merged: DiariaExportResult = { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < items.length; i += INTEGRATION_BATCH_SIZE) {
    const chunk = items.slice(i, i + INTEGRATION_BATCH_SIZE);
    const payload = chunk.map(({ __localId: _localId, ...rest }) => rest);

    const res = await fetch(`${baseUrl()}/api/integration/diarias`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ diarias: payload }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      throw new Error(`People API /api/integration/diarias → ${res.status}: ${text}`);
    }

    const data = (await res.json()) as DiariaExportResult;
    merged.total += data.total ?? chunk.length;
    merged.inserted += data.inserted ?? 0;
    merged.updated += data.updated ?? 0;
    merged.skipped += data.skipped ?? 0;

    // The People API's error entries don't carry our local id — tag each by
    // matching id_prestador + dia_trabalhado back to the chunk we just sent,
    // since that pair is unique within a single export request.
    for (const err of data.errors ?? []) {
      const match = chunk.find(
        (c) =>
          String((err as Record<string, unknown>).id_prestador) === String(c.id_prestador) &&
          String((err as Record<string, unknown>).dia_trabalhado) === String(c.dia_trabalhado),
      );
      merged.errors.push({ ...err, __localId: match?.__localId });
    }
  }

  return merged;
}
