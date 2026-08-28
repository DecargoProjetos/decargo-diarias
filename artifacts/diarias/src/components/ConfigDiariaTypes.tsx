import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
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
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getToken } from '@/lib/auth';

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

function apiFetch(path: string, init?: RequestInit) {
  const token = getToken();
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
  exportTarget: 'diaria_extra' | 'falta' | 'none';
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const EXPORT_LABELS: Record<string, string> = {
  diaria_extra: 'Diária Extra — envia para Diárias Extras',
  falta: 'Falta — envia para Descontos',
  none: 'Não importar',
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

type FormState = { description: string; exportTarget: 'diaria_extra' | 'falta' | 'none' };
const emptyForm: FormState = { description: '', exportTarget: 'diaria_extra' };

export default function ConfigDiariaTypes() {
  const { toast } = useToast();
  const { data: types = [], isLoading } = useListDiariaTypesLocal();
  const createMutation = useCreateDiariaTypeLocal();
  const updateMutation = useUpdateDiariaTypeLocal();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DiariaType | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

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
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle>Tipos de Diária</CardTitle>
            <CardDescription>
              Categorias disponíveis no formulário de Nova Diária. Apenas tipos ativos são exibidos.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate} data-testid="button-create-diaria-type">
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
                  <TableRow key={t.id} className={!t.active ? 'opacity-50' : undefined} data-testid={`row-diaria-type-${t.id}`}>
                    <TableCell className="font-medium">{t.description}</TableCell>
                    <TableCell>
                      <Badge variant={t.exportTarget === 'falta' ? 'destructive' : t.exportTarget === 'none' ? 'outline' : 'secondary'}>
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
                        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openEdit(t)} title="Editar" data-testid={`button-edit-type-${t.id}`}>
                          <Pencil size={14} />
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          className={`h-8 px-2 ${t.active ? 'text-amber-700 border-amber-200 hover:bg-amber-50' : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'}`}
                          disabled={updateMutation.isPending}
                          onClick={() => toggleActive(t)}
                          title={t.active ? 'Inativar' : 'Reativar'}
                          data-testid={`button-toggle-type-${t.id}`}
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
                data-testid="input-type-description"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Destino de Exportação *</label>
              <select
                value={form.exportTarget}
                onChange={(e) => setForm({ ...form, exportTarget: e.target.value as FormState['exportTarget'] })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                data-testid="select-type-export-target"
              >
                <option value="diaria_extra">Diária Extra — envia para Diárias Extras</option>
                <option value="falta">Falta — envia para Descontos</option>
                <option value="none">Não importar</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Define para qual seção do DECARGO People este tipo será exportado.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-type">Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={!form.description.trim() || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-type"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
