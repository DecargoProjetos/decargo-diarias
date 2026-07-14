import { useMemo, useState } from 'react';
import {
  useGetMe,
  useListDiarias,
  useListProviders,
  useCreateDiaria,
  useUpdateDiaria,
  type Diaria,
  type Provider,
  type User,
} from '@workspace/api-client-react';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { cn, formatCurrency, statusColors, statusLabels } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Plus, Edit2, X, Save } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

// Referência visual: app de Calendário do Android — grade mensal com
// indicador de quantidade por dia, alternância mensal/semanal/diária e um
// painel (Sheet) por dia para consultar/lançar/editar diárias sem sair da
// tela de calendário.
type ViewMode = 'month' | 'week' | 'day';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const EDITABLE_STATUSES = ['pendente_aprovacao', 'solicitacao_correcao'];

const toDateKey = (date: Date): string => format(date, 'yyyy-MM-dd');
const truncateTime = (value: string | null | undefined): string | null =>
  value ? value.slice(0, 5) : null;

export default function DiariasCalendar() {
  const { data: user } = useGetMe();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const canCreate = user?.role === 'admin' || user?.role === 'gestor';

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === 'month') {
      return { rangeStart: startOfWeek(startOfMonth(anchorDate)), rangeEnd: endOfWeek(endOfMonth(anchorDate)) };
    }
    if (viewMode === 'week') {
      return { rangeStart: startOfWeek(anchorDate), rangeEnd: endOfWeek(anchorDate) };
    }
    return { rangeStart: anchorDate, rangeEnd: anchorDate };
  }, [viewMode, anchorDate]);

  const gridDays = useMemo(() => {
    const days: Date[] = [];
    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [rangeStart, rangeEnd]);

  const { data: diariasData, isLoading, refetch } = useListDiarias({
    startDate: toDateKey(rangeStart),
    endDate: toDateKey(rangeEnd),
    pageSize: 100,
  });

  // Only fetch the (potentially team-scoped) provider picker when the user
  // can actually create diárias — prestador/funcionário never need it.
  const { data: providers } = useListProviders(
    { activeOnly: true },
    { query: { enabled: !!canCreate, queryKey: ['listProviders', 'activeOnly'] } },
  );

  const diariasByDay = useMemo(() => {
    const map = new Map<string, Diaria[]>();
    for (const diaria of diariasData?.data ?? []) {
      const key = diaria.workDate.split('T')[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(diaria);
    }
    return map;
  }, [diariasData]);

  const navigate = (dir: 1 | -1) => {
    setAnchorDate(prev => {
      if (viewMode === 'month') return addMonths(prev, dir);
      if (viewMode === 'week') return addWeeks(prev, dir);
      return addDays(prev, dir);
    });
  };

  const headerLabel =
    viewMode === 'month'
      ? format(anchorDate, 'MMMM yyyy', { locale: ptBR })
      : viewMode === 'week'
      ? `${format(rangeStart, 'd MMM', { locale: ptBR })} – ${format(rangeEnd, 'd MMM yyyy', { locale: ptBR })}`
      : format(anchorDate, "EEEE, d 'de' MMMM", { locale: ptBR });

  const selectedDiaria = selectedDateKey ? diariasByDay.get(selectedDateKey) ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Diárias</h1>
          <p className="text-muted-foreground mt-1">Consulte, registre e edite diárias direto no calendário.</p>
        </div>

        <div className="flex rounded-md border overflow-hidden">
          {(['month', 'week', 'day'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors',
                viewMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {mode === 'month' ? 'Mês' : mode === 'week' ? 'Semana' : 'Dia'}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <div className="flex items-center gap-3">
              <span className="font-semibold capitalize">{headerLabel}</span>
              <Button variant="ghost" size="sm" onClick={() => setAnchorDate(new Date())}>
                Hoje
              </Button>
            </div>
            <Button variant="outline" size="icon" onClick={() => navigate(1)}>
              <ChevronRight size={16} />
            </Button>
          </div>

          {isLoading || !user ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">Carregando...</div>
          ) : viewMode === 'month' ? (
            <MonthGrid
              gridDays={gridDays}
              anchorDate={anchorDate}
              diariasByDay={diariasByDay}
              onSelect={setSelectedDateKey}
            />
          ) : viewMode === 'week' ? (
            <WeekGrid gridDays={gridDays} diariasByDay={diariasByDay} onSelect={setSelectedDateKey} />
          ) : (
            <DayAgenda
              dateKey={toDateKey(anchorDate)}
              diarias={diariasByDay.get(toDateKey(anchorDate)) ?? []}
              canCreate={!!canCreate}
              providers={providers}
              user={user}
              onChanged={refetch}
            />
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedDateKey} onOpenChange={open => { if (!open) setSelectedDateKey(null); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="capitalize">
              {selectedDateKey && format(parseISO(selectedDateKey), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </SheetTitle>
            <SheetDescription>Diárias do dia</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {selectedDateKey && user && (
              <DayAgenda
                dateKey={selectedDateKey}
                diarias={selectedDiaria}
                canCreate={!!canCreate}
                providers={providers}
                user={user}
                onChanged={refetch}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MonthGrid({
  gridDays,
  anchorDate,
  diariasByDay,
  onSelect,
}: {
  gridDays: Date[];
  anchorDate: Date;
  diariasByDay: Map<string, Diaria[]>;
  onSelect: (key: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground mb-1">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className="py-1">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {gridDays.map(day => {
          const key = toDateKey(day);
          const count = diariasByDay.get(key)?.length ?? 0;
          const inMonth = isSameMonth(day, anchorDate);
          const today = isToday(day);
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={cn(
                'aspect-square sm:aspect-auto sm:h-20 rounded-md border p-1.5 flex flex-col items-start gap-1 text-left transition-colors hover:border-primary hover:bg-accent/50',
                !inMonth && 'text-muted-foreground bg-muted/20',
                today && 'border-primary',
              )}
            >
              <span className={cn('text-sm font-medium', today && 'text-primary')}>{format(day, 'd')}</span>
              {count > 0 && (
                <span className="text-[10px] leading-tight font-semibold bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                  {count} {count === 1 ? 'diária' : 'diárias'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  gridDays,
  diariasByDay,
  onSelect,
}: {
  gridDays: Date[];
  diariasByDay: Map<string, Diaria[]>;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {gridDays.map(day => {
        const key = toDateKey(day);
        const items = diariasByDay.get(key) ?? [];
        const today = isToday(day);
        return (
          <div key={key} className={cn('rounded-md border p-2 flex flex-col gap-2 min-h-[140px]', today && 'border-primary')}>
            <button onClick={() => onSelect(key)} className="text-left">
              <div className="text-xs text-muted-foreground">{WEEKDAY_LABELS[day.getDay()]}</div>
              <div className={cn('text-sm font-semibold', today && 'text-primary')}>
                {format(day, 'd MMM', { locale: ptBR })}
              </div>
            </button>
            <div className="flex flex-col gap-1">
              {items.slice(0, 3).map(d => (
                <button
                  key={d.id}
                  onClick={() => onSelect(key)}
                  className="text-left text-xs rounded bg-muted/50 px-1.5 py-1 truncate hover:bg-muted"
                >
                  {d.providerName}{d.startTime ? ` · ${truncateTime(d.startTime)}` : ''}
                </button>
              ))}
              {items.length > 3 && (
                <button onClick={() => onSelect(key)} className="text-xs text-muted-foreground text-left px-1.5">
                  +{items.length - 3} mais
                </button>
              )}
              {items.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayAgenda({
  dateKey,
  diarias,
  canCreate,
  providers,
  user,
  onChanged,
}: {
  dateKey: string;
  diarias: Diaria[];
  canCreate: boolean;
  providers: Provider[] | undefined;
  user: User;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const createMutation = useCreateDiaria();
  const updateMutation = useUpdateDiaria();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ providerId: '', startTime: '', endTime: '', observations: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ startTime: '', endTime: '', observations: '' });

  const showFinancials = user.role !== 'prestador' && user.role !== 'funcionario';
  const selectedProvider = providers?.find(p => p.id === Number(createForm.providerId));

  const canEdit = (d: Diaria) => {
    if (!EDITABLE_STATUSES.includes(d.status)) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'gestor') return d.teamId === user.teamId;
    return false;
  };

  const resetCreateForm = () => setCreateForm({ providerId: '', startTime: '', endTime: '', observations: '' });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;

    if (selectedProvider.dailyRate == null) {
      toast({
        title: 'Valor da diária não definido',
        description: 'Configure o Valor da Diária deste prestador em Pessoas antes de lançar.',
        variant: 'destructive',
      });
      return;
    }

    const teamId = selectedProvider.teamId ?? user.teamId;
    if (!teamId) {
      toast({ title: 'Este prestador não está vinculado a uma equipe.', variant: 'destructive' });
      return;
    }

    createMutation.mutate(
      {
        data: {
          providerId: selectedProvider.id,
          teamId,
          workDate: dateKey,
          startTime: createForm.startTime || null,
          endTime: createForm.endTime || null,
          value: selectedProvider.dailyRate,
          observations: createForm.observations || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Diária registrada.' });
          setShowCreateForm(false);
          resetCreateForm();
          onChanged();
        },
        onError: (err: any) => toast({ title: 'Erro ao registrar diária', description: err?.message, variant: 'destructive' }),
      },
    );
  };

  const startEdit = (d: Diaria) => {
    setEditingId(d.id);
    setEditForm({
      startTime: truncateTime(d.startTime) ?? '',
      endTime: truncateTime(d.endTime) ?? '',
      observations: d.observations ?? '',
    });
  };

  const handleSaveEdit = (id: number) => {
    updateMutation.mutate(
      {
        id,
        data: {
          startTime: editForm.startTime || null,
          endTime: editForm.endTime || null,
          observations: editForm.observations || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Diária atualizada.' });
          setEditingId(null);
          onChanged();
        },
        onError: (err: any) => toast({ title: 'Erro ao atualizar', description: err?.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="space-y-3">
      {diarias.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma diária neste dia.</p>
      )}

      {diarias.map(d => (
        <Card key={d.id}>
          <CardContent className="p-3">
            {editingId === d.id ? (
              <div className="space-y-2">
                <div className="font-medium">{d.providerName}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Horário Inicial</label>
                    <Input type="time" className="h-8" value={editForm.startTime} onChange={e => setEditForm({ ...editForm, startTime: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Horário Final</label>
                    <Input type="time" className="h-8" value={editForm.endTime} onChange={e => setEditForm({ ...editForm, endTime: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Observações</label>
                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editForm.observations}
                    onChange={e => setEditForm({ ...editForm, observations: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X size={14} /></Button>
                  <Button size="sm" onClick={() => handleSaveEdit(d.id)} disabled={updateMutation.isPending}>
                    <Save size={14} className="mr-1" /> Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{d.providerName}</div>
                  <div className="text-sm text-muted-foreground">
                    {d.startTime && d.endTime
                      ? `${truncateTime(d.startTime)} – ${truncateTime(d.endTime)}`
                      : d.startTime
                      ? `A partir de ${truncateTime(d.startTime)}`
                      : 'Horário não informado'}
                  </div>
                  {showFinancials && (
                    <div className="text-sm font-medium text-emerald-600 mt-1">{formatCurrency(d.value)}</div>
                  )}
                  {d.observations && <p className="text-xs text-muted-foreground mt-1">{d.observations}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusColors[d.status]}`}>
                    {statusLabels[d.status]}
                  </span>
                  <div className="flex items-center gap-2">
                    {canEdit(d) && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(d)}>
                        <Edit2 size={14} />
                      </Button>
                    )}
                    <Link href={`/diarias/${d.id}`} className="text-xs underline text-muted-foreground">
                      Detalhes
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {canCreate && (
        showCreateForm ? (
          <Card className="border-dashed">
            <CardContent className="p-3">
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Nome *</label>
                  <select
                    required
                    value={createForm.providerId}
                    onChange={e => setCreateForm({ ...createForm, providerId: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="" disabled>Selecione uma pessoa ativa</option>
                    {providers?.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Horário Inicial</label>
                    <Input type="time" value={createForm.startTime} onChange={e => setCreateForm({ ...createForm, startTime: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Horário Final</label>
                    <Input type="time" value={createForm.endTime} onChange={e => setCreateForm({ ...createForm, endTime: e.target.value })} />
                  </div>
                </div>
                {selectedProvider && (
                  <p className="text-xs text-muted-foreground">
                    Valor da diária: {selectedProvider.dailyRate != null
                      ? formatCurrency(selectedProvider.dailyRate)
                      : 'não definido — configure em Pessoas antes de lançar'}
                  </p>
                )}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Observações</label>
                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={createForm.observations}
                    onChange={e => setCreateForm({ ...createForm, observations: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setShowCreateForm(false); resetCreateForm(); }}>
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" disabled={createMutation.isPending}>
                    Salvar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setShowCreateForm(true)}>
            <Plus size={16} className="mr-2" /> Nova Diária
          </Button>
        )
      )}
    </div>
  );
}
