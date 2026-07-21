import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useGetMe } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, ToggleLeft, ToggleRight, Settings2 } from 'lucide-react';

// --- inline hooks (hand-written — api-client-react will be rebuilt) ---
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

function apiFetch(path: string, init?: RequestInit) {
  const token = localStorage.getItem('access_token');
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  }).then(async (r) => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error ?? r.statusText); }
    return r.json();
  });
}

export type DiariaType = {
  id: number;
  description: string;
  exportTarget: 'diaria_extra' | 'falta';
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const EXPORT_LABELS: Record<string, string> = {
  diaria_extra: 'Diária Extra',
  falta: 'Falta',
};

function useListDiariaTypesLocal() {
  return useQuery<DiariaType[]>({
    queryKey: ['diaria-types', 'all'],
    queryFn: () => apiFetch('/api/diaria-types?activeOnly=false'),
  });
}

function useCreateDiariaTypeLocal() {
  const qc = useQueryClient();
  return useMutation<DiariaType, Error, { description: string; exportTarget: string }>({
    mutationFn: (data) => apiFetch('/api/diaria-types', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['diaria-types'] }),
  });
}

function useUpdateDiariaTypeLocal() {
  const qc = useQueryClient();
  return useMutation<DiariaType, Error, { id: number; data: Partial<DiariaType> }>({
    mutationFn: ({ id, data }) => apiFetch(`/api/diaria-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['diaria-types'] }),
  });
}

type FormState = { description: string; exportTarget: 'diaria_extra' | 'falta' };
const emptyForm: FormState = { description: '', exportTarget: 'diaria_extra' };

export default function Configuracoes() {
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const { data: types = [], isLoading } = useListDiariaTypesLocal();
  const createMutation = useCreateDiariaTypeLocal();
  const updateMutation = useUpdateDiariaTypeLocal();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DiariaType | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  if (me?.role !== 'admin') {
    return <div className="p-8 text-destructive">Acesso restrito a administradores.</div>;
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(t: DiariaType) {
    setEditing(t);
    setForm({ description: t.description, exportTarget: t.exportTarget });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.description.trim()) return;
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form }, {
        onSuccess: () => { toast({ title: 'Tipo atualizado.' }); setDialogOpen(false); },
        onError: (e) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
      });
    } else {
      createMutation.mutate(form, {
        onSuccess: () => { toast({ title: 'Tipo criado.' }); setDialogOpen(false); },
        onError: (e) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
      });
    }
  }

  function toggleActive(t: DiariaType) {
    updateMutation.mutate({ id: t.id, data: { active: !t.active } }, {
      onSuccess: () => toast({ title: t.active ? 'Tipo inativado.' : 'Tipo reativado.' }),
      onError: (e) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
    });
  }

  const sorted = [...types].sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings2 size={28} /> Configurações
          </h1>
          <p className="text-muted-foreground mt-1">Parâmetros do sistema. Acesso restrito a administradores.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle>Tipos de Diária</CardTitle>
            <CardDescription>
              Categorias disponíveis no formulário de Nova Diária. Apenas tipos ativos são exibidos.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus size={16} className="mr-1" /> Novo Tipo
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum tipo cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Destino de Exportação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((t) => (
                  <TableRow key={t.id} className={!t.active ? 'opacity-50' : undefined}>
                    <TableCell className="font-medium">{t.description}</TableCell>
                    <TableCell>
                      <Badge variant={t.exportTarget === 'falta' ? 'destructive' : 'secondary'}>
                        {EXPORT_LABELS[t.exportTarget] ?? t.exportTarget}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.active ? 'default' : 'outline'}>
                        {t.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openEdit(t)} title="Editar">
                          <Pencil size={14} />
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className={`h-8 px-2 ${t.active ? 'text-amber-700 border-amber-200 hover:bg-amber-50' : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'}`}
                          disabled={updateMutation.isPending}
                          onClick={() => toggleActive(t)}
                          title={t.active ? 'Inativar' : 'Reativar'}
                        >
                          {t.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Tipo de Diária' : 'Novo Tipo de Diária'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Descrição *</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ex: Diária Comum, Falta Justificada…"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Destino de Exportação *</label>
              <select
                value={form.exportTarget}
                onChange={(e) => setForm({ ...form, exportTarget: e.target.value as FormState['exportTarget'] })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value="diaria_extra">Diária Extra — envia para Diárias Extras</option>
                <option value="falta">Falta — envia para Descontos</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Define para qual seção do DECARGO People este tipo será exportado.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={!form.description.trim() || createMutation.isPending || updateMutation.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
