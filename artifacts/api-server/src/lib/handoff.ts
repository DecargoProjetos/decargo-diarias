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

/**
 * Resolves the handoff secret — fail-closed in production.
 * Throws clearly if the env var is missing, so the app refuses to start
 * rather than silently accepting unsigned tokens.
 */
export function resolveHandoffSecret(): string {
  const secret = process.env.DECARGO_ID_HANDOFF_SECRET;
  if (!secret) {
    throw new Error(
      "DECARGO_ID_HANDOFF_SECRET não está configurado. " +
      "Defina este secret no Replit antes de iniciar o servidor."
    );
  }
  return secret;
}

/**
 * Returns the audience (app code) this consumer expects.
 * Must match exactly what People sets in signHandoffToken({ app: "..." }).
 * Configure via DECARGO_ID_APP_CODE env var.
 */
export function resolveAppCode(): string {
  const code = process.env.DECARGO_ID_APP_CODE;
  if (!code) {
    throw new Error(
      "DECARGO_ID_APP_CODE não está configurado. " +
      "Defina o código do app registrado no DECARGO People (ex: 'diarias')."
    );
  }
  return code;
}

/**
 * Verifies a handoff JWT and returns its claims.
 * Throws if the token is invalid, expired, or issued for a different audience.
 */
export function verifyHandoffToken(token: string): HandoffClaims {
  const secret = resolveHandoffSecret();
  const appCode = resolveAppCode();

  return jwt.verify(token, secret, {
    issuer: "decargo-id",
    audience: appCode,
  }) as HandoffClaims;
}
