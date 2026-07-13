import { useMemo, useState } from 'react';
import {
  useGetMe, useListUsers, useListProviders, useListTeams,
  useSyncUsers, useSyncProviders,
  useUpdateUser, useDeleteUser, useUpdateProvider, useDeleteProvider,
} from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, CheckCircle2, XCircle, Edit2, Trash2, Save, X } from 'lucide-react';

// Unified "Pessoas" view — funcionários (users) e prestadores estão ambos
// vinculados a equipes e prestadores se reportam a funcionários, então
// fazem sentido numa única lista com uma coluna de Tipo. Cada linha guarda
// seu id de origem (userId/providerId) para rotear edição/exclusão para o
// endpoint correto (/api/users/:id ou /api/providers/:id).
type PersonRow = {
  key: string;
  tipo: 'Funcionário' | 'Prestador';
  sourceId: number;
  decargoId: string;
  name: string;
  email: string | null | undefined;
  teamId: number | null | undefined;
  teamName: string | null | undefined;
  active: boolean;
  syncedAt: string | null | undefined;
};

export default function PeopleList() {
  const { data: currentUser } = useGetMe();
  const isAdmin = currentUser?.role === 'admin';

  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useListUsers({ query: { enabled: isAdmin } });
  const { data: providers, isLoading: providersLoading, refetch: refetchProviders } = useListProviders();
  const { data: teams } = useListTeams();

  const syncUsers = useSyncUsers();
  const syncProviders = useSyncProviders();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const updateProvider = useUpdateProvider();
  const deleteProvider = useDeleteProvider();
  const { toast } = useToast();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', teamId: '' });

  if (!isAdmin) {
    return <div>Acesso negado. Apenas administradores.</div>;
  }

  const rows = useMemo<PersonRow[]>(() => {
    const fromUsers: PersonRow[] = (users ?? []).map(u => ({
      key: `user-${u.id}`,
      tipo: 'Funcionário',
      sourceId: u.id,
      decargoId: u.decargoId,
      name: u.name,
      email: u.email,
      teamId: u.teamId,
      teamName: u.teamName,
      active: u.active,
      syncedAt: null,
    }));
    const fromProviders: PersonRow[] = (providers ?? []).map(p => ({
      key: `provider-${p.id}`,
      tipo: 'Prestador',
      sourceId: p.id,
      decargoId: p.decargoId,
      name: p.name,
      email: p.email,
      teamId: p.teamId,
      teamName: p.teamName,
      active: p.active,
      syncedAt: p.syncedAt,
    }));
    return [...fromUsers, ...fromProviders].sort((a, b) => a.name.localeCompare(b.name));
  }, [users, providers]);

  const refetchAll = () => {
    refetchUsers();
    refetchProviders();
  };

  const startEdit = (row: PersonRow) => {
    setEditingKey(row.key);
    setEditForm({ name: row.name, teamId: row.teamId?.toString() || '' });
  };

  const handleSaveEdit = (row: PersonRow) => {
    const teamId = editForm.teamId === '' ? null : Number(editForm.teamId);
    const onDone = () => {
      toast({ title: `${row.tipo} atualizado.` });
      setEditingKey(null);
      refetchAll();
    };
    const onFail = (err: any) => toast({ title: 'Erro ao atualizar', description: err?.message, variant: 'destructive' });

    if (row.tipo === 'Funcionário') {
      updateUser.mutate({ id: row.sourceId, data: { name: editForm.name, teamId } }, { onSuccess: onDone, onError: onFail });
    } else {
      updateProvider.mutate({ id: row.sourceId, data: { name: editForm.name, teamId } }, { onSuccess: onDone, onError: onFail });
    }
  };

  const handleToggleActive = (row: PersonRow) => {
    const onDone = () => {
      toast({ title: row.active ? `${row.tipo} desativado.` : `${row.tipo} ativado.` });
      refetchAll();
    };
    const onFail = (err: any) => toast({ title: 'Erro ao atualizar status', description: err?.message, variant: 'destructive' });

    if (row.tipo === 'Funcionário') {
      updateUser.mutate({ id: row.sourceId, data: { active: !row.active } }, { onSuccess: onDone, onError: onFail });
    } else {
      updateProvider.mutate({ id: row.sourceId, data: { active: !row.active } }, { onSuccess: onDone, onError: onFail });
    }
  };

  const handleDelete = (row: PersonRow) => {
    if (row.sourceId === currentUser?.id) return;
    if (!confirm(`Tem certeza que deseja excluir ${row.tipo === 'Funcionário' ? 'este funcionário' : 'este prestador'}? Esta ação não pode ser desfeita.`)) return;

    const onDone = () => {
      toast({ title: `${row.tipo} excluído.` });
      refetchAll();
    };
    const onFail = (err: any) => toast({ title: 'Erro ao excluir', description: err?.message, variant: 'destructive' });

    if (row.tipo === 'Funcionário') {
      deleteUser.mutate({ id: row.sourceId }, { onSuccess: onDone, onError: onFail });
    } else {
      deleteProvider.mutate({ id: row.sourceId }, { onSuccess: onDone, onError: onFail });
    }
  };

  const isLoading = usersLoading || providersLoading;

  const handleSync = () => {
    Promise.allSettled([
      new Promise<any>((resolve, reject) => syncUsers.mutate(undefined, { onSuccess: resolve, onError: reject })),
      new Promise<any>((resolve, reject) => syncProviders.mutate(undefined, { onSuccess: resolve, onError: reject })),
    ]).then(([usersResult, providersResult]) => {
      const failures = [usersResult, providersResult].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );
      if (failures.length === 0) {
        const newCount =
          (usersResult.status === 'fulfilled' ? usersResult.value?.created ?? 0 : 0) +
          (providersResult.status === 'fulfilled' ? providersResult.value?.created ?? 0 : 0);
        toast({
          title: 'Sincronização concluída',
          description: newCount > 0
            ? `${newCount} nova(s) pessoa(s) importada(s) do DECARGO People.`
            : 'Nenhuma pessoa nova encontrada no DECARGO People.',
        });
      } else {
        const details = failures.map(f => f.reason?.message).filter(Boolean).join(' | ');
        toast({
          title: failures.length === 2 ? 'Erro na sincronização' : 'Sincronização parcial',
          description: details || 'Não foi possível sincronizar com o DECARGO People.',
          variant: 'destructive',
        });
      }
      refetchAll();
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
                <TableHead>Última Sincronização</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24">Carregando...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                    Nenhuma pessoa sincronizada ainda. Clique em "Sincronizar com DECARGO People".
                  </TableCell>
                </TableRow>
              ) : rows.map(row => {
                const isEditing = editingKey === row.key;
                const isSelf = row.tipo === 'Funcionário' && row.sourceId === currentUser?.id;
                return (
                  <TableRow key={row.key} className={!row.active ? 'opacity-60' : ''}>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.tipo === 'Funcionário' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {row.tipo}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.decargoId}</TableCell>
                    <TableCell className="font-medium">
                      {isEditing ? (
                        <Input
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="h-8 max-w-xs"
                        />
                      ) : (
                        <>
                          {row.name}
                          {row.email && <div className="text-xs text-muted-foreground font-normal">{row.email}</div>}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <select
                          className="h-8 rounded border border-input bg-background px-2 text-sm shadow-sm w-40"
                          value={editForm.teamId}
                          onChange={e => setEditForm({ ...editForm, teamId: e.target.value })}
                        >
                          <option value="">Nenhuma / Todas</option>
                          {teams?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      ) : (
                        row.teamName || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleActive(row)}
                        disabled={isSelf}
                        className={`text-xs px-2 py-1 rounded border font-medium ${row.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                      >
                        {row.active ? (
                          <span className="inline-flex items-center"><CheckCircle2 size={14} className="mr-1" /> Ativo</span>
                        ) : (
                          <span className="inline-flex items-center"><XCircle size={14} className="mr-1" /> Inativo</span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.syncedAt ? formatDateTime(row.syncedAt) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => setEditingKey(null)}><X size={16} /></Button>
                            <Button size="icon" variant="ghost" onClick={() => handleSaveEdit(row)} disabled={!editForm.name}><Save size={16} /></Button>
                          </>
                        ) : (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => startEdit(row)}>
                              <Edit2 size={16} />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(row)}
                              disabled={isSelf}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
