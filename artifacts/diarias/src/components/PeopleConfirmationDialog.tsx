import { useState } from 'react';
import { getListAuditLogsQueryKey, useListAuditLogs } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PeopleConfirmationDetails } from './PeopleConfirmationDetails';

export function PeopleConfirmationDialog({ providerId, name, onClose }: {
  providerId: number; name: string; onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const params = { entityType: 'provider', entityId: providerId, action: 'identidade People reconciliada', page, pageSize: 10 };
  const { data, isLoading, isError, refetch } = useListAuditLogs(params, {
    query: { queryKey: getListAuditLogsQueryKey(params), staleTime: 0 },
  });
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmação do vínculo People</DialogTitle>
          <DialogDescription>{name} — cadastro de diárias #{providerId}. Consulta somente leitura.</DialogDescription>
        </DialogHeader>
        {isLoading ? <p>Carregando confirmações...</p> : isError ? (
          <div role="alert" className="space-y-2">
            <p>Não foi possível consultar a auditoria. Tente novamente.</p>
            <Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
          </div>
        ) : !data?.data.length ? (
          <p className="text-muted-foreground">Não há evidência registrada de confirmação deste vínculo People. Vínculos antigos podem não possuir auditoria de confirmação; nenhum responsável ou documento pode ser presumido.</p>
        ) : (
          <div className="space-y-5">
            {data.data.map(log => <div key={log.id} className="border rounded-md p-4"><PeopleConfirmationDetails log={log} /></div>)}
            {data.totalPages > 1 && <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <span className="text-xs">Página {page} de {data.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
