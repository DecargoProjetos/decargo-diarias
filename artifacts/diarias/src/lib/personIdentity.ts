type Identity = { id: number; decargoId: string; email?: string | null; localReference?: string | null };
export type PersonTipo = 'Administrador' | 'Gestor' | 'Funcionário' | 'Prestador';
type Person = Identity & {
  name: string; teamId?: number | null; teamName?: string | null; active: boolean;
  updatedAt?: string;
};
type PersonUser = Person & { role: string };
type PersonProvider = Person & { dailyRate?: number | null; syncedAt?: string | null };
export type PersonRow = {
  key: string; tipo: PersonTipo; sourceId: number; decargoId: string; name: string;
  email: string | null | undefined; teamId: number | null | undefined;
  teamName: string | null | undefined; dailyRate: number | null | undefined;
  active: boolean; syncedAt: string | null | undefined; linkedProviderId?: number; localOnly?: boolean;
  updatedAt?: string; linkedProviderUpdatedAt?: string;
};
const emailKey = (email?: string | null) => email?.trim().toLowerCase() ?? '';

/** Match identities, not numeric IDs or names. Ambiguous matches stay separate. */
export function linkPeopleProviders<U extends Identity, P extends Identity>(users: U[], providers: P[]): Map<number, P> {
  const links = new Map<number, P>();
  for (const user of users) {
    const explicit = providers.filter(p => p.decargoId === `local-user:${user.id}` || p.localReference === `local-user:${user.id}`);
    if (explicit.length) {
      if (explicit.length === 1) links.set(user.id, explicit[0]);
      continue;
    }
    const email = emailKey(user.email);
    if (!email || users.filter(u => emailKey(u.email) === email).length !== 1) continue;
    const candidates = providers.filter(p =>
      (!p.decargoId.startsWith('local-user:') || p.decargoId === `local-user:${user.id}`) &&
      (!p.localReference?.startsWith('local-user:') || p.localReference === `local-user:${user.id}`) &&
      (emailKey(p.email) === email ||
      (user.decargoId.startsWith('manual-') &&
        (p.decargoId === user.decargoId || p.localReference === user.decargoId) && !emailKey(p.email)))
    );
    if (candidates.length === 1) links.set(user.id, candidates[0]);
  }
  return links;
}

/** One visible row per unambiguous person; keep edit endpoints and rates intact. */
export function buildPeopleRows(users: PersonUser[], providers: PersonProvider[]): PersonRow[] {
  const links = linkPeopleProviders(users, providers);
  const fromUsers: PersonRow[] = users.flatMap(u => {
    const p = links.get(u.id);
    return [{
      key: `user-${u.id}`, sourceId: u.id, decargoId: u.decargoId, name: u.name,
      email: u.email, teamId: u.teamId, teamName: u.teamName, active: u.active,
      tipo: u.role === 'admin' ? 'Administrador' : u.role === 'gestor' ? 'Gestor' :
        u.role === 'prestador' ? 'Prestador' : 'Funcionário',
      dailyRate: p?.dailyRate == null ? null : Number(p.dailyRate),
      syncedAt: p?.syncedAt ?? null, linkedProviderId: p?.id,
      updatedAt: u.updatedAt, linkedProviderUpdatedAt: p?.updatedAt,
      localOnly: p?.decargoId.startsWith('local-user:') || p?.decargoId.startsWith('manual-'),
    }];
  });
  const claimed = new Set(fromUsers.map(r => r.linkedProviderId));
  const fromProviders: PersonRow[] = providers.filter(p => !claimed.has(p.id)).map(p => ({
    key: `provider-${p.id}`, tipo: 'Prestador', sourceId: p.id, decargoId: p.decargoId,
    name: p.name, email: p.email, teamId: p.teamId, teamName: p.teamName,
    dailyRate: p.dailyRate == null ? null : Number(p.dailyRate), active: p.active, syncedAt: p.syncedAt,
    updatedAt: p.updatedAt,
    localOnly: p.decargoId.startsWith('local-user:') || p.decargoId.startsWith('manual-'),
  }));
  return [...fromUsers, ...fromProviders].sort((a, b) => a.name.localeCompare(b.name));
}
