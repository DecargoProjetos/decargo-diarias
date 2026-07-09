import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
 * Extracts and verifies the local Bearer JWT, then revalidates the user
 * against the database on every request so that deactivation and role changes
 * take effect immediately (not after token expiry).
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

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

  // Revalidate against the database — catches deactivated users and role changes
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId))
    .limit(1);

  if (!user || !user.active) {
    res.status(401).json({ error: "Sessão inválida ou usuário inativo" });
    return;
  }

  req.currentUser = user;
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
