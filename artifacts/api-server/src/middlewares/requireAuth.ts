import type { Request, Response, NextFunction } from "express";
import { verifyLocalJwt } from "../lib/localJwt";
import type { User } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}

/**
 * Extracts and verifies the local Bearer JWT.
 * Populates req.currentUser from the JWT claims — no DB call needed per request.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  let payload;
  try {
    payload = verifyLocalJwt(token);
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return;
  }

  // Shape JWT payload into the User-compatible object routes expect
  req.currentUser = {
    id: payload.userId,
    decargoId: payload.decargoId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    teamId: payload.teamId,
    // Fields not in JWT — safe defaults (routes that need them query the DB directly)
    active: true,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  next();
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await requireAuth(req, res, async () => {
      if (!req.currentUser || !roles.includes(req.currentUser.role)) {
        res.status(403).json({ error: "Acesso não autorizado" });
        return;
      }
      next();
    });
  };
}
