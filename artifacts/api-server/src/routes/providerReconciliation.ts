import { Router } from "express";
import { db, providersTable, usersTable, diariasTable, auditLogsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { ResolveProviderReconciliationBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/requireAuth";
import { fetchPrestadores } from "../lib/peopleClient";
import { getPeopleSyncAccess, peopleUserSyncEnabled, PeopleUserSyncError } from "../lib/peopleUserSync";
import {
  isUnreconciledLocal, normalizeCnpj, remoteProviderId, remoteIdentityConflict, reconciliationConflict,
} from "../lib/providerReconciliation";

const router = Router();

router.get("/", requireRole("admin"), async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const access = peopleUserSyncEnabled() ? await getPeopleSyncAccess(req) : undefined;
    const remote = await fetchPrestadores(access);
    const providers = await db.select().from(providersTable);
    const locals = providers.filter(isUnreconciledLocal);
    const seen = new Set<string>();
    const candidates = remote.flatMap(p => {
      const id = remoteProviderId(p);
      const candidateId = id ?? String(p.id_prestador);
      if (seen.has(candidateId)) return [];
      seen.add(candidateId);
      const existing = providers.find(local => local.decargoId === id);
      // Include already imported duplicates for deliberate reconciliation, but
      // never present a previously reconciled external identity as available.
      if (existing?.localReference || (existing && !locals.length)) return [];
      return [{
        externalId: candidateId,
        name: p.titular_do_contrato, cnpj: p.cnpj,
        existingProviderId: existing?.id ?? null,
        conflict: remoteIdentityConflict(p, remote),
      }];
    });
    res.json(candidates);
  } catch (err) {
    req.log.error({ err }, "Provider identity review failed");
    res.status(err instanceof PeopleUserSyncError ? err.status : 502).json({
      error: err instanceof PeopleUserSyncError ? err.message : "Não foi possível consultar as identidades atuais no People. Tente novamente.",
    });
  }
});

router.post("/", requireRole("admin"), async (req, res) => {
  const parsed = ResolveProviderReconciliationBody.safeParse(req.body);
  if (!parsed.success || parsed.data.confirmed !== true ||
      parsed.data.evidence.trim().length < 10 ||
      (parsed.data.action === "link" && (!Number.isSafeInteger(parsed.data.localProviderId) ||
        parsed.data.localProviderId! > 2147483647 || !normalizeCnpj(parsed.data.verifiedCnpj)))) {
    res.status(400).json({ error: "Confirme a decisão, descreva a evidência verificada e, para vincular, selecione o cadastro e informe um CNPJ válido." });
    return;
  }
  const input = parsed.data;
  try {
    // Re-fetch on confirmation: a previous screen snapshot is not authoritative.
    const access = peopleUserSyncEnabled() ? await getPeopleSyncAccess(req) : undefined;
    const remote = await fetchPrestadores(access);
    const matches = remote.filter(p => remoteProviderId(p) === input.externalId);
    if (matches.length !== 1) {
      res.status(409).json({ error: "A identidade não está mais disponível ou é ambígua no People. Atualize a revisão." });
      return;
    }
    const person = matches[0];
    const conflict = remoteIdentityConflict(person, remote);
    if (conflict) {
      res.status(409).json({ error: conflict });
      return;
    }
    const result = await db.transaction(async tx => {
      // Serialize across processes with sync, manual creation and enablement.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(724091513)`);
      const providers = await tx.select().from(providersTable).for("update");
      const duplicate = providers.find(p => p.decargoId === input.externalId);
      if (input.action === "separate") {
        if (duplicate) return { error: "Este prestador já está cadastrado. Nenhuma pessoa foi criada." };
        const cnpj = normalizeCnpj(person.cnpj);
        if (cnpj && providers.some(p => normalizeCnpj(p.cnpj) === cnpj)) {
          return { error: "Este CNPJ já pertence a um cadastro local. Verifique o vínculo em vez de importar outra pessoa." };
        }
        const [created] = await tx.insert(providersTable).values({
          decargoId: input.externalId, name: person.titular_do_contrato,
          cnpj: person.cnpj, active: person.tem_contrato_ativo ?? false, syncedAt: new Date(),
        }).returning();
        await tx.insert(auditLogsTable).values({
          entityType: "provider", entityId: created.id, userId: req.currentUser!.id,
          userNameAtAction: req.currentUser!.name,
          action: "importação distinta confirmada",
          newValues: { externalId: input.externalId, cnpj, evidence: input.evidence.trim(), confirmed: true,
            confirmedByName: req.currentUser!.name },
        });
        return { message: "Pessoa distinta importada após confirmação." };
      }
      const local = providers.find(p => p.id === input.localProviderId);
      if (!local) return { error: "O cadastro local não existe mais. Atualize a lista." };
      const cnpj = normalizeCnpj(person.cnpj);
      if (normalizeCnpj(input.verifiedCnpj) !== cnpj) {
        return { error: "O CNPJ verificado não corresponde ao cadastro atual no People." };
      }
      const history = duplicate
        ? await tx.select({ id: diariasTable.id }).from(diariasTable)
            .where(eq(diariasTable.providerId, duplicate.id)).limit(1)
        : [];
      const duplicateAudit = duplicate
        ? await tx.select({ id: auditLogsTable.id }).from(auditLogsTable)
            .where(sql`${auditLogsTable.entityType} = 'provider' AND ${auditLogsTable.entityId} = ${duplicate.id}`).limit(1)
        : [];
      const localConflict = reconciliationConflict(local, person, providers, duplicate, history.length > 0 || duplicateAudit.length > 0);
      if (localConflict) return { error: localConflict };
      // A remote duplicate's email may have been removed, while a manual-* or
      // attested-email account still owns it. Never discard such a relationship.
      if (duplicate) {
        const owners = await tx.select({ id: usersTable.id }).from(usersTable)
          .where(sql`lower(trim(${usersTable.email})) = lower(trim(${duplicate.email ?? ""}))
            OR ${usersTable.decargoId} = ${duplicate.decargoId} AND ${usersTable.decargoId} LIKE 'manual-%'`);
        if (owners.length) return { error: "O cadastro People possui um vínculo de acesso próprio. Nenhum vínculo foi alterado." };
        await tx.delete(providersTable).where(eq(providersTable.id, duplicate.id));
      }
      const [updated] = await tx.update(providersTable).set({
        decargoId: input.externalId, localReference: local.decargoId,
        cnpj, syncedAt: new Date(), updatedAt: new Date(),
        // Never resurrect either local record when resolving a pristine duplicate.
        active: local.active && (duplicate?.active ?? true),
      }).where(eq(providersTable.id, local.id)).returning();
      await tx.insert(auditLogsTable).values({
        entityType: "provider", entityId: local.id, userId: req.currentUser!.id,
        userNameAtAction: req.currentUser!.name,
        action: "identidade People reconciliada",
        oldValues: { local, duplicate: duplicate ?? null },
        newValues: { provider: updated, externalId: input.externalId, cnpj,
          evidence: input.evidence.trim(), confirmed: true, confirmedByName: req.currentUser!.name,
          removedPristineProviderId: duplicate?.id ?? null },
      });
      return { message: "Vínculo confirmado. Cadastro, histórico, valor, equipe e permissões locais preservados." };
    });
    res.status("error" in result ? 409 : 200).json(result);
  } catch (err) {
    req.log.error({ err }, "Provider reconciliation failed");
    res.status(err instanceof PeopleUserSyncError ? err.status : 502).json({
      error: err instanceof PeopleUserSyncError ? err.message : "Não foi possível concluir a reconciliação. Nenhuma alteração parcial foi aplicada.",
    });
  }
});

export default router;
