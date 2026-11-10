import type { DashboardSummary } from '@workspace/api-client-react';
import { z } from 'zod';

// Mirrors DashboardSummary in OpenAPI. Financial totals are optional/nullable
// (including for roles without financial access); counts must always be present.
const count = z.number().finite().int().nonnegative();
const total = z.number().finite().nullable().optional();
const dashboardSummarySchema: z.ZodType<DashboardSummary> = z.object({
  pendentes: count,
  emAnalise: count,
  aprovadas: count,
  rejeitadas: count,
  disponivelExportacao: count,
  exportadas: count,
  pagas: count,
  canceladas: count,
  totalValorAprovadas: total,
  totalValorExportadas: total,
  totalValorPagas: total,
});

// The generic HTTP transport only parses JSON, not its runtime shape.
// A stable query selector turns malformed successful responses (also null/204)
// into query errors before any dashboard values are presented.
export function parseDashboardSummary(value: unknown): DashboardSummary {
  return dashboardSummarySchema.parse(value);
}
