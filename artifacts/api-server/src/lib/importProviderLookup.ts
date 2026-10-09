import { normalizePersonName } from "./personIdentity";

type ProviderIdentity = {
  id: number;
  name: string;
  active: boolean;
  teamId: number | null;
};

type LookupResult<T> =
  | { status: "found"; provider: T }
  | { status: "not_found" | "inactive" | "ambiguous" | "forbidden" };

export function indexImportProviders<T extends ProviderIdentity>(providers: readonly T[]) {
  const index = new Map<string, T[]>();
  for (const provider of providers) {
    const name = normalizePersonName(provider.name);
    const matches = index.get(name) ?? [];
    matches.push(provider);
    index.set(name, matches);
  }
  return index;
}

/**
 * Resolve a full name, never a partial/fuzzy match. Inactive duplicates cannot
 * overwrite active records. Multiple active people require an unambiguous
 * match inside the manager's scope; admins must review ambiguous registrations.
 * The caller still checks the selected provider's team and authorization.
 */
export function resolveImportProvider<T extends ProviderIdentity>(
  index: ReadonlyMap<string, readonly T[]>,
  name: string,
  managerTeamIds?: readonly number[],
): LookupResult<T> {
  const matches = index.get(normalizePersonName(name)) ?? [];
  if (!matches.length) return { status: "not_found" };
  const active = matches.filter(provider => provider.active);
  if (!active.length) return { status: "inactive" };
  if (active.length === 1) return { status: "found", provider: active[0] };
  const eligible = managerTeamIds === undefined ? active
    : active.filter(provider => provider.teamId != null && managerTeamIds.includes(provider.teamId));
  if (!eligible.length) return { status: "forbidden" };
  if (eligible.length > 1) return { status: "ambiguous" };
  return { status: "found", provider: eligible[0] };
}
