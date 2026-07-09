import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { verifyHandoffToken } from "../lib/handoff";
import { signLocalJwt } from "../lib/localJwt";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

/**
 * Translate the coarse People role into a local app role for new users.
 * Existing users keep their locally-assigned role; only new accounts
 * are provisioned with this default (least-privilege fallback).
 */
function mapPapelToLocalRole(papel: string): "admin" | "gestor" | "prestador" {
  switch (papel.toLowerCase()) {
    case "admin":
    case "administrador":
      return "admin";
    case "gestor":
    case "manager":
      return "gestor";
    default:
      return "prestador";
  }
}

/**
 * POST /api/auth/handoff
 * Body: { token: string }  — JWT that arrived in the URL fragment #handoff=<token>
 *
 * 1. Verifies the handoff JWT (issuer, audience, signature, expiry, jti one-time-use)
 * 2. Looks up the user by decargoId (authoritative) or email (fallback for existing rows)
 * 3. JIT-provisions when not found
 * 4. Returns a local Bearer JWT
 */
router.post("/handoff", async (req, res) => {
  const { token } = req.body as { token?: string };

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token ausente" });
    return;
  }

  let claims;
  try {
    claims = verifyHandoffToken(token);
  } catch (err: any) {
    req.log.warn({ err }, "Handoff token inválido");
    const msg = err?.message?.includes("replay")
      ? "Token já utilizado. Por favor, retorne ao DECARGO People e tente novamente."
      : "Token de handoff inválido ou expirado";
    res.status(401).json({ error: msg });
    return;
  }

  const decargoId = String(claims.id_usuario);
  const email = claims.email.toLowerCase();

  // 1. Primary lookup by decargoId (stable, authoritative)
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.decargoId, decargoId))
    .limit(1);

  // 2. Fallback: existing row keyed only by email (migration path for rows
  //    created before decargoId was tracked)
  if (!user) {
    [user] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email}`)
      .limit(1);

    if (user) {
      // Bind the authoritative decargoId now
      await db
        .update(usersTable)
        .set({ decargoId, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      user = { ...user, decargoId };
    }
  }

  if (!user) {
    // JIT provision — new user, default to least-privilege role
    const [created] = await db
      .insert(usersTable)
      .values({
        decargoId,
        name: claims.name,
        email,
        role: mapPapelToLocalRole(claims.papel),
        active: true,
      })
      .returning();
    user = created;
    req.log.info({ userId: user.id, email }, "Usuário JIT-provisionado via handoff");
  } else {
    if (!user.active) {
      res.status(403).json({ error: "Usuário inativo. Contate o administrador." });
      return;
    }
    // Sync name if changed (People is the source of truth for name)
    if (user.name !== claims.name) {
      await db
        .update(usersTable)
        .set({ name: claims.name, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      user = { ...user, name: claims.name };
    }
  }

  const accessToken = signLocalJwt({
    userId: user.id,
    decargoId: user.decargoId,
    email: user.email,
    name: user.name,
    role: user.role,
    teamId: user.teamId,
  });

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 8 * 60 * 60,
    usuario: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teamId: user.teamId,
    },
  });
});

/**
 * POST /api/auth/logout
 * Stateless — client drops the token. Returns 200 for consistency.
 */
router.post("/logout", (_req, res) => {
  res.json({ message: "Sessão encerrada" });
});

/**
 * GET /api/auth/me
 * requireAuth middleware loads the fresh user from DB; no synthetic fields here.
 */
router.get("/me", requireAuth, async (req, res) => {
  const u = req.currentUser!;
  const { teamsTable } = await import("@workspace/db");

  let teamName: string | null = null;
  if (u.teamId) {
    const [team] = await db
      .select({ name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.id, u.teamId))
      .limit(1);
    teamName = team?.name ?? null;
  }

  res.json({
    id: u.id,
    decargoId: u.decargoId,
    name: u.name,
    email: u.email,
    role: u.role,
    teamId: u.teamId,
    teamName,
    avatarUrl: u.avatarUrl ?? null,
    active: u.active,
    createdAt: u.createdAt,
  });
});

export default router;
