import { useState } from 'react';
import { useListDiarias, ListDiariasStatus, useGetMe } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate, statusColors, statusLabels } from '@/lib/utils';
import { Link } from 'wouter';
import { Plus, Search, Filter } from 'lucide-react';

export default function DiariasList() {
  const { data: user } = useGetMe();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ListDiariasStatus | ''>('');
  
  const { data: diariasData, isLoading } = useListDiarias({
    page,
    pageSize: 20,
    status: statusFilter === '' ? undefined : statusFilter,
  });

  const showFinancials = user?.role !== 'prestador';
  const canCreate = user?.role === 'admin' || user?.role === 'gestor';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Diárias</h1>
          <p className="text-muted-foreground mt-1">Gerencie os registros de prestadores.</p>
        </div>
        
        {canCreate && (
          <Link href="/diarias/nova" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 gap-2">
            <Plus size={16} /> Nova Diária
          </Link>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b flex flex-wrap gap-4 items-center bg-muted/20">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium">Filtros:</span>
            </div>
            <select 
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={statusFilter as string}
              onChange={(e) => {
                setStatusFilter(e.target.value as ListDiariasStatus | '');
                setPage(1);
              }}
            >
              <option value="">Todos os status</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Prestador</TableHead>
                  <TableHead>Equipe</TableHead>
                  {showFinancials && <TableHead className="text-right">Valor</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={showFinancials ? 7 : 6} className="h-14">
                        <div className="flex animate-pulse space-x-4">
                          <div className="h-4 bg-muted rounded w-full"></div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : diariasData?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showFinancials ? 7 : 6} className="h-32 text-center text-muted-foreground">
                      Nenhuma diária encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  diariasData?.data.map((diaria) => (
                    <TableRow key={diaria.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">#{diaria.id}</TableCell>
                      <TableCell>{formatDate(diaria.workDate)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{diaria.providerName}</div>
                      </TableCell>
                      <TableCell>{diaria.teamName}</TableCell>
                      {showFinancials && (
                        <TableCell className="text-right font-medium text-emerald-600">
                          {formatCurrency(diaria.value)}
                        </TableCell>
                      )}
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColors[diaria.status]}`}>
                          {statusLabels[diaria.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/diarias/${diaria.id}`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3">
                          Detalhes
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {diariasData && diariasData.totalPages > 1 && (
            <div className="p-4 border-t flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Página {diariasData.page} de {diariasData.totalPages} ({diariasData.total} registros)
              </span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= diariasData.totalPages}
                >
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
