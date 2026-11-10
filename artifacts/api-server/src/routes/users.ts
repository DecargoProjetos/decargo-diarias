import { randomUUID } from "crypto";
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { normalizePersonEmail, normalizePersonName } from "../lib/personIdentity";
import { localProviderReference, providerBelongsToUser } from "../lib/providerIdentity";
import { CreateUserBody, EnableUserDiariasBody, UpdateUserBody } from "@workspace/api-zod";
import { updatePerson, PersonUpdateError } from "../lib/updatePerson";
import { latestUserSyncReport, listUserSyncReports, getUserSyncReport, USER_SYNC_REPORT_RETENTION_DAYS } from "../lib/userSyncReports";
import { ListUserSyncReportsQueryParams, GetUserSyncReportParams } from "@workspace/api-zod";
import { db, usersTable, providersTable, teamsTable, auditLogsTable } from "@workspace/db";
import usersSyncRouter from "./usersSync";

const router = Router();
router.use(usersSyncRouter);

router.get("/sync-reports", requireRole("admin"), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = ListUserSyncReportsQueryParams.safeParse(req.query);
  if (!parsed.success || !Number.isInteger(parsed.data.page) || !Number.isInteger(parsed.data.pageSize)) {
    res.status(400).json({ error: "Paginação inválida." });
    return;
  }
  try {
    res.json(await listUserSyncReports(parsed.data.page ?? 1, parsed.data.pageSize ?? 10));
  } catch (err) {
    req.log.error({ err }, "User sync report listing failed");
    res.status(503).json({ error: "Não foi possível consultar o histórico de funcionários." });
  }
});

router.get("/sync-reports/latest", requireRole("admin"), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    res.json({ report: await latestUserSyncReport(), retentionDays: USER_SYNC_REPORT_RETENTION_DAYS });
  } catch (err) {
    req.log.error({ err }, "User sync report lookup failed");
    res.status(503).json({ error: "Não foi possível consultar o relatório salvo. Tente consultar novamente, sem repetir a importação." });
  }
});

router.get("/sync-reports/:reportId", requireRole("admin"), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = GetUserSyncReportParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Identificador de execução inválido." });
    return;
  }
  try {
    const report = await getUserSyncReport(parsed.data.reportId);
    if (!report) {
      res.status(404).json({ error: "Execução não encontrada ou fora do prazo de retenção de 30 dias." });
      return;
    }
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "User sync report lookup failed");
    res.status(503).json({ error: "Não foi possível consultar o histórico de funcionários." });
  }
});

// Registration is separate from import and from explicit provider enablement.
router.post("/", requireRole("admin"), async (req, res) => {
  const body = req.body;
  const parsed = CreateUserBody.strict().safeParse(body && typeof body === "object" ? {
    ...body,
    name: typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : body.name,
    email: typeof body.email === "string" ? normalizePersonEmail(body.email) : body.email,
  } : body);
  if (!parsed.success) {
    res.status(400).json({ error: "Preencha nome, e-mail e tipo válidos. Confira também a equipe e o valor da diária." });
    return;
  }
  const { name, email, role, teamId, active, dailyRate } = parsed.data;
  const normalizedName = normalizePersonName(name);
  if (!normalizedName ||
      (teamId != null && !Number.isSafeInteger(teamId)) ||
      (dailyRate != null && Math.abs(dailyRate * 100 - Math.round(dailyRate * 100)) > 0.000001)) {
    res.status(400).json({ error: "Informe o nome completo da pessoa." });
    return;
  }

  const result = await db.transaction(async tx => {
    // Serialize manual registrations and keep user + provider creation atomic.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(724091513)`);
    const identities = [
      ...await tx.select({ name: usersTable.name, email: usersTable.email }).from(usersTable),
      ...await tx.select({ name: providersTable.name, email: providersTable.email }).from(providersTable),
    ];
    if (identities.some(person =>
      normalizePersonName(person.name) === normalizedName ||
      (person.email && normalizePersonEmail(person.email) === email)
    )) return { error: "duplicate" as const };
    if (teamId != null) {
      const [team] = await tx.select({ id: teamsTable.id }).from(teamsTable)
        .where(eq(teamsTable.id, teamId)).limit(1);
      if (!team) return { error: "team" as const };
    }
    const [created] = await tx.insert(usersTable).values({
      decargoId: `manual-${randomUUID()}`, name, email, role,
      teamId: teamId ?? null, active: active ?? true,
    }).returning();
    await tx.insert(providersTable).values({
      decargoId: created.decargoId, name, email,
      teamId: created.teamId, active: created.active,
      dailyRate: dailyRate == null ? null : dailyRate.toFixed(2),
    });
    return { created };
  });
  if ("error" in result) {
    res.status(result.error === "duplicate" ? 409 : 400).json({
      error: result.error === "duplicate"
        ? "Esta pessoa já possui registro no sistema. Localize o cadastro existente para editar os dados."
        : "A equipe selecionada não existe. Selecione uma equipe válida.",
      code: result.error === "duplicate" ? "PERSON_ALREADY_REGISTERED" : "INVALID_TEAM",
    });
    return;
  }
  const { created } = result;

  await logAudit({
    entityType: "user",
    entityId: created.id,
    action: "criado manualmente",
    actor: req.currentUser!,
    newValues: { name, email, role, teamId: teamId ?? null, dailyRate: dailyRate ?? null },
  });

  res.status(201).json(created);
});

// GET /api/users (admin only)
router.get("/", requireRole("admin"), async (req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      decargoId: usersTable.decargoId,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      teamId: usersTable.teamId,
      teamName: teamsTable.name,
      avatarUrl: usersTable.avatarUrl,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .leftJoin(teamsTable, eq(usersTable.teamId, teamsTable.id))
    .orderBy(usersTable.name);

  res.json(users);
});

// Explicit enablement only: never promote the access role or borrow a numeric
// employee/account id as an external provider identity.
router.post("/:id/enable-diarias", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = EnableUserDiariasBody.strict().safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !parsed.success ||
      parsed.data.confirmed !== true ||
      !Number.isFinite(parsed.data.dailyRate) ||
      Math.abs(parsed.data.dailyRate * 100 - Math.round(parsed.data.dailyRate * 100)) > 0.000001) {
    res.status(400).json({ error: "Confirme a habilitação e informe um valor de diária válido com até duas casas decimais." });
    return;
  }
  const result = await db.transaction(async tx => {
    // Same cross-process lock as registration. A second request cannot overwrite
    // the winner's rate, nor leave a partial provider or missing audit.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(724091513)`);
    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, id)).for("update");
    if (!user) return { error: "missing" as const };
    const providers = await tx.select().from(providersTable);
    if (providers.some(provider => providerBelongsToUser(provider, user))) {
      return { error: "enabled" as const };
    }
    if (providers.some(provider =>
      (provider.email && normalizePersonEmail(provider.email) === normalizePersonEmail(user.email)) ||
      normalizePersonName(provider.name) === normalizePersonName(user.name)
    )) return { error: "ambiguous" as const };
    const [provider] = await tx.insert(providersTable).values({
      decargoId: localProviderReference(user.id),
      name: user.name, email: user.email,
      teamId: user.teamId, active: user.active,
      dailyRate: parsed.data.dailyRate.toFixed(2),
      syncedAt: null,
    }).returning();
    await tx.insert(auditLogsTable).values({
      entityType: "user", entityId: id, action: "diárias habilitadas",
      userId: req.currentUser!.id,
      userNameAtAction: req.currentUser!.name,
      newValues: { providerId: provider.id, dailyRate: provider.dailyRate, localOnly: true },
    });
    return { provider };
  });
  if (result.error) {
    const errors = {
      missing: ["Usuário não encontrado", "USER_NOT_FOUND"],
      enabled: ["Esta pessoa já possui vínculo para diárias. Edite o valor no cadastro existente.", "DIARIAS_ALREADY_ENABLED"],
      ambiguous: ["Existe um prestador com o mesmo nome ou e-mail sem vínculo confirmado. Resolva a identificação antes de habilitar diárias.", "PROVIDER_IDENTITY_CONFLICT"],
    };
    const [error, code] = errors[result.error];
    res.status(result.error === "missing" ? 404 : 409).json({ error, code });
    return;
  }
  res.status(201).json({
    providerId: result.provider.id, dailyRate: Number(result.provider.dailyRate),
    localOnly: true,
  });
});

// GET /api/users/:id
router.get("/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const me = req.currentUser!;

  // Non-admins can only see themselves
  if (me.role !== "admin" && me.id !== id) {
    res.status(403).json({ error: "Acesso não autorizado" });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      decargoId: usersTable.decargoId,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      teamId: usersTable.teamId,
      teamName: teamsTable.name,
      avatarUrl: usersTable.avatarUrl,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .leftJoin(teamsTable, eq(usersTable.teamId, teamsTable.id))
    .where(eq(usersTable.id, id))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  res.json(user);
});

// PATCH /api/users/:id (admin only)
router.patch("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateUserBody.strict().safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !parsed.success ||
      (parsed.data.name !== undefined && !parsed.data.name.trim()) ||
      (parsed.data.teamId != null && !Number.isSafeInteger(parsed.data.teamId)) ||
      (parsed.data.dailyRate != null && Math.abs(parsed.data.dailyRate * 100 - Math.round(parsed.data.dailyRate * 100)) > 0.000001)) {
    res.status(400).json({ error: "Informe dados válidos e valor com até duas casas decimais." });
    return;
  }
  try {
    res.json(await updatePerson("user", id, parsed.data, req.currentUser!));
  } catch (err) {
    if (err instanceof PersonUpdateError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    throw err;
  }
});

// DELETE /api/users/:id (admin only)
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const me = req.currentUser!;

  if (id === me.id) {
    res.status(400).json({ error: "Você não pode excluir a própria conta." });
    return;
  }

  let deleted;
  try {
    [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  } catch (err) {
    // `diarias.created_by` has no ON DELETE rule (RESTRICT by default), so a
    // user who created at least one diária cannot be hard-deleted — surface
    // that as a clear message instead of a generic 500; desativar (active:
    // false) via PATCH is the supported way to retire such an account.
    req.log.error({ err }, "User delete failed");
    res.status(409).json({
      error: "Não é possível excluir: este usuário criou diárias no sistema. Desative o acesso em vez de excluir.",
    });
    return;
  }

  if (!deleted) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }

  await logAudit({
    entityType: "user",
    entityId: id,
    action: "excluído",
    actor: me,
  });

  res.json({ message: "Usuário excluído" });
});

export default router;
