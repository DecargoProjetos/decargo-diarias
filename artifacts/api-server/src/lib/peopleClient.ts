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

interface LoginResponse {
  token: string;
}

export interface Funcionario {
  id_funcionario: number;
  nome: string;
  email_principal: string | null;
  ativo: boolean;
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

    const data = (await res.json()) as LoginResponse;
    _token = data.token;
    return data.token;
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
