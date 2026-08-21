/**
 * Shared WHERE-clause builder for the diárias list/summary/ids endpoints.
 *
 * Exported as a standalone module so it can be unit-tested independently of
 * the Express router that uses it.
 */

export interface AnaliseFilterQuery {
  name?: string;
  providerId?: string;
  teamId?: string;
  managerId?: string;
  startDate?: string;
  endDate?: string;
  minValue?: string;
  maxValue?: string;
  value?: string;
  status?: string;
  /** 'sim' → só com data de pagamento; 'nao' → só sem data de pagamento */
  hasPaymentDate?: string;
}

export interface BuildDiariaFiltersOpts {
  includeStatus?: boolean;
  /**
   * Pre-fetched list of team IDs the gestor manages.
   * Required when me.role === "gestor"; must be called by the route handler
   * (avoids a redundant DB round-trip when the caller already has them).
   */
  gestorTeamIds?: number[];
}

/**
 * Builds the shared WHERE clause + params array for the diárias queries.
 * Applies role-based scoping first, then optional caller-supplied filters.
 *
 * `gestorTeamIds` replaces the old `me.teamId` single-team check, enabling
 * a gestor to manage multiple teams simultaneously.
 *
 * When a gestor has no teams (`gestorTeamIds` is empty), the function
 * emits the always-false condition `1=0` so the query returns zero rows
 * rather than an unconstrained full-table scan.
 */
export function buildDiariaFilters(
  me: { id: number; role: string; teamId: number | null; decargoId: string },
  query: AnaliseFilterQuery,
  opts: BuildDiariaFiltersOpts = {},
): { where: string; params: unknown[] } {
  const { includeStatus = true, gestorTeamIds } = opts;
  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  if (me.role === "gestor") {
    const teamIds = gestorTeamIds ?? [];
    if (teamIds.length === 0) {
      // Gestor has no teams assigned → must see nothing; safer than unconstrained.
      conditions.push("1=0");
    } else {
      conditions.push(`d.team_id = ANY($${p++}::int[])`);
      params.push(teamIds);
    }
  } else if (me.role !== "admin") {
    // prestador / funcionário: only their own records via decargoId
    conditions.push(`p.decargo_id = $${p++}`);
    params.push(me.decargoId);
  }

  if (includeStatus) {
    if (query.status) {
      conditions.push(`d.status = $${p++}`);
      params.push(query.status);
    } else {
      // Por padrão, diárias canceladas não aparecem em nenhuma listagem.
      // Para vê-las, passe explicitamente status=cancelada.
      conditions.push(`d.status != 'cancelada'`);
    }
  }
  if (query.providerId) {
    conditions.push(`d.provider_id = $${p++}`);
    params.push(Number(query.providerId));
  }
  if (query.teamId && me.role === "admin") {
    conditions.push(`d.team_id = $${p++}`);
    params.push(Number(query.teamId));
  }
  if (query.managerId) {
    conditions.push(`d.manager_id = $${p++}`);
    params.push(Number(query.managerId));
  }
  if (query.startDate) {
    conditions.push(`d.work_date >= $${p++}`);
    params.push(query.startDate);
  }
  if (query.endDate) {
    conditions.push(`d.work_date <= $${p++}`);
    params.push(query.endDate);
  }
  if (query.name) {
    conditions.push(`p.name ILIKE $${p++}`);
    params.push(`%${query.name}%`);
  }
  if (query.value) {
    conditions.push(`d.value = $${p++}`);
    params.push(Number(query.value));
  } else {
    if (query.minValue) {
      conditions.push(`d.value >= $${p++}`);
      params.push(Number(query.minValue));
    }
    if (query.maxValue) {
      conditions.push(`d.value <= $${p++}`);
      params.push(Number(query.maxValue));
    }
  }
  if (query.hasPaymentDate === "sim") {
    conditions.push(`d.payment_date IS NOT NULL`);
  } else if (query.hasPaymentDate === "nao") {
    conditions.push(`d.payment_date IS NULL`);
  }

  return { where: conditions.join(" AND "), params };
}
