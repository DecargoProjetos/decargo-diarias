import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListExportAttempts, getListExportAttemptsQueryKey,
  useGetExportAttempt, getGetExportAttemptQueryKey, type ExportAttempt,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const labels = { running: 'Em andamento', completed: 'Concluída', interrupted: 'Interrompida / conferir resultado' };

function Attempt({ attempt }: { attempt: ExportAttempt }) {
  const groups = [
    ['Confirmados', attempt.confirmed], ['Rejeitados', attempt.rejected],
    ['Incertos / aguardando confirmação', attempt.uncertain], ['Não enviados', attempt.unsent],
  ] as const;
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <strong className="break-all">{attempt.integrationRef}</strong>
        <span>{labels[attempt.status]}</span>
        <span>{new Date(attempt.createdAt).toLocaleString('pt-BR')}</span>
      </div>
      <p className="text-sm" role="status">
        {attempt.confirmed.length + attempt.rejected.length} de {attempt.total} registros com resposta confirmada.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {groups.map(([label, ids]) => <span key={label}>{label}: <strong>{ids.length}</strong></span>)}
      </div>
      {attempt.message && <p className="text-sm text-amber-700 dark:text-amber-400">{attempt.message}</p>}
      <details className="text-sm">
        <summary className="cursor-pointer">Consultar registros e validações</summary>
        <div className="space-y-2 mt-2 max-h-64 overflow-auto break-words">
          {groups.map(([label, ids]) => <p key={label}><strong>{label}:</strong> {ids.length ? ids.map(id => `#${id}`).join(', ') : 'Nenhum'}</p>)}
          {attempt.skipped.map(item => <p key={item.id}>#{item.id}: {item.reason}</p>)}
        </div>
      </details>
    </div>
  );
}

export default function ExportAttemptsPanel({ enabled }: { enabled: boolean }) {
  const client = useQueryClient();
  const [input, setInput] = useState('');
  const [reference, setReference] = useState('');
  const lastProgress = useRef('');
  const attempts = useListExportAttempts({
    query: {
      queryKey: getListExportAttemptsQueryKey(), enabled,
      refetchInterval: 5000, refetchOnMount: 'always',
    },
  });
  const detail = useGetExportAttempt(reference, {
    query: {
      queryKey: getGetExportAttemptQueryKey(reference), enabled: enabled && !!reference,
      refetchInterval: 5000, retry: false,
    },
  });
  // Financial data can change after the original POST's browser connection
  // disappears. Polling must refresh the visible lists and indicators too.
  useEffect(() => {
    if (!attempts.dataUpdatedAt || !attempts.data?.length) return;
    const signature = attempts.data.map(attempt => `${attempt.integrationRef}:${attempt.updatedAt}:${attempt.status}`).join('|');
    if (signature === lastProgress.current) return;
    lastProgress.current = signature;
    void client.invalidateQueries({
      predicate: query => {
        const path = String(query.queryKey[0]);
        return path.startsWith('/api/diarias') && !path.startsWith('/api/diarias/export/attempts')
          || path.startsWith('/api/reports');
      },
    });
  }, [attempts.dataUpdatedAt, client]);
  if (!enabled) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Acompanhamento de exportações</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          O envio continua se a conexão da tela cair. Ao reabrir, consulte a tentativa antes de exportar novamente.
          Registros incertos não são reenviados automaticamente e exigem conferência no People.
        </p>
        <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setReference(input.trim()); }}>
          <Input className="flex-1 min-w-40" aria-label="Referência da exportação" placeholder="EXP-…" value={input} onChange={e => setInput(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!input.trim()}>Consultar referência</Button>
          <Button type="button" variant="outline" onClick={() => { void attempts.refetch(); if (reference) void detail.refetch(); }}>Atualizar</Button>
        </form>
        {(attempts.isError || (reference && detail.isError)) && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível consultar o resultado atual. A referência pode não existir ou a conexão pode estar indisponível.
            Não reenvie um lote incerto. Use Atualizar para tentar a consulta novamente.
          </p>
        )}
        {attempts.isLoading && <p className="text-sm">Consultando tentativas…</p>}
        {reference && detail.isLoading && <p className="text-sm">Consultando referência…</p>}
        {reference && detail.data && !detail.isError && <Attempt attempt={detail.data} />}
        {!attempts.isError && attempts.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tentativa registrada.</p>}
        {!attempts.isError && attempts.data?.[0] && attempts.data[0].integrationRef !== reference && <Attempt attempt={attempts.data[0]} />}
        {!attempts.isError && (attempts.data?.length ?? 0) > 1 && (
          <details className="text-sm">
            <summary className="cursor-pointer">Tentativas anteriores</summary>
            <div className="space-y-2 mt-2 max-h-96 overflow-auto">
              {attempts.data?.slice(1).filter(a => a.integrationRef !== reference).map(attempt => <Attempt key={attempt.integrationRef} attempt={attempt} />)}
            </div>
          </details>
        )}
        <p className="text-xs text-muted-foreground">Últimas 20 tentativas. Para tentativas anteriores, informe a referência. As consultas não enviam registros ao People.</p>
      </CardContent>
    </Card>
  );
}
