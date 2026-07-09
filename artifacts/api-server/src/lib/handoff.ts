import jwt from "jsonwebtoken";

export interface HandoffClaims {
  iss: string;
  aud: string;
  sub: string;         // email lowercase
  email: string;
  name: string;
  id_usuario: number;
  papel: string;       // coarse role from People ("admin", "rh", "gestor", "prestador", …)
  prioridade?: number;
  modulos?: string[];
  jti: string;
  iat: number;
  exp: number;
}

// ---------------------------------------------------------------------------
// JTI one-time-use store — replay protection
// Handoff tokens are valid for 90 s, so we keep consumed JTIs for 120 s then
// evict them.  An in-memory store is sufficient for single-instance deployments;
// for multi-instance you would swap this for a shared cache (Redis etc.).
// ---------------------------------------------------------------------------
const USED_JTIS = new Map<string, number>(); // jti → expiry (Unix ms)
const JTI_RETAIN_MS = 120_000;

function pruneJtis(): void {
  const now = Date.now();
  for (const [jti, expiresAt] of USED_JTIS) {
    if (now > expiresAt) USED_JTIS.delete(jti);
  }
}
// Prune every 60 s to avoid unbounded growth
setInterval(pruneJtis, 60_000).unref();

function consumeJti(jti: string): boolean {
  pruneJtis();
  if (USED_JTIS.has(jti)) return false; // already used
  USED_JTIS.set(jti, Date.now() + JTI_RETAIN_MS);
  return true;
}

// ---------------------------------------------------------------------------

export function resolveHandoffSecret(): string {
  const secret = process.env.DECARGO_ID_HANDOFF_SECRET;
  if (!secret) {
    throw new Error(
      "DECARGO_ID_HANDOFF_SECRET não está configurado. " +
        "Defina este secret no Replit antes de iniciar o servidor.",
    );
  }
  return secret;
}

export function resolveAppCode(): string {
  const code = process.env.DECARGO_ID_APP_CODE;
  if (!code) {
    throw new Error(
      "DECARGO_ID_APP_CODE não está configurado. " +
        "Defina o código do app registrado no DECARGO People (ex: 'diarias').",
    );
  }
  return code;
}

/**
 * Verifies a handoff JWT, enforces one-time use via jti, and returns claims.
 * Throws if the token is invalid, expired, for a different audience, or replayed.
 */
export function verifyHandoffToken(token: string): HandoffClaims {
  const secret = resolveHandoffSecret();
  const appCode = resolveAppCode();

  const claims = jwt.verify(token, secret, {
    issuer: "decargo-id",
    audience: appCode,
  }) as HandoffClaims;

  if (!claims.jti) {
    throw new Error("Token sem jti — não é possível garantir uso único");
  }

  if (!consumeJti(claims.jti)) {
    throw new Error("Token já utilizado (replay detectado)");
  }

  return claims;
}
