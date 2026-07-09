import jwt from "jsonwebtoken";

/** Payload stored in the local app session JWT */
export interface LocalJwtPayload {
  userId: number;
  decargoId: string;
  email: string;
  name: string;
  role: string;
  teamId: number | null;
}

const TTL_SECONDS = 8 * 60 * 60; // 8 hours

function resolveSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET não está configurado.");
  return s;
}

export function signLocalJwt(payload: LocalJwtPayload): string {
  return jwt.sign(payload, resolveSecret(), {
    expiresIn: TTL_SECONDS,
    issuer: "diarias-app",
  });
}

export function verifyLocalJwt(token: string): LocalJwtPayload {
  return jwt.verify(token, resolveSecret(), {
    issuer: "diarias-app",
  }) as LocalJwtPayload;
}
