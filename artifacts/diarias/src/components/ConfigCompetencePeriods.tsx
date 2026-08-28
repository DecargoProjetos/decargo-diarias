import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { 
  useListCompetencePeriods, 
  useCreateCompetencePeriod, 
  useUpdateCompetencePeriod, 
  useDeleteCompetencePeriod, 
  useSetCompetencePeriodStatus,
  useListCompetencePeriodReleases,
  useCreateCompetencePeriodRelease,
  useCancelCompetencePeriodRelease,
  useListUsers,
  CompetencePeriod,
  CompetenceRelease
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { Plus, Pencil, Lock, Unlock, Trash2, KeyRound, X, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListCompetencePeriodsQueryKey,
  getListCompetencePeriodReleasesQueryKey,
  getGetCompetenceWorkDateStatusQueryKey,
} from '@workspace/api-client-react';

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';
const dateTimePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SAO_PAULO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function getSaoPauloDateTimeParts(date: Date) {
  const values = Object.fromEntries(
    dateTimePartsFormatter
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/**
 * Formats an instant for a datetime-local input without using the browser's
 * local timezone. This makes editing round-trip as São Paulo wall time.
 */
export function isoToSaoPauloDateTimeLocal(iso: string): string {
  const parts = getSaoPauloDateTimeParts(new Date(iso));
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}T${parts.hour.toString().padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`;
}

/**
 * Converts a datetime-local wall time entered by an administrator to its
 * actual São Paulo instant. `datetime-local` values intentionally have no
 * timezone, so `new Date(value)` would incorrectly use the browser timezone.
 */
export function saoPauloDateTimeLocalToIso(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, yearString, monthString, dayString, hourString, minuteString] = match;
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const hour = Number(hourString);
  const minute = Number(minuteString);
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const wallDate = new Date(wallTimeAsUtc);
  if (
    wallDate.getUTCFullYear() !== year ||
    wallDate.getUTCMonth() !== month - 1 ||
    wallDate.getUTCDate() !== day ||
    wallDate.getUTCHours() !== hour ||
    wallDate.getUTCMinutes() !== minute
  ) {
    return null;
  }

  // Resolve the zone offset from the instant and repeat once because an
  // offset transition can change the result of the first estimate.
  let instantMs = wallTimeAsUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const zonedParts = getSaoPauloDateTimeParts(new Date(instantMs));
    const offsetMs = Date.UTC(
      zonedParts.year,
      zonedParts.month - 1,
      zonedParts.day,
      zonedParts.hour,
      zonedParts.minute,
      zonedParts.second,
    ) - instantMs;
    instantMs = wallTimeAsUtc - offsetMs;
  }

  return new Date(instantMs).toISOString();
}

export function formatSaoPauloDateTime(iso: string, shortYear = false, includeAt = true): string {
  const parts = getSaoPauloDateTimeParts(new Date(iso));
  const year = shortYear ? String(parts.year).slice(-2) : String(parts.year).padStart(4, '0');
  const separator = includeAt ? ' às ' : ' ';
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${year}${separator}${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function invalidateCompetenceWorkDateStatuses(queryClient: ReturnType<typeof useQueryClient>) {
  const [workDateStatusKey] = getGetCompetenceWorkDateStatusQueryKey('');
  queryClient.invalidateQueries({
    predicate: (query) => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith(workDateStatusKey),
  });
}

type PeriodFormState = {
  name: string;
  workStartDate: string;
  workEndDate: string;
  deadlineAt: string;
  observations: string;
};

const emptyPeriodForm: PeriodFormState = {
  name: '',
  workStartDate: '',
  workEndDate: '',
  deadlineAt: '',
  observations: '',
};

type ReleaseFormState = {
  managerId: string;
  startsAt: string;
  expiresAt: string;
  reason: string;
};

const emptyReleaseForm: ReleaseFormState = {
  managerId: '',
  startsAt: '',
  expiresAt: '',
  reason: '',
};

export default function ConfigCompetencePeriods() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: periods = [], isLoading: isLoadingPeriods } = useListCompetencePeriods();
  const createPeriod = useCreateCompetencePeriod();
  const updatePeriod = useUpdateCompetencePeriod();
  const deletePeriod = useDeleteCompetencePeriod();
  const setStatus = useSetCompetencePeriodStatus();

  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<CompetencePeriod | null>(null);
  const [periodForm, setPeriodForm] = useState<PeriodFormState>(emptyPeriodForm);

  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [selectedPeriodForRelease, setSelectedPeriodForRelease] = useState<CompetencePeriod | null>(null);

  // Period management
  function openCreatePeriod() {
    setEditingPeriod(null);
    setPeriodForm(emptyPeriodForm);
    setPeriodDialogOpen(true);
  }

  function openEditPeriod(p: CompetencePeriod) {
    setEditingPeriod(p);
    setPeriodForm({
      name: p.name,
      workStartDate: p.workStartDate.split('T')[0],
      workEndDate: p.workEndDate.split('T')[0],
      deadlineAt: isoToSaoPauloDateTimeLocal(p.deadlineAt),
      observations: p.observations || '',
    });
    setPeriodDialogOpen(true);
  }

  function handleSavePeriod() {
    if (!periodForm.name.trim() || !periodForm.workStartDate || !periodForm.workEndDate || !periodForm.deadlineAt) {
      toast({ title: 'Preencha todos os campos obrigatórios.', variant: 'destructive' });
      return;
    }
    
    // Check dates
    if (periodForm.workStartDate > periodForm.workEndDate) {
      toast({ title: 'A data inicial não pode ser posterior à data final.', variant: 'destructive' });
      return;
    }

    const deadlineAt = saoPauloDateTimeLocalToIso(periodForm.deadlineAt);
    if (!deadlineAt) {
      toast({ title: 'Informe uma data/hora válida para o prazo final.', variant: 'destructive' });
      return;
    }

    const payload = {
      name: periodForm.name,
      workStartDate: periodForm.workStartDate,
      workEndDate: periodForm.workEndDate,
      deadlineAt,
      observations: periodForm.observations || undefined,
    };

    if (editingPeriod) {
      updatePeriod.mutate({ id: editingPeriod.id, data: payload }, {
        onSuccess: () => {
          toast({ title: 'Período atualizado.' });
          setPeriodDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getListCompetencePeriodsQueryKey() });
          invalidateCompetenceWorkDateStatuses(queryClient);
        },
        onError: (e: any) => toast({ title: 'Erro', description: e?.message, variant: 'destructive' }),
      });
    } else {
      createPeriod.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: 'Período criado.' });
          setPeriodDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getListCompetencePeriodsQueryKey() });
          invalidateCompetenceWorkDateStatuses(queryClient);
        },
        onError: (e: any) => toast({ title: 'Erro', description: e?.message, variant: 'destructive' }),
      });
    }
  }

  function handleDeletePeriod(id: number) {
    if (!confirm('Deseja realmente excluir este período?')) return;
    deletePeriod.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Período excluído.' });
        queryClient.invalidateQueries({ queryKey: getListCompetencePeriodsQueryKey() });
        invalidateCompetenceWorkDateStatuses(queryClient);
      },
      onError: (e: any) => toast({ title: 'Erro', description: e?.message, variant: 'destructive' }),
    });
  }

  function handleToggleStatus(p: CompetencePeriod) {
    const action = p.status === 'closed' ? 'reopen' : 'close';
    if (!confirm(`Deseja realmente ${action === 'close' ? 'encerrar' : 'reabrir'} o período ${p.name}?`)) return;
    setStatus.mutate({ id: p.id, status: action }, {
      onSuccess: () => {
        toast({ title: `Período ${action === 'close' ? 'encerrado' : 'reaberto'}.` });
        queryClient.invalidateQueries({ queryKey: getListCompetencePeriodsQueryKey() });
        invalidateCompetenceWorkDateStatuses(queryClient);
      },
      onError: (e: any) => toast({ title: 'Erro', description: e?.message, variant: 'destructive' }),
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle>Períodos de Competência</CardTitle>
            <CardDescription>
              Defina os intervalos de datas que os gestores podem registrar diárias e até quando.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreatePeriod} data-testid="button-create-period">
            <Plus size={16} className="mr-1" /> Novo Período
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingPeriods ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando…</p>
          ) : periods.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum período cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Intervalo de Trabalho</TableHead>
                  <TableHead>Prazo Final</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.id} className={p.status === 'closed' ? 'opacity-70 bg-muted/30' : undefined} data-testid={`row-period-${p.id}`}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      {format(parseISO(p.workStartDate), 'dd/MM/yyyy')} a {format(parseISO(p.workEndDate), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell>
                      {formatSaoPauloDateTime(p.deadlineAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'open' ? 'default' : 'secondary'}>
                        {p.status === 'open' ? 'Aberto' : 'Encerrado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" className="h-8 px-2 text-primary" onClick={() => { setSelectedPeriodForRelease(p); setReleaseDialogOpen(true); }} title="Liberações Excepcionais" data-testid={`button-releases-${p.id}`}>
                          <KeyRound size={14} />
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openEditPeriod(p)} title="Editar" data-testid={`button-edit-period-${p.id}`}>
                          <Pencil size={14} />
                        </Button>
                        <Button size="sm" variant="outline" className={`h-8 px-2 ${p.status === 'open' ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'}`} onClick={() => handleToggleStatus(p)} title={p.status === 'open' ? 'Encerrar' : 'Reabrir'} data-testid={`button-toggle-status-${p.id}`}>
                          {p.status === 'open' ? <Lock size={14} /> : <Unlock size={14} />}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2 text-destructive hover:bg-destructive/10" onClick={() => handleDeletePeriod(p.id)} title="Excluir" data-testid={`button-delete-period-${p.id}`}>
                          <Trash2 size={14} />
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

      <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPeriod ? 'Editar Período' : 'Novo Período'}</DialogTitle>
            <DialogDescription>
              Defina o período de dias trabalhados e a data/hora limite para os gestores registrarem diárias.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome *</label>
              <Input
                value={periodForm.name}
                onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })}
                placeholder="Ex: Setembro 2023"
                autoFocus
                data-testid="input-period-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Data Inicial do Trabalho *</label>
                <Input
                  type="date"
                  value={periodForm.workStartDate}
                  onChange={(e) => setPeriodForm({ ...periodForm, workStartDate: e.target.value })}
                  data-testid="input-period-start-date"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Data Final do Trabalho *</label>
                <Input
                  type="date"
                  value={periodForm.workEndDate}
                  onChange={(e) => setPeriodForm({ ...periodForm, workEndDate: e.target.value })}
                  data-testid="input-period-end-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Prazo Final para Lançamentos *</label>
              <Input
                type="datetime-local"
                value={periodForm.deadlineAt}
                onChange={(e) => setPeriodForm({ ...periodForm, deadlineAt: e.target.value })}
                data-testid="input-period-deadline"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Observações</label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                value={periodForm.observations}
                onChange={(e) => setPeriodForm({ ...periodForm, observations: e.target.value })}
                placeholder="Opcional..."
                data-testid="input-period-observations"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialogOpen(false)} data-testid="button-cancel-period">Cancelar</Button>
            <Button
              onClick={handleSavePeriod}
              disabled={createPeriod.isPending || updatePeriod.isPending}
              data-testid="button-save-period"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedPeriodForRelease && (
        <ReleasesDialog 
          period={selectedPeriodForRelease}
          open={releaseDialogOpen} 
          onOpenChange={(v) => {
            setReleaseDialogOpen(v);
            if (!v) setSelectedPeriodForRelease(null);
          }} 
        />
      )}
    </>
  );
}

function ReleasesDialog({ period, open, onOpenChange }: { period: CompetencePeriod, open: boolean, onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: releases = [], isLoading: isLoadingReleases } = useListCompetencePeriodReleases(period.id, {
    query: { enabled: open, queryKey: getListCompetencePeriodReleasesQueryKey(period.id) }
  });
  
  const { data: users = [] } = useListUsers({
    query: { enabled: open, queryKey: ['listUsers'] }
  });
  
  const gestores = users.filter(u => u.role === 'gestor' && u.active);
  
  const createRelease = useCreateCompetencePeriodRelease();
  const cancelRelease = useCancelCompetencePeriodRelease();
  
  const [form, setForm] = useState<ReleaseFormState>(emptyReleaseForm);
  const [showForm, setShowForm] = useState(false);

  function handleCreate() {
    if (!form.managerId || !form.startsAt || !form.expiresAt) {
      toast({ title: 'Preencha os campos obrigatórios.', variant: 'destructive' });
      return;
    }
    
    const startsAt = saoPauloDateTimeLocalToIso(form.startsAt);
    const expiresAt = saoPauloDateTimeLocalToIso(form.expiresAt);
    if (!startsAt || !expiresAt) {
      toast({ title: 'Informe datas e horários válidos.', variant: 'destructive' });
      return;
    }

    createRelease.mutate({
      id: period.id,
      data: {
        managerId: Number(form.managerId),
        startsAt,
        expiresAt,
        reason: form.reason || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: 'Liberação concedida.' });
        setForm(emptyReleaseForm);
        setShowForm(false);
        queryClient.invalidateQueries({ queryKey: getListCompetencePeriodReleasesQueryKey(period.id) });
        invalidateCompetenceWorkDateStatuses(queryClient);
      },
      onError: (e: any) => toast({ title: 'Erro ao criar liberação', description: e?.message, variant: 'destructive' }),
    });
  }

  function handleCancel(releaseId: number) {
    if (!confirm('Deseja realmente cancelar esta liberação?')) return;
    
    cancelRelease.mutate({ id: period.id, releaseId }, {
      onSuccess: () => {
        toast({ title: 'Liberação cancelada.' });
        queryClient.invalidateQueries({ queryKey: getListCompetencePeriodReleasesQueryKey(period.id) });
        invalidateCompetenceWorkDateStatuses(queryClient);
      },
      onError: (e: any) => toast({ title: 'Erro ao cancelar liberação', description: e?.message, variant: 'destructive' }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Liberações Excepcionais - {period.name}</DialogTitle>
          <DialogDescription>
            Conceda acesso temporário para gestores lançarem diárias fora do prazo ou em um período encerrado.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          {!showForm ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setForm(emptyReleaseForm); setShowForm(true); }} data-testid="button-new-release">
                <Plus size={16} className="mr-1" /> Nova Liberação
              </Button>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Gestor *</label>
                    <select
                      value={form.managerId}
                      onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                      data-testid="select-release-manager"
                    >
                      <option value="" disabled>Selecione o gestor</option>
                      {gestores.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Válido de *</label>
                    <Input
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                      data-testid="input-release-start"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Válido até *</label>
                    <Input
                      type="datetime-local"
                      value={form.expiresAt}
                      onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                      data-testid="input-release-end"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Motivo</label>
                    <Input
                      value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      placeholder="Justificativa (opcional)"
                      data-testid="input-release-reason"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} data-testid="button-cancel-new-release">Cancelar</Button>
                  <Button size="sm" onClick={handleCreate} disabled={createRelease.isPending} data-testid="button-save-release">
                    {createRelease.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
                    Conceder Liberação
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isLoadingReleases ? (
             <p className="text-sm text-muted-foreground py-4 text-center">Carregando liberações…</p>
          ) : releases.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">Nenhuma liberação excepcional registrada para este período.</p>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gestor</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {releases.map(r => {
                    const isExpired = new Date() > new Date(r.expiresAt);
                    const notStarted = new Date() < new Date(r.startsAt);
                    let statusLabel = 'Ativa';
                    let statusVariant: 'default' | 'destructive' | 'secondary' | 'outline' = 'default';
                    
                    if (!r.active) {
                      statusLabel = 'Cancelada';
                      statusVariant = 'destructive';
                    } else if (isExpired) {
                      statusLabel = 'Expirada';
                      statusVariant = 'secondary';
                    } else if (notStarted) {
                      statusLabel = 'Agendada';
                      statusVariant = 'outline';
                    }
                    
                    return (
                      <TableRow key={r.id} className={!r.active || isExpired ? 'opacity-60 bg-muted/30' : undefined} data-testid={`row-release-${r.id}`}>
                        <TableCell>
                          <div className="font-medium">{r.managerName || `ID: ${r.managerId}`}</div>
                          {r.reason && <div className="text-xs text-muted-foreground">{r.reason}</div>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatSaoPauloDateTime(r.startsAt, true, false)} <br/>
                          até {formatSaoPauloDateTime(r.expiresAt, true, false)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant}>{statusLabel}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {r.active && !isExpired && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleCancel(r.id)} title="Cancelar Liberação" data-testid={`button-cancel-release-${r.id}`}>
                              <X size={16} />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
