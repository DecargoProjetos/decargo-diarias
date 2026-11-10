import type { PeopleExportReview } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import PeopleExportCapabilities, { type PeopleExportSupport } from './PeopleExportCapabilities';
import { formatDate } from '@/lib/utils';

export interface BatchReviewQuery extends Omit<PeopleExportSupport, 'data'> {
  data?: PeopleExportReview;
}

export function canConfirmReviewedBatch(query: BatchReviewQuery, count: number): boolean {
  return count > 0 && !query.isPending && !query.isFetching && !query.isError &&
    query.data?.reviewedCount === count &&
    query.data.incompatibleRecords.length === 0 && query.data.missingIds.length === 0;
}

export default function PeopleExportBatchReview({ query, count }: { query: BatchReviewQuery; count: number }) {
  if (!count) return <p role="status" className="text-sm">Nenhum registro selecionado para exportação.</p>;
  if (query.isPending || query.isFetching) {
    return <p role="status" className="text-sm">Revisando os {count} registros do lote, incluindo outras páginas...</p>;
  }
  if (query.isError || !query.data || query.data.reviewedCount !== count) {
    return (
      <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm space-y-2">
        <p>Não foi possível revisar o lote. Isso não indica falta de suporte no People. A confirmação fica bloqueada até a revisão concluir.</p>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button>
      </div>
    );
  }
  const { incompatibleRecords, missingIds } = query.data;
  return (
    <section aria-label="Revisão do lote" className="space-y-3 text-sm">
      <PeopleExportCapabilities query={query} />
      <p>{count} registro(s) revisado(s), incluindo seleções de outras páginas.</p>
      {incompatibleRecords.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-400 p-3 space-y-2">
          <p className="font-medium">{incompatibleRecords.length} registro(s) incompatível(is) bloqueiam este lote:</p>
          <ul className="max-h-52 overflow-y-auto space-y-2" aria-label="Registros incompatíveis">
            {incompatibleRecords.map(record => (
              <li key={record.id}>
                <strong>#{record.id} — {record.providerName}</strong> · {formatDate(record.workDate)}
                <br />
                Tipo: {record.typeName ?? 'Não definido'} · {record.requiredTarget
                  ? `Destino ${record.requiredTarget === 'diarias' ? 'Diárias' : 'Descontos'} não suportado`
                  : 'Destino não configurado para este tipo'}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missingIds.length > 0 && <p role="alert">Registros não encontrados: {missingIds.map(id => `#${id}`).join(', ')}. Revise a seleção antes de confirmar.</p>}
      {incompatibleRecords.length === 0 && missingIds.length === 0 && <p>Todos os tipos selecionados têm destinos suportados.</p>}
      <p className="text-muted-foreground">Nenhum registro foi removido da seleção. Para ajustar o lote, cancele e revise os registros. Esta revisão não consulta pessoas no People nem altera reservas anteriores.</p>
    </section>
  );
}
