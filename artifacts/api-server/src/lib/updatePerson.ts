import { db, usersTable, providersTable, teamsTable, auditLogsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { resolvePersonProvider } from "./providerIdentity";
import type { AuditActor } from "./audit";

type PersonUpdate = {
  name?: string; email?: string | null; teamId?: number | null; active?: boolean;
  role?: string; cnpj?: string | null; dailyRate?: number | null;
  expectedUpdatedAt?: string | Date;
  expectedProviderId?: number | null;
  expectedProviderUpdatedAt?: string | Date | null;
};

export class PersonUpdateError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const conflict = () => new PersonUpdateError(409, "PERSON_EDIT_CONFLICT",
  "Esta pessoa foi alterada por outra operação. Atualize a lista e revise os dados antes de salvar novamente.");
const identityConflict = () => new PersonUpdateError(409, "PROVIDER_IDENTITY_CONFLICT",
  "O vínculo desta pessoa é ambíguo. Confira os cadastros antes de alterar os dados.");

/** Both legacy PATCH entry points share a single atomic write boundary. */
export async function updatePerson(
  source: "user" | "provider", id: number, input: PersonUpdate, actor: AuditActor,
) {
  return db.transaction(async tx => {
    // Also used by manual registration/enablement. Lock order is always
    // advisory -> user -> provider, across both entry points.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(724091513)`);
    const users = await tx.select().from(usersTable);
    const providers = await tx.select().from(providersTable);
    let user = source === "user" ? users.find(u => u.id === id) : undefined;
    let provider = source === "provider" ? providers.find(p => p.id === id) : undefined;
    // Revoking one known record does not require guessing financial ownership.
    // No name, email, role, team or rate edits may piggyback on this exception.
    const deactivationOnly = input.active === false && Object.keys(input).every(key =>
      ["active", "expectedUpdatedAt", "expectedProviderId", "expectedProviderUpdatedAt"].includes(key));
    if (source === "user" ? !user : !provider) {
      throw new PersonUpdateError(404, "PERSON_NOT_FOUND", "Pessoa não encontrada.");
    }
    if (user) {
      const link = resolvePersonProvider(user, users, providers);
      if (link.ambiguous && !deactivationOnly) throw identityConflict();
      provider = providers.find(p => p.id === link.providerId);
    } else {
      const owners = users.filter(u => {
        const link = resolvePersonProvider(u, users, providers);
        return link.providerId === id || (link.ambiguous &&
          u.email.trim().toLowerCase() === provider!.email?.trim().toLowerCase());
      });
      if (owners.length > 1 || owners.some(u => resolvePersonProvider(u, users, providers).ambiguous)) {
        if (!deactivationOnly) throw identityConflict();
        // The provider itself is known; do not revoke an arbitrary account.
        user = undefined;
      } else {
        user = owners[0];
      }
      // Admin-confirmed email on a previously unlinked provider may establish
      // ownership. Include that account in the same transaction, never deny
      // the existing confirmation workflow merely because the account exists.
      if (!user && input.email) {
        const prospective = providers.map(p => p.id === id ? { ...p, email: input.email!.trim().toLowerCase() } : p);
        const matches = users.filter(u => {
          const link = resolvePersonProvider(u, users, prospective);
          if (link.ambiguous && u.email.trim().toLowerCase() === input.email!.trim().toLowerCase()) throw identityConflict();
          return link.providerId === id;
        });
        if (matches.length > 1) throw identityConflict();
        user = matches[0];
      }
    }
    // Re-read locked rows: auth/name updates or other database writers may
    // have changed them while this request was waiting.
    if (user) {
      [user] = await tx.select().from(usersTable).where(eq(usersTable.id, user.id)).for("update");
      if (!user) throw conflict();
    }
    if (provider) {
      [provider] = await tx.select().from(providersTable).where(eq(providersTable.id, provider.id)).for("update");
      if (!provider) throw conflict();
    }
    // Lock waits can include identity edits by other database writers. Never
    // apply an edit to the provider selected using the old identity evidence.
    if (user && provider) {
      const currentUsers = users.map(u => u.id === user!.id ? user! : u);
      const currentProviders = providers.map(p => p.id === provider!.id
        ? { ...provider!, ...(source === "provider" && input.email !== undefined ? { email: input.email } : {}) } : p);
      const link = resolvePersonProvider(user, currentUsers, currentProviders);
      if (link.ambiguous || link.providerId !== provider.id) throw conflict();
    }
    const anchor = source === "user" ? user! : provider!;
    if (input.expectedUpdatedAt !== undefined &&
        new Date(input.expectedUpdatedAt).getTime() !== anchor.updatedAt.getTime()) throw conflict();
    if (source === "user") {
      if (input.expectedProviderId !== undefined && input.expectedProviderId !== (provider?.id ?? null)) throw conflict();
      if (input.expectedProviderUpdatedAt !== undefined &&
          (input.expectedProviderUpdatedAt === null ? provider != null :
            !provider || new Date(input.expectedProviderUpdatedAt).getTime() !== provider.updatedAt.getTime())) throw conflict();
    }
    if (input.dailyRate !== undefined && !provider) {
      throw new PersonUpdateError(409, "DIARIAS_NOT_ENABLED", "Habilite diárias antes de definir o valor.");
    }
    if (input.teamId != null) {
      const [team] = await tx.select().from(teamsTable).where(eq(teamsTable.id, input.teamId));
      if (!team) throw new PersonUpdateError(400, "INVALID_TEAM", "A equipe selecionada não existe.");
    }
    const email = input.email === undefined ? undefined : input.email?.trim().toLowerCase() || null;
    if (email !== undefined) {
      if (user && !email) throw new PersonUpdateError(400, "INVALID_EMAIL", "Uma pessoa com acesso precisa de e-mail.");
      if (email && (users.some(u => u.id !== user?.id && u.email.trim().toLowerCase() === email) ||
          providers.some(p => p.id !== provider?.id && p.email?.trim().toLowerCase() === email))) {
        throw new PersonUpdateError(409, "PERSON_EMAIL_CONFLICT", "Este e-mail já está associado a outra pessoa.");
      }
    }
    // Monotonic even for two writes within one millisecond.
    const updatedAt = new Date(Math.max(Date.now(), (user?.updatedAt.getTime() ?? 0) + 1,
      (provider?.updatedAt.getTime() ?? 0) + 1));
    const shared = {
      updatedAt,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      // Repair pre-existing status drift conservatively: edits do not silently
      // reactivate an inactive access account or its financial record.
      ...(input.active === undefined && user && provider && (!user.active || !provider.active) ? { active: false } : {}),
    };
    if (user) {
      const values = { ...shared, ...(input.role !== undefined ? { role: input.role } : {}) };
      // A user always has an email; the nullable provider input was checked above.
      const [updated] = await tx.update(usersTable).set({ ...values,
        ...(email !== undefined ? { email: email! } : {}) }).where(eq(usersTable.id, user.id)).returning();
      if (!updated) throw conflict();
      await tx.insert(auditLogsTable).values({
        entityType: "user", entityId: user.id, action: "atualizado", userId: actor.id,
        userNameAtAction: actor.name,
        oldValues: user, newValues: updated,
      });
      user = updated;
    }
    if (provider) {
      const values = { ...shared,
        ...(email !== undefined ? { email } : {}),
        ...(input.dailyRate !== undefined ? { dailyRate: input.dailyRate === null ? null : input.dailyRate.toFixed(2) } : {}),
        ...(input.cnpj !== undefined ? { cnpj: input.cnpj } : {}),
      };
      const [updated] = await tx.update(providersTable).set(values).where(eq(providersTable.id, provider.id)).returning();
      if (!updated) throw conflict();
      await tx.insert(auditLogsTable).values({
        entityType: "provider", entityId: provider.id, action: "atualizado", userId: actor.id,
        userNameAtAction: actor.name,
        oldValues: provider, newValues: updated,
      });
      provider = updated;
    }
    return source === "user" ? user! : { ...provider!, dailyRate: provider!.dailyRate == null ? null : Number(provider!.dailyRate) };
  });
}
