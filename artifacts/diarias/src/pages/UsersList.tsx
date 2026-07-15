import { useMemo, useState } from 'react';
import { useGetMe, useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useSyncUsers, useListTeams } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Edit2, Trash2, Save, X, UserPlus } from 'lucide-react';

const EMPTY_NEW_USER = { name: '', email: '', role: 'prestador' };

// Normaliza para comparar nomes ignorando acentos/caixa, já que a pesquisa
// deve casar "Edu" com "Eduarda", "Eduardo" etc. em qualquer posição do nome.
const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function UsersList() {
  const { data: currentUser } = useGetMe();
  const { data: users, isLoading, refetch } = useListUsers({ query: { enabled: currentUser?.role === 'admin' } });
  const { data: teams } = useListTeams({ query: { enabled: currentUser?.role === 'admin', queryKey: ['listTeams'] } });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const syncUsers = useSyncUsers();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '' });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);

  const [searchName, setSearchName] = useState('');
  const [filterRole, setFilterRole] = useState<'todos' | string>('todos');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'ativo' | 'inativo'>('todos');

  if (currentUser?.role !== 'admin') {
    return <div>Acesso negado.</div>;
  }

  const filteredUsers = useMemo(() => {
    const normalizedSearch = normalize(searchName.trim());
    return (users ?? []).filter(user => {
      if (filterRole !== 'todos' && user.role !== filterRole) return false;
      if (filterStatus === 'ativo' && !user.active) return false;
      if (filterStatus === 'inativo' && user.active) return false;
      if (normalizedSearch && !normalize(user.name).includes(normalizedSearch)) return false;
      return true;
    });
  }, [users, searchName, filterRole, filterStatus]);

  const handleRoleChange = (id: number, newRole: any) => {
    updateUser.mutate({ id, data: { role: newRole } }, {
      onSuccess: () => {
        toast({ title: 'Papel atualizado.' });
        refetch();
      }
    });
  };

  const handleTeamChange = (id: number, newTeamId: string) => {
    updateUser.mutate({ id, data: { teamId: newTeamId ? Number(newTeamId) : null } }, {
      onSuccess: () => {
        toast({ title: 'Equipe atualizada.' });
        refetch();
      },
      onError: (err: any) => toast({ title: 'Erro ao atualizar equipe', description: err?.message, variant: 'destructive' }),
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

  const startEdit = (user: any) => {
    setEditingId(user.id);
    setEditForm({ name: user.name, email: user.email });
  };

  const handleSaveEdit = (id: number) => {
    updateUser.mutate({ id, data: { name: editForm.name, email: editForm.email } }, {
      onSuccess: () => {
        toast({ title: 'Usuário atualizado.' });
        setEditingId(null);
        refetch();
      },
      onError: (err: any) => toast({ title: 'Erro ao atualizar', description: err?.message, variant: 'destructive' }),
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.')) return;
    deleteUser.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Usuário excluído.' });
        refetch();
      },
      onError: (err: any) => toast({ title: 'Erro ao excluir', description: err?.message, variant: 'destructive' }),
    });
  };

  const handleCreateUser = () => {
    if (!newUser.name || !newUser.email || !newUser.role) return;
    createUser.mutate(
      {
        data: {
          name: newUser.name,
          email: newUser.email,
          role: newUser.role as any,
        },
      },
      {
        // O backend faz upsert por e-mail: se já existir alguém com este
        // e-mail, os dados dessa pessoa são atualizados em vez de criar uma
        // duplicata — por isso a mensagem cobre os dois casos.
        onSuccess: () => {
          toast({ title: 'Usuário salvo com sucesso.', description: 'Se o e-mail já existia, os dados foram atualizados em vez de duplicar.' });
          setIsCreateOpen(false);
          setNewUser(EMPTY_NEW_USER);
          refetch();
        },
        onError: (err: any) => toast({ title: 'Erro ao criar usuário', description: err?.message, variant: 'destructive' }),
      }
    );
  };

  const handleSync = () => {
    syncUsers.mutate(undefined, {
      onSuccess: (result) => {
        toast({
          title: 'Sincronização concluída',
          description: `${result.synced} funcionários processados — ${result.created} novos${result.skipped ? `, ${result.skipped} já existentes (ignorados)` : ''}.`,
        });
        refetch();
      },
      onError: (err: any) => toast({ title: 'Erro na sincronização', description: err?.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Usuários</h1>
          <p className="text-muted-foreground mt-1">Gerencie os acessos ao sistema.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setNewUser(EMPTY_NEW_USER); setIsCreateOpen(true); }}>
            <UserPlus className="w-4 h-4 mr-2" />
            Novo usuário
          </Button>
          <Button onClick={handleSync} disabled={syncUsers.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncUsers.isPending ? 'animate-spin' : ''}`} />
            Sincronizar com DECARGO People
          </Button>
        </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input
                value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="Nome completo"
              />
            </div>
            <div>
              <label className="text-sm font-medium">E-mail</label>
              <Input
                type="email"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Papel</label>
              <select
                className="w-full h-9 rounded border border-input bg-background px-2 text-sm shadow-sm"
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="admin">Administrador</option>
                <option value="gestor">Gestor</option>
                <option value="prestador">Prestador</option>
                <option value="funcionario">Funcionário</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreateUser}
              disabled={!newUser.name || !newUser.email || createUser.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Criar usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <Input
              placeholder="Pesquisar por nome..."
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              className="h-9 sm:max-w-xs"
            />
            <select
              className="h-9 rounded border border-input bg-background px-2 text-sm shadow-sm"
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
            >
              <option value="todos">Todos os papéis</option>
              <option value="admin">Administrador</option>
              <option value="gestor">Gestor</option>
              <option value="prestador">Prestador</option>
              <option value="funcionario">Funcionário</option>
            </select>
            <select
              className="h-9 rounded border border-input bg-background px-2 text-sm shadow-sm"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as 'todos' | 'ativo' | 'inativo')}
            >
              <option value="todos">Todos os status</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acesso Desde</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center h-24">Carregando...</TableCell></TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Nenhum usuário encontrado com os filtros selecionados.</TableCell></TableRow>
              ) : filteredUsers.map(user => (
                <TableRow key={user.id} className={!user.active ? 'opacity-50' : ''}>
                  <TableCell>
                    {editingId === user.id ? (
                      <div className="flex flex-col gap-1 max-w-xs">
                        <Input
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="Nome"
                          className="h-8"
                        />
                        <Input
                          value={editForm.email}
                          onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                          placeholder="E-mail"
                          className="h-8"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    )}
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
                      <option value="funcionario">Funcionário</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <select
                      className="h-8 rounded border border-input bg-background px-2 text-sm shadow-sm"
                      value={user.teamId?.toString() ?? ''}
                      onChange={e => handleTeamChange(user.id, e.target.value)}
                    >
                      <option value="">Sem equipe</option>
                      {(teams ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {editingId === user.id ? (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X size={16} /></Button>
                          <Button size="icon" variant="ghost" onClick={() => handleSaveEdit(user.id)} disabled={!editForm.name}><Save size={16} /></Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => startEdit(user)}>
                            <Edit2 size={16} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(user.id)}
                            disabled={user.id === currentUser.id}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </>
                      )}
                    </div>
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
