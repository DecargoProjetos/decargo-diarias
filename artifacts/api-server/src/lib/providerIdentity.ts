// This namespace is a LOCAL user reference, never an id_prestador in People.
// It stays stable when DECARGO ID rebinds the account's external identifier.
export function localProviderReference(userId: number): string {
  return `local-user:${userId}`;
}

export function providerBelongsToUser(
  provider: { decargoId: string; email: string | null; localReference?: string | null },
  user: { id: number; decargoId: string; email: string },
): boolean {
  if (provider.decargoId === localProviderReference(user.id) ||
      provider.localReference === localProviderReference(user.id)) return true;
  // Preserve established manual links. Numeric domains alone never prove identity.
  return (provider.decargoId === user.decargoId || provider.localReference === user.decargoId) &&
    (user.decargoId.startsWith("manual-") ||
      provider.email?.trim().toLowerCase() === user.email.trim().toLowerCase());
}

export function hasLocalProviderReference(reference: string): boolean {
  return reference.startsWith("local-user:") || reference.startsWith("manual-");
}

type UserIdentity = { id: number; decargoId: string; email: string };
export function ownProviderSql(externalParam: string, localParam: string): string {
  return `(p.decargo_id = ${localParam} OR (p.decargo_id = ${externalParam} AND NOT EXISTS
    (SELECT 1 FROM providers local_provider WHERE local_provider.decargo_id = ${localParam})))`;
}

/**
 * Resolve exactly one provider for a local user. Numeric IDs and names are
 * never identity evidence. Shared manual UUIDs are locally-created pairs;
 * otherwise only a unique normalized email can establish the link.
 * Parameter placeholders must be supplied by the caller, never user input.
 */
export function linkedProviderSql(userIdPlaceholder: string): string {
  return `coalesce(
    (SELECT min(explicit_provider.id) FROM providers explicit_provider
     WHERE explicit_provider.decargo_id = 'local-user:' || ${userIdPlaceholder}::text
        OR explicit_provider.local_reference = 'local-user:' || ${userIdPlaceholder}::text
     HAVING count(*) = 1),
    (SELECT min(lp.id)
    FROM providers lp JOIN users lu ON lu.id = (${userIdPlaceholder})::integer
    WHERE trim(lu.email) <> ''
      AND NOT EXISTS (SELECT 1 FROM providers explicit_provider
        WHERE explicit_provider.decargo_id = 'local-user:' || ${userIdPlaceholder}::text
           OR explicit_provider.local_reference = 'local-user:' || ${userIdPlaceholder}::text)
      AND (SELECT count(*) FROM users same_email
           WHERE lower(trim(same_email.email)) = lower(trim(lu.email))) = 1
      AND (
        lower(trim(lp.email)) = lower(trim(lu.email))
        OR (lu.decargo_id LIKE 'manual-%'
            AND (lp.decargo_id = lu.decargo_id OR lp.local_reference = lu.decargo_id)
            AND coalesce(trim(lp.email), '') = '')
      )
      AND (lp.decargo_id NOT LIKE 'local-user:%'
           OR lp.decargo_id = 'local-user:' || ${userIdPlaceholder}::text)
      AND (coalesce(lp.local_reference, '') NOT LIKE 'local-user:%'
           OR lp.local_reference = 'local-user:' || ${userIdPlaceholder}::text)
    HAVING count(*) = 1))`;
}

/**
 * Eligibility is deliberately stricter than ownership. Ambiguity must deny
 * operational use, not turn an inactive candidate into "no linked user".
 * A stable explicit local reference belongs only to that specific account;
 * external/manual providers are blocked by any plausible inactive email link.
 */
export function providerAccessActiveSql(providerIdPlaceholder: string): string {
  return `NOT EXISTS (SELECT 1 FROM users inactive_user
    JOIN providers candidate_provider ON candidate_provider.id = ${providerIdPlaceholder}
    WHERE inactive_user.active = false
      AND (
        candidate_provider.decargo_id = 'local-user:' || inactive_user.id::text
        OR candidate_provider.local_reference = 'local-user:' || inactive_user.id::text
        OR (
          candidate_provider.decargo_id NOT LIKE 'local-user:%'
          AND coalesce(candidate_provider.local_reference, '') NOT LIKE 'local-user:%'
          AND (
            (trim(inactive_user.email) <> ''
             AND lower(trim(candidate_provider.email)) = lower(trim(inactive_user.email)))
            OR (inactive_user.decargo_id LIKE 'manual-%'
                AND (candidate_provider.decargo_id = inactive_user.decargo_id
                     OR candidate_provider.local_reference = inactive_user.decargo_id)
                AND coalesce(trim(candidate_provider.email), '') = '')
          )
        )
      ))`;
}

/** Same precedence as linkedProviderSql; return ambiguity rather than guess. */
export function resolvePersonProvider(
  user: UserIdentity, users: UserIdentity[], providers: ProviderIdentity[],
): { providerId: number | null; ambiguous: boolean } {
  const explicit = providers.filter(p => p.decargoId === localProviderReference(user.id) ||
    p.localReference === localProviderReference(user.id));
  if (explicit.length) return {
    providerId: explicit.length === 1 ? explicit[0].id : null,
    ambiguous: explicit.length > 1,
  };
  const email = user.email.trim().toLowerCase();
  if (!email) return { providerId: null, ambiguous: false };
  const candidates = providers.filter(p =>
    (!p.decargoId.startsWith("local-user:") || p.decargoId === localProviderReference(user.id)) &&
    (!p.localReference?.startsWith("local-user:") || p.localReference === localProviderReference(user.id)) &&
    (p.email?.trim().toLowerCase() === email ||
    (user.decargoId.startsWith("manual-") &&
      (p.decargoId === user.decargoId || p.localReference === user.decargoId) && !p.email?.trim())),
  );
  const uniqueUser = users.filter(u => u.email.trim().toLowerCase() === email).length === 1;
  return {
    providerId: uniqueUser && candidates.length === 1 ? candidates[0].id : null,
    ambiguous: candidates.length > 0 && (!uniqueUser || candidates.length > 1),
  };
}

type ProviderIdentity = { id: number; decargoId: string; email: string | null; localReference?: string | null };
