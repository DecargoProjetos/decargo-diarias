import { Router } from "express";
import { getOidcClient, getCallbackUrl, generators } from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /api/auth/login
router.get("/login", async (req, res) => {
  try {
    const client = await getOidcClient();
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    req.session.state = state;
    req.session.nonce = nonce;
    req.session.codeVerifier = codeVerifier;

    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );

    const authUrl = client.authorizationUrl({
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      redirect_uri: getCallbackUrl(),
    });

    res.redirect(authUrl);
  } catch (err) {
    req.log.error({ err }, "OIDC login error");
    res.status(500).json({ error: "Erro ao iniciar autenticação" });
  }
});

// GET /api/auth/callback
router.get("/callback", async (req, res) => {
  try {
    const client = await getOidcClient();
    const params = client.callbackParams(req);
    const { state, nonce, codeVerifier } = req.session;

    const tokenSet = await client.callback(getCallbackUrl(), params, {
      state,
      nonce,
      code_verifier: codeVerifier,
    });

    const claims = tokenSet.claims();
    const decargoId = claims.sub;
    const name = (claims.name as string) || (claims.preferred_username as string) || "Usuário";
    const email = (claims.email as string) || "";
    const avatarUrl = (claims.picture as string) || null;

    // Upsert user
    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.decargoId, decargoId))
      .limit(1);

    if (!user) {
      const [created] = await db
        .insert(usersTable)
        .values({ decargoId, name, email, role: "prestador", avatarUrl })
        .returning();
      user = created;
    } else {
      const [updated] = await db
        .update(usersTable)
        .set({ name, email, avatarUrl, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id))
        .returning();
      user = updated;
    }

    req.session.userId = user.id;
    delete req.session.state;
    delete req.session.nonce;
    delete req.session.codeVerifier;

    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );

    res.redirect("/");
  } catch (err) {
    req.log.error({ err }, "OIDC callback error");
    res.redirect("/?error=auth_failed");
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) req.log.error({ err }, "Session destroy error");
    res.json({ message: "Sessão encerrada" });
  });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const u = req.currentUser!;
  // Fetch team name
  let teamName: string | null = null;
  if (u.teamId) {
    const { teamsTable } = await import("@workspace/db");
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
    avatarUrl: u.avatarUrl,
    active: u.active,
    createdAt: u.createdAt,
  });
});

export default router;
