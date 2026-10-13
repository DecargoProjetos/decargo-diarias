// Target: DecargoProjetos/decargo-diarias, artifacts/api-server/src/routes/people-inactivation.ts
import { Router } from "express";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { db, usersTable, peopleSyncSessionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();
interface Claims {
  purpose: "decargo-account-deactivation"; app: "diarias";
  email: string; id_usuario: number; event_id: string; iat: number; exp: number;
}
export function verifyPeopleInactivation(token: string, secret: string) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || token.length > 4096) throw new Error("Token inválido");
  const key = hkdfSync("sha256", secret, "decargo-id", "account-deactivation-v1", 32);
  const expected = createHmac("sha256", Buffer.from(key)).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error("Token inválido");
  const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
  if (!value || typeof value !== "object" || value.purpose !== "decargo-account-deactivation" || value.app !== "diarias" ||
      typeof value.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) ||
      !Number.isInteger(value.id_usuario) || value.id_usuario <= 0 ||
      typeof value.event_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.event_id) ||
      !Number.isInteger(value.iat) || !Number.isInteger(value.exp)) throw new Error("Evento inválido");
  const now = Math.floor(Date.now() / 1000);
  if (value.iat > now + 5 || value.exp <= now || value.exp - value.iat > 90 || value.exp <= value.iat) throw new Error("Token expirado");
  return value;
}
router.post("/integrations/people/deactivate", async (req, res): Promise<void> => {
  const secret = process.env.DECARGO_ID_HANDOFF_SECRET;
  if (!secret) { res.status(503).json({ error: "Integração de inativação não configurada." }); return; }
  let value;
  try {
    value = verifyPeopleInactivation(req.headers.authorization?.replace(/^Bearer /, "") ?? "", secret);
  } catch { res.status(401).json({ error: "Evento de inativação inválido ou expirado." }); return; }
  const result = await db.transaction(async (tx) => {
    // decargoId can contain id_funcionario rather than id_usuario; email is the established mapping.
    const users = await tx.select().from(usersTable).where(sql`lower(trim(${usersTable.email})) = ${value.email.trim().toLowerCase()}`).limit(2).for("update");
    if (users.length > 1) return { conflict: true, found: false };
    if (!users.length) return { conflict: false, found: false };
    await tx.update(usersTable).set({ active: false, updatedAt: new Date() }).where(eq(usersTable.id, users[0].id));
    await tx.delete(peopleSyncSessionsTable).where(eq(peopleSyncSessionsTable.userId, users[0].id));
    return { conflict: false, found: true };
  });
  if (result.conflict) { res.status(409).json({ error: "Associação de conta ambígua." }); return; }
  res.json({ success: true, found: result.found, event_id: value.event_id });
});
export default router;
