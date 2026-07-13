import { useState } from 'react';
import { useGetMe, useGetReportDiarias, useExportDiarias } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, statusLabels, statusColors } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FileDown, Filter } from 'lucide-react';

export default function Reports() {
  const { data: user } = useGetMe();
  const { toast } = useToast();
  
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    status: ''
  });

  const { data: report, isLoading } = useGetReportDiarias({
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    status: filters.status || undefined,
  });

  const exportMutation = useExportDiarias();

  if (user?.role === 'prestador' || user?.role === 'funcionario') {
    return <div>Acesso negado.</div>;
  }

  const handleExportERP = () => {
    if (!report?.data) return;
    const exportableIds = report.data
      .filter(d => d.status === 'disponivel_exportacao')
      .map(d => d.id);
      
    if (exportableIds.length === 0) {
      toast({ title: 'Nenhuma diária disponível para exportação.' });
      return;
    }

    exportMutation.mutate({ data: { diariaIds: exportableIds } }, {
      onSuccess: (res) => {
        toast({ 
          title: 'Exportação Concluída',
          description: `${res.exported} diárias enviadas ao ERP. Lote: ${res.integrationRef}`
        });
      }
    });
  };

  const chartData = report?.byTeam.map(t => ({
    name: t.teamName,
    Total: t.totalValor || 0,
    Quantidade: t.total
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Relatórios</h1>
          <p className="text-muted-foreground mt-1">Análise financeira e operacional.</p>
        </div>
        
        {user?.role === 'admin' && (
          <Button onClick={handleExportERP} disabled={exportMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            <FileDown className="w-4 h-4 mr-2" />
            Exportar Disponíveis para ERP
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end bg-muted/20">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Data Inicial</label>
            <Input type="date" className="h-9 w-40" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Data Final</label>
            <Input type="date" className="h-9 w-40" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Status</label>
            <select className="flex h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
              <option value="">Todos os status</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">Carregando relatórios...</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Resumo do Período</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Valor Total</p>
                  <p className="text-3xl font-bold text-primary">{formatCurrency(report?.totalValor)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total de Diárias</p>
                  <p className="text-2xl font-bold">{report?.totalRecords}</p>
                </div>
                
                <div className="pt-4 border-t space-y-3">
                  <p className="font-medium text-sm">Por Status</p>
                  {Object.entries(report?.byStatus || {}).map(([status, count]) => (
                    <div key={status} className="flex justify-between items-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[status]}`}>
                        {statusLabels[status]}
                      </span>
                      <span className="font-medium text-sm">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Custos por Equipe</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full mt-4">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(val) => `R$ ${val}`} axisLine={false} tickLine={false} />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        cursor={{fill: 'transparent'}}
                      />
                      <Bar dataKey="Total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Sem dados para exibir
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
