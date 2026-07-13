import { useMemo } from 'react';
import { useGetMe, useListUsers, useListProviders, useSyncUsers, useSyncProviders } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

// Unified "Pessoas" view — funcionários (users) e prestadores estão ambos
// vinculados a equipes e prestadores se reportam a funcionários, então
// fazem sentido numa única lista com uma coluna de Tipo.
type PersonRow = {
  key: string;
  tipo: 'Funcionário' | 'Prestador';
  decargoId: string;
  name: string;
  email: string | null | undefined;
  teamName: string | null | undefined;
  active: boolean;
  syncedAt: string | null | undefined;
};

export default function PeopleList() {
  const { data: currentUser } = useGetMe();
  const isAdmin = currentUser?.role === 'admin';

  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useListUsers({ query: { enabled: isAdmin } });
  const { data: providers, isLoading: providersLoading, refetch: refetchProviders } = useListProviders();

  const syncUsers = useSyncUsers();
  const syncProviders = useSyncProviders();
  const { toast } = useToast();

  if (!isAdmin) {
    return <div>Acesso negado. Apenas administradores.</div>;
  }

  const rows = useMemo<PersonRow[]>(() => {
    const fromUsers: PersonRow[] = (users ?? []).map(u => ({
      key: `user-${u.id}`,
      tipo: 'Funcionário',
      decargoId: u.decargoId,
      name: u.name,
      email: u.email,
      teamName: u.teamName,
      active: u.active,
      syncedAt: null,
    }));
    const fromProviders: PersonRow[] = (providers ?? []).map(p => ({
      key: `provider-${p.id}`,
      tipo: 'Prestador',
      decargoId: p.decargoId,
      name: p.name,
      email: p.email,
      teamName: p.teamName,
      active: p.active,
      syncedAt: p.syncedAt,
    }));
    return [...fromUsers, ...fromProviders].sort((a, b) => a.name.localeCompare(b.name));
  }, [users, providers]);

  const isLoading = usersLoading || providersLoading;

  const handleSync = () => {
    Promise.allSettled([
      new Promise((resolve, reject) => syncUsers.mutate(undefined, { onSuccess: resolve, onError: reject })),
      new Promise((resolve, reject) => syncProviders.mutate(undefined, { onSuccess: resolve, onError: reject })),
    ]).then(([usersResult, providersResult]) => {
      const failures = [usersResult, providersResult].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );
      if (failures.length === 0) {
        toast({ title: 'Sincronização concluída', description: 'Funcionários e prestadores atualizados a partir do DECARGO People.' });
      } else {
        const details = failures.map(f => f.reason?.message).filter(Boolean).join(' | ');
        toast({
          title: failures.length === 2 ? 'Erro na sincronização' : 'Sincronização parcial',
          description: details || 'Não foi possível sincronizar com o DECARGO People.',
          variant: 'destructive',
        });
      }
      refetchUsers();
      refetchProviders();
    });
  };

  const isSyncing = syncUsers.isPending || syncProviders.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Pessoas</h1>
          <p className="text-muted-foreground mt-1">Funcionários e prestadores sincronizados com DECARGO People.</p>
        </div>
        <Button onClick={handleSync} disabled={isSyncing} className="bg-indigo-600 hover:bg-indigo-700">
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          Sincronizar com DECARGO People
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>DECARGO ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Última Sincronização</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">Carregando...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                    Nenhuma pessoa sincronizada ainda. Clique em "Sincronizar com DECARGO People".
                  </TableCell>
                </TableRow>
              ) : rows.map(row => (
                <TableRow key={row.key} className={!row.active ? 'opacity-60' : ''}>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.tipo === 'Funcionário' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {row.tipo}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.decargoId}</TableCell>
                  <TableCell className="font-medium">
                    {row.name}
                    {row.email && <div className="text-xs text-muted-foreground font-normal">{row.email}</div>}
                  </TableCell>
                  <TableCell>{row.teamName || '-'}</TableCell>
                  <TableCell>
                    {row.active ? (
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
                    {row.syncedAt ? formatDateTime(row.syncedAt) : '-'}
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
