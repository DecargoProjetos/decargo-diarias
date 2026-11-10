import type { PeopleExportCapabilities as Capabilities } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';

export interface PeopleExportSupport {
  data?: Capabilities;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => unknown;
}

export function canConfirmPeopleExport(query: PeopleExportSupport): boolean {
  return !query.isPending && !query.isFetching && !query.isError &&
    !!query.data?.supportedTargets.length;
}

export default function PeopleExportCapabilities({ query }: { query: PeopleExportSupport }) {
  if (query.isPending || query.isFetching) {
    return <div role="status" className="rounded-md border p-3 text-sm">Consultando destinos financeiros do DECARGO People...</div>;
  }
  if (query.isError || !query.data) {
    return (
      <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm space-y-2">
        <p>Não foi possível consultar os destinos do DECARGO People. Isso é uma falha de acesso ou de resposta, não uma indicação de falta de suporte.</p>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button>
      </div>
    );
  }
  const extras = query.data.supportedTargets.includes('diarias');
  const faltas = query.data.supportedTargets.includes('descontos');
  return (
    <section aria-label="Destinos financeiros do DECARGO People" className="rounded-md border p-3 text-sm space-y-1">
      <p className="font-medium">Destinos financeiros do DECARGO People</p>
      <p>Diárias extras → Diárias: {extras ? 'disponível' : 'não suportado nesta integração'}.</p>
      <p>Faltas → Descontos: {faltas ? 'disponível' : 'não suportado nesta integração'}.</p>
      {!extras || !faltas ? <p className="text-amber-700">Lotes que incluam um destino não suportado, inclusive lotes mistos, não serão enviados. Selecione somente tipos suportados.</p> : null}
      <p className="text-muted-foreground">O servidor verificará novamente os destinos ao confirmar. Esta consulta não envia valores nem altera reservas anteriores.</p>
    </section>
  );
}
