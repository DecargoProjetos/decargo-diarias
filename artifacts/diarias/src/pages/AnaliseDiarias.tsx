import { useMemo, useState } from 'react';
import {
  useGetMe,
  useListTeams,
  useListDiarias,
  useGetDiariasAnaliseSummary,
  listDiariaIds,
  useBulkApproveDiarias,
  useBulkRejectDiarias,
  useApproveDiaria,
  useRejectDiaria,
  useSetDiariaPaymentDate,
  useExportDiarias,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate, statusColors, statusLabels } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2, XCircle, Filter, CalendarClock, FileDown, Loader2,
  Clock, ThumbsUp, ThumbsDown, PackageCheck, X,
} from 'lucide-react';
import { Link } from 'wouter';

const ANALISE_STATUSES = [
  'pendente_aprovacao',
  'em_analise',
  'aprovada',
  'disponivel_exportacao',
  'rejeitada',
  'exportada',
  'paga',
] as const;

interface Filters {
  name: string;
  teamId: string;
  startDate: string;
  endDate: string;
  minValue: string;
  maxValue: string;
  value: string;
  status: string;
}

const EMPTY_FILTERS: Filters = {
  name: '', teamId: '', startDate: '', endDate: '', minValue: '', maxValue: '', value: '', status: '',
};

export default function AnaliseDiarias() {
  const { data: user } = useGetMe();
  const { toast } = useToast();
  const { data: teams } = useListTeams();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<{ ids: number[] } | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [paymentDateTarget, setPaymentDateTarget] = useState<{ id: number; current: string | null } | null>(null);
  const [paymentDateValue, setPaymentDateValue] = useState('');
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{ title: string; description: string } | null>(null);

  const queryFilters = useMemo(() => ({
    name: filters.name || undefined,
    teamId: filters.teamId ? Number(filters.teamId) : undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    minValue: filters.minValue ? Number(filters.minValue) : undefined,
    maxValue: filters.maxValue ? Number(filters.maxValue) : undefined,
    value: filters.value ? Number(filters.value) : undefined,
    status: (filters.status || undefined) as any,
  }), [filters]);

  const { data: summary } = useGetDiariasAnaliseSummary(queryFilters);
  const { data: page1, isLoading, refetch } = useListDiarias({ ...queryFilters, page, pageSize: 20 });

  const approve = useApproveDiaria();
  const reject = useRejectDiaria();
  const bulkApprove = useBulkApproveDiarias();
  const bulkReject = useBulkRejectDiarias();
  const setPaymentDate = useSetDiariaPaymentDate();
  const exportMutation = useExportDiarias();
  const [selectingAllFiltered, setSelectingAllFiltered] = useState(false);

  if (user && user.role !== 'admin') {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <h1 className="text-xl font-bold mb-2">Acesso restrito</h1>
        <p className="text-muted-foreground">Esta tela é exclusiva para administradores.</p>
      </div>
    );
  }

  const rows = page1?.data ?? [];
  const total = page1?.total ?? 0;
  const totalPages = page1?.totalPages ?? 1;

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        rows.forEach((r) => next.delete(r.id));
      } else {
        rows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }

  function refreshAll() {
    refetch();
    setSelected(new Set());
  }

  function handleApprove(ids: number[]) {
    if (ids.length === 1) {
      approve.mutate({ id: ids[0], data: {} }, {
        onSuccess: () => { toast({ title: 'Diária aprovada.' }); refreshAll(); },
        onError: (err: any) => toast({ title: 'Erro ao aprovar', description: err?.message, variant: 'destructive' }),
      });
      return;
    }
    bulkApprove.mutate({ data: { diariaIds: ids } }, {
      onSuccess: (res) => {
        setLastResult({
          title: 'Aprovação em lote concluída',
          description: `${res.succeeded.length} aprovadas. ${res.failed.length} não puderam ser aprovadas.`,
        });
        refreshAll();
      },
      onError: (err: any) => toast({ title: 'Erro na aprovação em lote', description: err?.message, variant: 'destructive' }),
    });
  }

  function openReject(ids: number[]) {
    setRejectTarget({ ids });
    setRejectNote('');
  }

  function confirmReject() {
    if (!rejectTarget) return;
    if (!rejectNote.trim()) {
      toast({ title: 'Motivo da reprovação é obrigatório', variant: 'destructive' });
      return;
    }
    const { ids } = rejectTarget;
    if (ids.length === 1) {
      reject.mutate({ id: ids[0], data: { note: rejectNote } }, {
        onSuccess: () => { toast({ title: 'Diária reprovada.' }); setRejectTarget(null); refreshAll(); },
        onError: (err: any) => toast({ title: 'Erro ao reprovar', description: err?.message, variant: 'destructive' }),
      });
      return;
    }
    bulkReject.mutate({ data: { diariaIds: ids, note: rejectNote } }, {
      onSuccess: (res) => {
        setRejectTarget(null);
        setLastResult({
          title: 'Reprovação em lote concluída',
          description: `${res.succeeded.length} reprovadas. ${res.failed.length} não puderam ser reprovadas.`,
        });
        refreshAll();
      },
      onError: (err: any) => toast({ title: 'Erro na reprovação em lote', description: err?.message, variant: 'destructive' }),
    });
  }

  async function selectAllFiltered() {
    setSelectingAllFiltered(true);
    try {
      const res = await listDiariaIds(queryFilters);
      setSelected(new Set(res.ids));
      toast({ title: `${res.total} diária(s) selecionada(s) (todas as filtradas).` });
    } catch (err: any) {
      toast({ title: 'Erro ao selecionar diárias filtradas', description: err?.message, variant: 'destructive' });
    } finally {
      setSelectingAllFiltered(false);
    }
  }

  function openPaymentDate(id: number, current: string | null) {
    setPaymentDateTarget({ id, current });
    setPaymentDateValue(current ? current.slice(0, 10) : '');
  }

  function confirmPaymentDate() {
    if (!paymentDateTarget || !paymentDateValue) return;
    setPaymentDate.mutate(
      { id: paymentDateTarget.id, data: { paymentDate: paymentDateValue } },
      {
        onSuccess: () => { toast({ title: 'Data de pagamento atualizada.' }); setPaymentDateTarget(null); refreshAll(); },
        onError: (err: any) => toast({ title: 'Erro ao atualizar data', description: err?.response?.data?.error ?? err?.message, variant: 'destructive' }),
      },
    );
  }

  function handleExport() {
    const ids = [...selected];
    if (!ids.length) return;
    exportMutation.mutate({ data: { diariaIds: ids } }, {
      onSuccess: (res) => {
        setExportConfirmOpen(false);
        const skippedCount = res.skipped?.length ?? 0;
        setLastResult({
          title: 'Exportação para o DECARGO People concluída',
          description: skippedCount > 0
            ? `${res.exported} exportadas com sucesso (lote ${res.integrationRef}). ${skippedCount} não puderam ser exportadas.`
            : `${res.exported} diárias exportadas com sucesso. Lote: ${res.integrationRef}.`,
        });
        refreshAll();
      },
      onError: (err: any) => {
        setExportConfirmOpen(false);
        toast({
          title: 'Erro na exportação',
          description: err?.response?.data?.error ?? err?.message,
          variant: 'destructive',
        });
      },
    });
  }

  const isBusy = approve.isPending || reject.isPending || bulkApprove.isPending || bulkReject.isPending || exportMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Análise de Diárias</h1>
        <p className="text-muted-foreground mt-1">
          Aprove, reprove e exporte diárias para o DECARGO People.
        </p>
      </div>

      {/* Dashboard indicators */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <IndicatorCard
          icon={Clock}
          iconClass="text-orange-600 bg-orange-100"
          label="Pendentes"
          count={summary?.pendentesCount ?? 0}
          value={summary?.pendentesValue}
        />
        <IndicatorCard
          icon={ThumbsUp}
          iconClass="text-teal-600 bg-teal-100"
          label="Aprovadas (a exportar)"
          count={summary?.aprovadasCount ?? 0}
          value={summary?.aprovadasValue}
        />
        <IndicatorCard
          icon={ThumbsDown}
          iconClass="text-red-600 bg-red-100"
          label="Reprovadas"
          count={summary?.reprovadasCount ?? 0}
          value={summary?.reprovadasValue}
        />
        <IndicatorCard
          icon={PackageCheck}
          iconClass="text-indigo-600 bg-indigo-100"
          label="Exportadas"
          count={summary?.exportadasCount ?? 0}
          value={summary?.exportadasValue}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end bg-muted/20">
          <div className="space-y-1.5">
            <label className="text-xs font-medium flex items-center gap-1"><Filter size={12} /> Nome do prestador</label>
            <Input className="h-9 w-48" placeholder="Buscar por nome..." value={filters.name}
              onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, name: e.target.value })); }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Equipe</label>
            <select
              className="flex h-9 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={filters.teamId}
              onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, teamId: e.target.value })); }}
            >
              <option value="">Todas</option>
              {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">De</label>
            <Input type="date" className="h-9 w-36" value={filters.startDate}
              onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, startDate: e.target.value })); }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Até</label>
            <Input type="date" className="h-9 w-36" value={filters.endDate}
              onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, endDate: e.target.value })); }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Valor exato</label>
            <Input type="number" step="0.01" className="h-9 w-28" value={filters.value}
              onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, value: e.target.value })); }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Valor mín.</label>
            <Input type="number" step="0.01" className="h-9 w-24" value={filters.minValue} disabled={!!filters.value}
              onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, minValue: e.target.value })); }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Valor máx.</label>
            <Input type="number" step="0.01" className="h-9 w-24" value={filters.maxValue} disabled={!!filters.value}
              onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, maxValue: e.target.value })); }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Status</label>
            <select
              className="flex h-9 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={filters.status}
              onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, status: e.target.value })); }}
            >
              <option value="">Todos</option>
              {ANALISE_STATUSES.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
            </select>
          </div>
          {(filters.name || filters.teamId || filters.startDate || filters.endDate || filters.minValue || filters.maxValue || filters.value || filters.status) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>
              <X size={14} className="mr-1" /> Limpar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-primary/5 border border-primary/20 rounded-md px-4 py-3">
          <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={isBusy} onClick={() => handleApprove([...selected])}>
            <CheckCircle2 size={16} className="mr-2" /> Aprovar selecionadas
          </Button>
          <Button size="sm" variant="destructive" disabled={isBusy} onClick={() => openReject([...selected])}>
            <XCircle size={16} className="mr-2" /> Reprovar selecionadas
          </Button>
          <Button size="sm" variant="outline" disabled={isBusy} onClick={() => setExportConfirmOpen(true)}>
            <FileDown size={16} className="mr-2" /> Exportar selecionadas
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Diárias ({total})</CardTitle>
          {total > rows.length && (
            <Button size="sm" variant="outline" disabled={selectingAllFiltered} onClick={selectAllFiltered}>
              {selectingAllFiltered ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
              Selecionar todas as {total} filtradas
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">
              <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">
              Nenhuma diária encontrada com os filtros atuais.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox checked={allOnPageSelected} onCheckedChange={togglePage} />
                    </TableHead>
                    <TableHead>Prestador</TableHead>
                    <TableHead>Equipe</TableHead>
                    <TableHead>Data trabalhada</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Data pagamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado por</TableHead>
                    <TableHead>Aprovado por</TableHead>
                    <TableHead>Exportado por</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((d) => {
                    const isLocked = d.status === 'exportada' || d.status === 'paga' || d.status === 'cancelada';
                    const canApproveReject = d.status === 'pendente_aprovacao' || d.status === 'em_analise';
                    return (
                      <TableRow key={d.id} data-state={selected.has(d.id) ? 'selected' : undefined}>
                        <TableCell>
                          <Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggleRow(d.id)} />
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link href={`/diarias/${d.id}`} className="hover:underline">{d.providerName}</Link>
                        </TableCell>
                        <TableCell>{d.teamName}</TableCell>
                        <TableCell>{formatDate(d.workDate)}</TableCell>
                        <TableCell className="font-medium text-emerald-700">{formatCurrency(d.value)}</TableCell>
                        <TableCell>
                          <button
                            className="text-left hover:underline disabled:no-underline disabled:cursor-not-allowed disabled:text-muted-foreground"
                            disabled={isLocked}
                            onClick={() => openPaymentDate(d.id, d.paymentDate ?? null)}
                          >
                            {d.paymentDate ? formatDate(d.paymentDate) : (isLocked ? '---' : 'Definir data')}
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColors[d.status]}`}>
                            {statusLabels[d.status]}
                          </span>
                          {d.actionNote && (
                            <p className="text-xs text-muted-foreground mt-1 max-w-[160px] truncate" title={d.actionNote}>
                              {d.actionNote}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.createdByName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.approvedByName ?? '---'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.exportedByName ?? '---'}</TableCell>
                        <TableCell className="text-right">
                          {canApproveReject && (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" className="h-8 px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={isBusy} onClick={() => handleApprove([d.id])}>
                                <CheckCircle2 size={14} />
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 px-2 text-red-700 border-red-200 hover:bg-red-50" disabled={isBusy} onClick={() => openReject([d.id])}>
                                <XCircle size={14} />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                <span>Página {page} de {totalPages}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reject reason dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar {rejectTarget && rejectTarget.ids.length > 1 ? `${rejectTarget.ids.length} diárias` : 'diária'}</DialogTitle>
            <DialogDescription>Informe o motivo da reprovação. Este campo é obrigatório.</DialogDescription>
          </DialogHeader>
          <textarea
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Descreva o motivo..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={isBusy} onClick={confirmReject}>Confirmar reprovação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment date dialog */}
      <Dialog open={!!paymentDateTarget} onOpenChange={(open) => { if (!open) setPaymentDateTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock size={18} /> Data de pagamento</DialogTitle>
            <DialogDescription>Necessária antes da exportação para o DECARGO People.</DialogDescription>
          </DialogHeader>
          <Input type="date" value={paymentDateValue} onChange={(e) => setPaymentDateValue(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDateTarget(null)}>Cancelar</Button>
            <Button disabled={!paymentDateValue || setPaymentDate.isPending} onClick={confirmPaymentDate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export confirmation dialog */}
      <Dialog open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileDown size={18} /> Exportar para o DECARGO People</DialogTitle>
            <DialogDescription>
              {selected.size} diária(s) selecionada(s) serão enviadas ao DECARGO People. Diárias sem status "Aprovada"
              ou sem data de pagamento preenchida serão rejeitadas na exportação.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportConfirmOpen(false)}>Cancelar</Button>
            <Button disabled={exportMutation.isPending} onClick={handleExport}>
              {exportMutation.isPending ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
              Confirmar exportação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result summary dialog (bulk approve/reject/export) */}
      <Dialog open={!!lastResult} onOpenChange={(open) => { if (!open) setLastResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lastResult?.title}</DialogTitle>
            <DialogDescription>{lastResult?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setLastResult(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IndicatorCard({
  icon: Icon, iconClass, label, count, value,
}: { icon: any; iconClass: string; label: string; count: number; value?: number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`p-3 rounded-lg ${iconClass}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{count}</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(value ?? 0)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
