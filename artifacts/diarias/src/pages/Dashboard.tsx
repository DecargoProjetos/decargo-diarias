import { useGetDashboardSummary, useGetRecentActivity, useGetMe } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDateTime, statusColors, statusLabels } from '@/lib/utils';
import { Activity, AlertCircle, CheckCircle2, Clock, DollarSign, FileDown } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const { data: user } = useGetMe();
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity();

  if (isLoadingSummary || isLoadingActivity) return <div>Carregando dashboard...</div>;

  const showFinancials = user?.role !== 'prestador';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visão geral do controle de diárias.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.pendentes || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Aguardando aprovação</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aprovadas</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.aprovadas || 0}</div>
              {showFinancials && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">
                  {formatCurrency(summary?.totalValorAprovadas)}
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Exportadas</CardTitle>
              <FileDown className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.exportadas || 0}</div>
              {showFinancials && (
                <p className="text-xs text-indigo-600 mt-1 font-medium">
                  {formatCurrency(summary?.totalValorExportadas)}
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pagas</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.pagas || 0}</div>
              {showFinancials && (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  {formatCurrency(summary?.totalValorPagas)}
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Atenção Necessária</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 bg-red-50 p-4 rounded-md border border-red-100">
                <AlertCircle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="font-semibold text-red-900">{summary?.rejeitadas || 0} Diárias Rejeitadas</p>
                  <p className="text-sm text-red-700">Requerem ajuste ou cancelamento.</p>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-teal-50 p-4 rounded-md border border-teal-100">
                <FileDown className="h-8 w-8 text-teal-500" />
                <div>
                  <p className="font-semibold text-teal-900">{summary?.disponivelExportacao || 0} Disponíveis p/ Exportação</p>
                  <p className="text-sm text-teal-700">Aprovadas prontas para o ERP financeiro.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Atividade Recente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity?.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma atividade recente.</p>
              ) : (
                activity?.slice(0, 5).map((item, idx) => (
                  <div key={item.id} className="flex items-start gap-4">
                    <div className="bg-muted p-2 rounded-full">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        Diária #{item.diariaId} - {item.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Por {item.userName} em {formatDateTime(item.timestamp)}
                      </p>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-full border font-medium ${statusColors[item.status] || ''}`}>
                      {statusLabels[item.status] || item.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
