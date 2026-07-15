import { useMemo, useState } from 'react';
import { useGetMe, useListDiarias } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate, statusColors, statusLabels } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Tela somente leitura para o gestor consultar as diárias da própria
// equipe — sem nenhuma ação de criação, edição, exclusão ou aprovação.
// O backend já escopa a lista por team_id para o papel "gestor" (mesma
// rota GET /api/diarias usada pelo calendário), então basta reutilizá-la
// aqui sem expor nenhum controle de escrita.
export default function DiariasEquipe() {
  const { data: user } = useGetMe();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', status: '' });

  const queryFilters = useMemo(() => ({
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    status: (filters.status || undefined) as any,
  }), [filters]);

  const { data: result, isLoading } = useListDiarias(
    { ...queryFilters, page, pageSize: 20 },
    { query: { enabled: user?.role === 'gestor', queryKey: ['listDiariasEquipe', queryFilters, page] } },
  );

  if (user && user.role !== 'gestor') {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <h1 className="text-xl font-bold mb-2">Acesso restrito</h1>
        <p className="text-muted-foreground">Esta tela é exclusiva para gestores.</p>
      </div>
    );
  }

  const rows = result?.data ?? [];
  const totalPages = result?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Diárias da Equipe</h1>
        <p className="text-muted-foreground mt-1">
          Consulta somente leitura das diárias lançadas pela sua equipe. Correções são feitas por um administrador.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end bg-muted/20">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Data Inicial</label>
            <Input type="date" className="h-9 w-40" value={filters.startDate} onChange={e => { setPage(1); setFilters({ ...filters, startDate: e.target.value }); }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Data Final</label>
            <Input type="date" className="h-9 w-40" value={filters.endDate} onChange={e => { setPage(1); setFilters({ ...filters, endDate: e.target.value }); }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Status</label>
            <select
              className="flex h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={filters.status}
              onChange={e => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}
            >
              <option value="">Todos os status</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Diárias ({result?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">Carregando...</div>
          ) : rows.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">Nenhuma diária encontrada.</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prestador</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Horário</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criada por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.providerName}</TableCell>
                      <TableCell>{formatDate(d.workDate)}</TableCell>
                      <TableCell>
                        {d.startTime && d.endTime
                          ? `${d.startTime.slice(0, 5)} – ${d.endTime.slice(0, 5)}`
                          : '-'}
                      </TableCell>
                      <TableCell>{formatCurrency(d.value)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColors[d.status]}`}>
                          {statusLabels[d.status]}
                        </span>
                      </TableCell>
                      <TableCell>{d.createdByName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Próxima <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
