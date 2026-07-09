import { useState } from 'react';
import { useGetMe, useListProviders, useSyncProviders } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

export default function ProvidersList() {
  const { data: user } = useGetMe();
  const { data: providers, isLoading, refetch } = useListProviders();
  const syncProviders = useSyncProviders();
  const { toast } = useToast();

  if (user?.role !== 'admin') {
    return <div>Acesso negado. Apenas administradores.</div>;
  }

  const handleSync = () => {
    syncProviders.mutate(undefined, {
      onSuccess: (result) => {
        toast({ 
          title: 'Sincronização concluída',
          description: `${result.synced} sincronizados, ${result.created} novos, ${result.updated} atualizados.`
        });
        refetch();
      },
      onError: () => toast({ title: 'Erro na sincronização', variant: 'destructive' })
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Prestadores</h1>
          <p className="text-muted-foreground mt-1">Sincronizados com DECARGO People.</p>
        </div>
        <Button onClick={handleSync} disabled={syncProviders.isPending} className="bg-indigo-600 hover:bg-indigo-700">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncProviders.isPending ? 'animate-spin' : ''}`} />
          Sincronizar com DECARGO People
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>DECARGO ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Equipe Atual</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Última Sincronização</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">Carregando...</TableCell>
                </TableRow>
              ) : providers?.map(provider => (
                <TableRow key={provider.id} className={!provider.active ? 'opacity-60' : ''}>
                  <TableCell>#{provider.id}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{provider.decargoId}</TableCell>
                  <TableCell className="font-medium">
                    {provider.name}
                    {provider.email && <div className="text-xs text-muted-foreground font-normal">{provider.email}</div>}
                  </TableCell>
                  <TableCell>{provider.teamName || '-'}</TableCell>
                  <TableCell>
                    {provider.active ? (
                      <span className="inline-flex items-center text-xs text-emerald-600 font-medium">
                        <CheckCircle2 size={14} className="mr-1" /> Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs text-red-600 font-medium">
                        <XCircle size={14} className="mr-1" /> Inativo
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {formatDateTime(provider.syncedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
