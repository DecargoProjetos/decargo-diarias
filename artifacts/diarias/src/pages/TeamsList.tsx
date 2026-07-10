import { useState } from 'react';
import { useGetMe, useListTeams, useCreateTeam, useUpdateTeam, useDeleteTeam, useListUsers } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';

export default function TeamsList() {
  const { data: user } = useGetMe();
  const { data: teams, isLoading, refetch } = useListTeams();
  const { data: users } = useListUsers();
  const { toast } = useToast();
  
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [formData, setFormData] = useState({ name: '', managerId: '' });

  if (user?.role !== 'admin') {
    return <div>Acesso negado. Apenas administradores.</div>;
  }

  const handleSave = () => {
    const payload = {
      name: formData.name,
      managerId: formData.managerId ? Number(formData.managerId) : null
    };

    if (editingId === 'new') {
      createTeam.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: 'Equipe criada.' });
          setEditingId(null);
          refetch();
        }
      });
    } else if (typeof editingId === 'number') {
      updateTeam.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          toast({ title: 'Equipe atualizada.' });
          setEditingId(null);
          refetch();
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('Tem certeza que deseja excluir esta equipe?')) {
      deleteTeam.mutate({ id }, {
        onSuccess: () => {
          toast({ title: 'Equipe excluída.' });
          refetch();
        }
      });
    }
  };

  const startEdit = (team?: any) => {
    if (team) {
      setEditingId(team.id);
      setFormData({ name: team.name, managerId: team.managerId?.toString() || '' });
    } else {
      setEditingId('new');
      setFormData({ name: '', managerId: '' });
    }
  };

  // Show all active users — any user can be designated as team manager.
  // Role assignment happens separately in the Users admin page.
  const gestores = users?.filter(u => u.active !== false) || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Equipes</h1>
          <p className="text-muted-foreground mt-1">Gestão de equipes e alocação de gestores.</p>
        </div>
        <Button onClick={() => startEdit()}>
          <Plus className="w-4 h-4 mr-2" /> Nova Equipe
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Gestor</TableHead>
                <TableHead>Prestadores</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">Carregando...</TableCell>
                </TableRow>
              )}
              
              {editingId === 'new' && (
                <TableRow className="bg-muted/30">
                  <TableCell>Nova</TableCell>
                  <TableCell>
                    <Input 
                      value={formData.name} 
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="Nome da equipe"
                      autoFocus
                    />
                  </TableCell>
                  <TableCell>
                    <select 
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                      value={formData.managerId}
                      onChange={e => setFormData({...formData, managerId: e.target.value})}
                    >
                      <option value="">Sem gestor</option>
                      {gestores.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X size={16} /></Button>
                    <Button size="sm" onClick={handleSave} disabled={!formData.name}><Save size={16} /></Button>
                  </TableCell>
                </TableRow>
              )}

              {teams?.map(team => (
                <TableRow key={team.id}>
                  <TableCell>#{team.id}</TableCell>
                  {editingId === team.id ? (
                    <>
                      <TableCell>
                        <Input 
                          value={formData.name} 
                          onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                      </TableCell>
                      <TableCell>
                        <select 
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                          value={formData.managerId}
                          onChange={e => setFormData({...formData, managerId: e.target.value})}
                        >
                          <option value="">Sem gestor</option>
                          {gestores.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </TableCell>
                      <TableCell>{team.providerCount}</TableCell>
                      <TableCell>{formatDate(team.createdAt)}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X size={16} /></Button>
                        <Button size="sm" onClick={handleSave} disabled={!formData.name}><Save size={16} /></Button>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-medium">{team.name}</TableCell>
                      <TableCell>{team.managerName || <span className="text-muted-foreground italic">Não atribuído</span>}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">
                          {team.providerCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(team.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="ghost" onClick={() => startEdit(team)}>
                            <Edit2 size={16} />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(team.id)}>
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
