import { useState } from 'react';
import { useGetMe, useListUsers, useUpdateUser, useListTeams, useSyncUsers } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

export default function UsersList() {
  const { data: currentUser } = useGetMe();
  const { data: users, isLoading, refetch } = useListUsers({ query: { enabled: currentUser?.role === 'admin' } });
  const { data: teams } = useListTeams();
  const updateUser = useUpdateUser();
  const syncUsers = useSyncUsers();
  const { toast } = useToast();

  if (currentUser?.role !== 'admin') {
    return <div>Acesso negado.</div>;
  }

  const handleRoleChange = (id: number, newRole: any) => {
    updateUser.mutate({ id, data: { role: newRole } }, {
      onSuccess: () => {
        toast({ title: 'Papel atualizado.' });
        refetch();
      }
    });
  };

  const handleTeamChange = (id: number, newTeamId: string) => {
    const teamId = newTeamId === '' ? null : Number(newTeamId);
    updateUser.mutate({ id, data: { teamId } }, {
      onSuccess: () => {
        toast({ title: 'Equipe atualizada.' });
        refetch();
      }
    });
  };

  const handleStatusChange = (id: number, active: boolean) => {
    updateUser.mutate({ id, data: { active } }, {
      onSuccess: () => {
        toast({ title: active ? 'Usuário ativado.' : 'Usuário desativado.' });
        refetch();
      }
    });
  };

  const handleSync = () => {
    syncUsers.mutate(undefined, {
      onSuccess: (result) => {
        toast({
          title: 'Sincronização concluída',
          description: `${result.synced} funcionários processados — ${result.created} novos, ${result.updated} atualizados${result.skipped ? `, ${result.skipped} ignorados` : ''}.`,
        });
        refetch();
      },
      onError: () => toast({ title: 'Erro na sincronização', variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Usuários</h1>
          <p className="text-muted-foreground mt-1">Gerencie os acessos ao sistema.</p>
        </div>
        <Button onClick={handleSync} disabled={syncUsers.isPending} className="bg-indigo-600 hover:bg-indigo-700">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncUsers.isPending ? 'animate-spin' : ''}`} />
          Sincronizar com DECARGO People
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Equipe Alocada</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acesso Desde</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center h-24">Carregando...</TableCell></TableRow>
              ) : users?.map(user => (
                <TableRow key={user.id} className={!user.active ? 'opacity-50' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <select 
                      className="h-8 rounded border border-input bg-background px-2 text-sm shadow-sm"
                      value={user.role}
                      onChange={e => handleRoleChange(user.id, e.target.value)}
                      disabled={user.id === currentUser.id}
                    >
                      <option value="admin">Administrador</option>
                      <option value="gestor">Gestor</option>
                      <option value="prestador">Prestador</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <select 
                      className="h-8 rounded border border-input bg-background px-2 text-sm shadow-sm w-48"
                      value={user.teamId?.toString() || ''}
                      onChange={e => handleTeamChange(user.id, e.target.value)}
                      disabled={user.role === 'admin'}
                    >
                      <option value="">Nenhuma / Todas</option>
                      {teams?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </TableCell>
                  <TableCell>
                    <button 
                      onClick={() => handleStatusChange(user.id, !user.active)}
                      disabled={user.id === currentUser.id}
                      className={`text-xs px-2 py-1 rounded border font-medium ${user.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                    >
                      {user.active ? 'Ativo' : 'Inativo'}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(user.createdAt)}
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
