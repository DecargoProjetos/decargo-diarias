import { useState } from 'react';
import { useGetMe, useListAuditLogs } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';

export default function AuditLogs() {
  const { data: user } = useGetMe();
  const [page, setPage] = useState(1);
  
  const { data: audit, isLoading } = useListAuditLogs({
    page,
    pageSize: 30
  });

  if (user?.role !== 'admin') {
    return <div>Acesso negado. Apenas administradores.</div>;
  }

  const formatAction = (action: string) => {
    switch (action) {
      case 'CREATE': return <span className="text-emerald-600 font-medium">CRIAÇÃO</span>;
      case 'UPDATE': return <span className="text-blue-600 font-medium">ATUALIZAÇÃO</span>;
      case 'DELETE': return <span className="text-red-600 font-medium">EXCLUSÃO</span>;
      case 'APPROVE': return <span className="text-emerald-700 font-bold">APROVAÇÃO</span>;
      case 'REJECT': return <span className="text-red-700 font-bold">REJEIÇÃO</span>;
      case 'EXPORT': return <span className="text-indigo-600 font-bold">EXPORTAÇÃO</span>;
      case 'SYNC': return <span className="text-purple-600 font-medium">SINCRONIZAÇÃO</span>;
      default: return action;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Trilha de Auditoria</h1>
        <p className="text-muted-foreground mt-1">Registro imutável de todas as ações no sistema.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Data/Hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Entidade</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-24">Carregando...</TableCell></TableRow>
                ) : audit?.data.map(log => (
                  <TableRow key={log.id} className="text-xs font-mono">
                    <TableCell className="text-muted-foreground">{formatDateTime(log.timestamp)}</TableCell>
                    <TableCell>{log.userName || 'Sistema'}</TableCell>
                    <TableCell>{formatAction(log.action)}</TableCell>
                    <TableCell>{log.entityType} #{log.entityId}</TableCell>
                    <TableCell className="max-w-md truncate">
                      {log.newValues ? (
                        <div className="truncate" title={log.newValues}>
                          {log.newValues}
                        </div>
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {audit && audit.totalPages > 1 && (
            <div className="p-4 border-t flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Página {audit.page} de {audit.totalPages} ({audit.total} registros)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= audit.totalPages}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
