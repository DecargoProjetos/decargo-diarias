import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetMe, useListUsers, useListProviders, useListTeams,
  useSyncUsers, useSyncProviders,
  useGetLatestUserSyncReport, getGetLatestUserSyncReportQueryKey,
  useListUserSyncReports, getListUserSyncReportsQueryKey,
  useGetUserSyncReport, getGetUserSyncReportQueryKey,
  useUpdateUser, useDeleteUser, useUpdateProvider, useDeleteProvider,
  getListUsersQueryKey, getListProvidersQueryKey,
  type UserSyncResult, type SyncResult,
} from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, CheckCircle2, XCircle, Edit2, Trash2, Save, X, UserPlus } from 'lucide-react';
import { ManualPersonDialog } from '@/components/ManualPersonDialog';
import { EnableDiariasDialog } from '@/components/EnableDiariasDialog';
import { ProviderReconciliationDialog } from '@/components/ProviderReconciliationDialog';
import { PeopleConfirmationDialog } from '@/components/PeopleConfirmationDialog';
import { buildPeopleRows, type PersonTipo, type PersonRow } from '@/lib/personIdentity';
import { UserSyncConflictReport } from '@/components/UserSyncConflictReport';

// Unified "Pessoas" view — funcionários (users) e prestadores estão ambos
// vinculados a equipes e prestadores se reportam a funcionários, então
// fazem sentido numa única lista com uma coluna de Tipo. Cada linha guarda
// seu id de origem (userId/providerId) para rotear edição/exclusão para o
// endpoint correto (/api/users/:id ou /api/providers/:id).
//
// "Tipo" distingue não só a origem do registro (funcionário x prestador),
// mas também o papel de acesso do funcionário (admin/gestor/funcionário),
// já que isso é o que o usuário enxerga como "tipo de pessoa" no filtro.
const formatCurrency = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TIPO_BADGE_CLASSES: Record<PersonTipo, string> = {
  Administrador: 'bg-amber-50 text-amber-700',
  Gestor: 'bg-teal-50 text-teal-700',
  Funcionário: 'bg-blue-50 text-blue-700',
  Prestador: 'bg-purple-50 text-purple-700',
};

// Normaliza para comparar nomes ignorando acentos/caixa, já que a pesquisa
// deve casar "Edu" com "Eduarda", "Eduardo" etc. em qualquer posição do nome.
const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export default function PeopleList() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetMe();
  const isAdmin = currentUser?.role === 'admin';
  const [reportPage, setReportPage] = useState(1);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const reportParams = { page: reportPage, pageSize: 10 };
  const reportHistory = useListUserSyncReports(reportParams, {
    query: {
      queryKey: [...getListUserSyncReportsQueryKey(reportParams), currentUser?.id],
      enabled: isAdmin, staleTime: 0, gcTime: 0, refetchOnMount: 'always',
    },
  });
  const selectedReport = useGetUserSyncReport(selectedReportId ?? '', {
    query: {
      queryKey: [...getGetUserSyncReportQueryKey(selectedReportId ?? ''), currentUser?.id],
      enabled: isAdmin && selectedReportId !== null,
      staleTime: 0, gcTime: 0, refetchOnMount: 'always',
    },
  });
  const savedUserSyncReport = useGetLatestUserSyncReport({
    query: {
      queryKey: [...getGetLatestUserSyncReportQueryKey(), currentUser?.id],
      enabled: isAdmin,
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: 'always',
    },
  });
  useEffect(() => {
    setSelectedReportId(null);
    setReportPage(1);
    setUserSyncResult(null);
  }, [currentUser?.id]);
  const activeReportQuery = selectedReportId ? selectedReport : savedUserSyncReport;
  const reportSnapshot = selectedReportId ? selectedReport.data : savedUserSyncReport.data?.report;
  // Drop displayed evidence when its retention window ends, even while the page stays open.
  const [reportClock, setReportClock] = useState(Date.now());
  useEffect(() => {
    if (!reportSnapshot) return;
    const remaining = new Date(reportSnapshot.expiresAt).getTime() - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setReportClock(Date.now()),
      Math.min(remaining, 86400_000));
    return () => clearTimeout(timer);
  }, [reportSnapshot, reportClock]);
  const reportExpired = !!reportSnapshot && new Date(reportSnapshot.expiresAt).getTime() <= Math.max(reportClock, Date.now());
  const visibleReport = reportExpired || activeReportQuery.isError ? null : reportSnapshot ?? null;

  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useListUsers({ query: { enabled: isAdmin, queryKey: ['listUsers'] } });
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
  const [editingSnapshot, setEditingSnapshot] = useState<PersonRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', teamId: '', dailyRate: '' });

  const [filterTipo, setFilterTipo] = useState<'todos' | PersonTipo>('todos');
  const [filterTeamId, setFilterTeamId] = useState<'todas' | string>('todas');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'ativo' | 'inativo'>('todos');
  const [searchName, setSearchName] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [enablingPerson, setEnablingPerson] = useState<PersonRow | null>(null);
  const [isReconciliationOpen, setIsReconciliationOpen] = useState(false);
  const [confirmationPerson, setConfirmationPerson] = useState<{ providerId: number; name: string } | null>(null);
  const [userSyncResult, setUserSyncResult] = useState<UserSyncResult | null>(null);
  useEffect(() => {
    setUserSyncResult(null);
    setUserSyncFailed(false);
  }, [currentUser?.id]);
  const [userSyncFailed, setUserSyncFailed] = useState(false);
  const [locatedUserId, setLocatedUserId] = useState<number | null>(null);

  const rows = useMemo(() => buildPeopleRows(users ?? [], providers ?? []), [users, providers]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = normalize(searchName.trim());
    return rows.filter(row => {
      if (locatedUserId !== null && row.key !== `user-${locatedUserId}`) return false;
      if (filterTipo !== 'todos' && row.tipo !== filterTipo) return false;
      if (filterTeamId !== 'todas' && row.teamId?.toString() !== filterTeamId) return false;
      if (filterStatus === 'ativo' && !row.active) return false;
      if (filterStatus === 'inativo' && row.active) return false;
      if (normalizedSearch &&
          !normalize(row.name).includes(normalizedSearch) &&
          !normalize(row.email ?? '').includes(normalizedSearch)) return false;
      return true;
    });
  }, [rows, filterTipo, filterTeamId, filterStatus, searchName, locatedUserId]);

  const refetchAll = async () => {
    await Promise.all([
      refetchUsers(), refetchProviders(),
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListProvidersQueryKey() }),
      queryClient.invalidateQueries({ queryKey: ['listProviders'] }),
    ]);
  };
  const isUpdating = updateUser.isPending || updateProvider.isPending;

  // Registros de funcionário (independente do papel: admin/gestor/funcionário)
  // vivem em /api/users; prestadores vivem em /api/providers. O tipo exibido
  // não basta para decidir isso sozinho, então usamos o prefixo da key.
  const isUserRow = (row: PersonRow) => row.key.startsWith('user-');

  const startEdit = (row: PersonRow) => {
    setEditingKey(row.key);
    setEditingSnapshot(row);
    setEditForm({
      name: row.name,
      email: row.email ?? '',
      teamId: row.teamId?.toString() || '',
      dailyRate: row.dailyRate != null ? String(row.dailyRate) : '',
    });
  };

  const handleSaveEdit = (row: PersonRow) => {
    if (isUpdating || !editingSnapshot || editingSnapshot.key !== row.key) return;
    row = editingSnapshot;
    const email = editForm.email.trim().toLowerCase();
    if (!isUserRow(row) && email !== (row.email?.trim().toLowerCase() ?? '')) {
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast({ title: 'Informe um e-mail válido.', variant: 'destructive' });
        return;
      }
      if (!confirm(email
        ? `Confirme que ${email} pertence a ${row.name}. A conta com esse e-mail poderá acessar as diárias deste prestador. Não confirme apenas por nome ou número de cadastro.`
        : `Remover o e-mail de ${row.name} pode interromper o acesso dessa pessoa às diárias. Continuar?`)) return;
    }
    const teamId = editForm.teamId === '' ? null : Number(editForm.teamId);
    const onDone = async () => {
      await refetchAll();
      toast({ title: `${row.tipo} atualizado.` });
      setEditingKey(null);
      setEditingSnapshot(null);
    };
    const onFail = (err: any) => {
      toast({ title: 'Erro ao atualizar', description: err?.message, variant: 'destructive' });
      if (err?.status === 409) {
        setEditingKey(null);
        setEditingSnapshot(null);
        void refetchAll();
      }
    };

    if (isUserRow(row)) {
      // The server owns link resolution and both writes. Versions come from
      // the snapshot captured when the editor opened, not a later refetch.
      updateUser.mutate({ id: row.sourceId, data: {
        name: editForm.name, teamId,
        expectedUpdatedAt: row.updatedAt,
        expectedProviderId: row.linkedProviderId ?? null,
        expectedProviderUpdatedAt: row.linkedProviderUpdatedAt ?? null,
        ...(row.linkedProviderId != null ? {
          dailyRate: editForm.dailyRate.trim() === '' ? null : Number(editForm.dailyRate),
        } : {}),
      } }, {
        onSuccess: onDone,
        onError: onFail,
      });
    } else {
      const dailyRate = editForm.dailyRate.trim() === '' ? null : Number(editForm.dailyRate);
      updateProvider.mutate(
        { id: row.sourceId, data: { name: editForm.name, email: email || null, teamId, dailyRate,
          expectedUpdatedAt: row.updatedAt } },
        { onSuccess: onDone, onError: onFail }
      );
    }
  };

  const handleToggleActive = (row: PersonRow) => {
    if (isUpdating) return;
    const onDone = async () => {
      await refetchAll();
      toast({ title: row.active ? `${row.tipo} desativado.` : `${row.tipo} ativado.` });
    };
    const onFail = (err: any) => {
      toast({ title: 'Erro ao atualizar status', description: err?.message, variant: 'destructive' });
      if (err?.status === 409) void refetchAll();
    };

    if (isUserRow(row)) {
      updateUser.mutate({ id: row.sourceId, data: { active: !row.active,
        expectedUpdatedAt: row.updatedAt,
        expectedProviderId: row.linkedProviderId ?? null,
        expectedProviderUpdatedAt: row.linkedProviderUpdatedAt ?? null,
      } }, {
        onSuccess: onDone,
        onError: onFail,
      });
    } else {
      updateProvider.mutate({ id: row.sourceId, data: { active: !row.active,
        expectedUpdatedAt: row.updatedAt } }, { onSuccess: onDone, onError: onFail });
    }
  };

  const handleDelete = (row: PersonRow) => {
    if (row.sourceId === currentUser?.id && isUserRow(row)) return;
    if (!confirm(`Tem certeza que deseja excluir ${isUserRow(row) ? 'este funcionário' : 'este prestador'}? Esta ação não pode ser desfeita.`)) return;

    const onDone = async () => {
      // Remove the deleted records from every cached Pessoas query before
      // refetching. This prevents a successful deletion from leaving the row
      // visible while React Query still holds the previous response.
      queryClient.setQueriesData<any[]>(
        { queryKey: ['listUsers'] },
        current => current?.filter(user => user.id !== row.sourceId),
      );
      queryClient.setQueriesData<any[]>(
        { queryKey: ['/api/providers'] },
        current => current?.filter(provider =>
          provider.id !== row.sourceId && provider.id !== row.linkedProviderId
        ),
      );
      await refetchAll();
      toast({ title: `${row.tipo} excluído.` });
    };
    const onFail = (err: any) => toast({ title: 'Erro ao excluir', description: err?.message, variant: 'destructive' });

    const deleteUserRow = () => {
      deleteUser.mutate({ id: row.sourceId }, { onSuccess: onDone, onError: onFail });
    };

    if (isUserRow(row)) {
      if (row.linkedProviderId != null) {
        // Apaga primeiro o provider vinculado — se ele já tiver diárias
        // lançadas, a exclusão falha por causa da restrição de chave
        // estrangeira e o usuário permanece intacto, em vez de ficar um
        // provider órfão sem ninguém para representá-lo.
        deleteProvider.mutate({ id: row.linkedProviderId }, { onSuccess: deleteUserRow, onError: onFail });
      } else {
        deleteUserRow();
      }
    } else {
      deleteProvider.mutate({ id: row.sourceId }, { onSuccess: onDone, onError: onFail });
    }
  };

  const isLoading = usersLoading || providersLoading;

  const handleSync = () => {
    setSelectedReportId(null);
    setReportPage(1);
    setUserSyncResult(null);
    setUserSyncFailed(false);
    Promise.allSettled([
      new Promise<UserSyncResult>((resolve, reject) => syncUsers.mutate(undefined, { onSuccess: resolve, onError: reject })),
      new Promise<SyncResult>((resolve, reject) => syncProviders.mutate(undefined, { onSuccess: resolve, onError: reject })),
    ]).then(async ([usersResult, providersResult]) => {
      setUserSyncResult(usersResult.status === 'fulfilled' ? usersResult.value : null);
      setUserSyncFailed(usersResult.status === 'rejected');
      // A read-only refresh also after failures: another completed run may exist.
      const saved = await savedUserSyncReport.refetch();
      void queryClient.invalidateQueries({ queryKey: getListUserSyncReportsQueryKey() });
      if (saved.isSuccess && saved.data.report) setUserSyncResult(null);
      const pending = providersResult.status === 'fulfilled' ? providersResult.value?.pending ?? 0 : 0;
      const conflicts = usersResult.status === 'fulfilled' ? usersResult.value?.conflicts ?? 0 : 0;
      const failures = [usersResult, providersResult].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );
      if (failures.length === 0) {
        const newCount =
          (usersResult.status === 'fulfilled' ? usersResult.value?.created ?? 0 : 0) +
          (providersResult.status === 'fulfilled' ? providersResult.value?.created ?? 0 : 0);
        toast({
          title: 'Sincronização concluída',
          description: pending || conflicts
            ? `${newCount} importada(s); ${pending} prestador(es) aguardando revisão de identidade; ${conflicts} conflito(s) de funcionário ignorado(s).`
            : newCount > 0
            ? `${newCount} nova(s) pessoa(s) importada(s) do DECARGO People.`
            : 'Nenhuma pessoa nova encontrada no DECARGO People.',
        });
      } else {
        const details = failures.map(f => f.reason?.message).filter(Boolean).join(' | ');
        toast({
          title: failures.length === 2 ? 'Erro na sincronização' : 'Sincronização parcial',
          description: `${details || 'Não foi possível sincronizar com o DECARGO People.'}${pending ? ` ${pending} prestador(es) aguardam revisão de identidade.` : ''}${conflicts ? ` ${conflicts} conflito(s) de funcionário ignorado(s).` : ''}`,
          variant: 'destructive',
        });
      }
      if (pending > 0) setIsReconciliationOpen(true);
      refetchAll();
    });
  };

  const isSyncing = syncUsers.isPending || syncProviders.isPending;

  if (!isAdmin) {
    return <div>Acesso negado. Apenas administradores.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Pessoas</h1>
          <p className="text-muted-foreground mt-1">Funcionários e prestadores sincronizados com DECARGO People.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsCreateOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Cadastrar pessoa
          </Button>
          <Button variant="outline" onClick={() => setIsReconciliationOpen(true)}>
            Revisar vínculos People
          </Button>
          <Button onClick={handleSync} disabled={isSyncing} className="bg-indigo-600 hover:bg-indigo-700">
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            Sincronizar com DECARGO People
          </Button>
        </div>
      </div>

      {isAdmin && <UserSyncConflictReport
        result={selectedReportId ? visibleReport?.result ?? null : userSyncResult ?? visibleReport?.result ?? null}
        savedReport={!selectedReportId && userSyncResult ? null : visibleReport}
        loading={activeReportQuery.isFetching}
        historyFailed={reportHistory.isError || (activeReportQuery.isError &&
          !(selectedReportId !== null && selectedReport.error?.status === 404))}
        unavailable={reportExpired || (selectedReportId !== null && selectedReport.isError && selectedReport.error?.status === 404)}
        history={reportHistory.data ?? null}
        historyLoading={reportHistory.isFetching}
        page={reportPage}
        selectedReportId={selectedReportId}
        onPageChange={setReportPage}
        onSelect={id => {
          setUserSyncResult(null);
          setSelectedReportId(id);
        }}
        onReload={() => {
          void reportHistory.refetch();
          void activeReportQuery.refetch().then(saved => {
            if (saved.isSuccess) setUserSyncResult(null);
          });
        }}
        failed={userSyncFailed}
        onLocate={localUserId => {
          setEditingKey(null);
          setSearchName('');
          setFilterTipo('todos');
          setFilterTeamId('todas');
          setFilterStatus('todos');
          setLocatedUserId(localUserId);
        }} />}
      {locatedUserId !== null && <div className="flex items-center gap-3 text-sm" role="status">
        Exibindo somente a conta local Diárias #{locatedUserId}, inclusive se inativa.
        <Button variant="outline" size="sm" onClick={() => setLocatedUserId(null)}>Mostrar todas as pessoas</Button>
      </div>}

      {isReconciliationOpen && (
        <ProviderReconciliationDialog providers={providers ?? []}
          onClose={() => setIsReconciliationOpen(false)}
          onResolved={() => {
            toast({ title: 'Identidade resolvida.', description: 'Os dados locais foram preservados.' });
            void refetchAll();
            void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
            void queryClient.invalidateQueries({ queryKey: getListProvidersQueryKey() });
          }} />
      )}

      {isCreateOpen && (
        <ManualPersonDialog teams={teams ?? []} existingPeople={rows}
          onClose={() => setIsCreateOpen(false)}
          onLocateExisting={person => {
            setLocatedUserId(null);
            setIsCreateOpen(false);
            setEditingKey(null);
            setSearchName(person.email?.trim() || person.name);
            setFilterTipo('todos');
            setFilterTeamId('todas');
            setFilterStatus('todos');
          }}
          onRefresh={() => { void refetchAll(); }}
          onCreated={() => {
          setLocatedUserId(null);
          setIsCreateOpen(false);
          setSearchName('');
          setFilterTipo('todos');
          setFilterTeamId('todas');
          setFilterStatus('todos');
          toast({ title: 'Pessoa cadastrada com sucesso.' });
          void queryClient.invalidateQueries({ queryKey: ['listUsers'] });
          void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListProvidersQueryKey() });
          }} />
      )}

      {enablingPerson && (
        <EnableDiariasDialog person={enablingPerson}
          onClose={() => setEnablingPerson(null)}
          onEnabled={() => {
            setEnablingPerson(null);
            toast({ title: 'Diárias habilitadas.', description: 'Cadastro e permissões preservados. Exportação bloqueada até validar o vínculo com o People.' });
            void refetchAll();
            void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
            void queryClient.invalidateQueries({ queryKey: getListProvidersQueryKey() });
          }}
          onConflict={() => { void refetchAll(); }} />
      )}
      {isAdmin && confirmationPerson && (
        <PeopleConfirmationDialog key={confirmationPerson.providerId}
          {...confirmationPerson} onClose={() => setConfirmationPerson(null)} />
      )}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <Input
              placeholder="Pesquisar por nome ou e-mail..."
              value={searchName}
              onChange={e => { setLocatedUserId(null); setSearchName(e.target.value); }}
              className="h-9 sm:max-w-xs"
            />
            <select
              className="h-9 rounded border border-input bg-background px-2 text-sm shadow-sm"
              value={filterTipo}
              onChange={e => { setLocatedUserId(null); setFilterTipo(e.target.value as 'todos' | PersonTipo); }}
            >
              <option value="todos">Todos os tipos</option>
              <option value="Administrador">Administrador</option>
              <option value="Gestor">Gestor</option>
              <option value="Funcionário">Funcionário</option>
              <option value="Prestador">Prestador</option>
            </select>
            <select
              className="h-9 rounded border border-input bg-background px-2 text-sm shadow-sm"
              value={filterTeamId}
              onChange={e => { setLocatedUserId(null); setFilterTeamId(e.target.value); }}
            >
              <option value="todas">Todas as equipes</option>
              {teams?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select
              className="h-9 rounded border border-input bg-background px-2 text-sm shadow-sm"
              value={filterStatus}
              onChange={e => { setLocatedUserId(null); setFilterStatus(e.target.value as 'todos' | 'ativo' | 'inativo'); }}
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
                <TableHead>Tipo</TableHead>
                <TableHead>DECARGO ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead>Valor da Diária</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última Sincronização</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center h-24">Carregando...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                    Nenhuma pessoa sincronizada ainda. Clique em "Sincronizar com DECARGO People".
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                    Nenhuma pessoa encontrada com os filtros selecionados.
                  </TableCell>
                </TableRow>
              ) : filteredRows.map(row => {
                const isEditing = editingKey === row.key;
                const isUserRow = row.key.startsWith('user-');
                const isSelf = isUserRow && row.sourceId === currentUser?.id;
                return (
                  <TableRow key={row.key} className={!row.active ? 'opacity-60' : ''}>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_BADGE_CLASSES[row.tipo]}`}>
                        {row.tipo}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.decargoId}</TableCell>
                    <TableCell className="font-medium">
                      {isEditing ? (
                        <div className="space-y-2 max-w-xs">
                          <Input
                            aria-label="Nome da pessoa"
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            className="h-8"
                          />
                          {!isUserRow && <>
                            <Input
                              type="email"
                              aria-label="E-mail confirmado do prestador"
                              placeholder="E-mail confirmado da pessoa"
                              value={editForm.email}
                              onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                              className="h-8"
                            />
                            <p className="text-xs text-muted-foreground">
                              Use o e-mail da conta DECARGO ID somente após confirmar que pertence a esta pessoa.
                            </p>
                          </>}
                        </div>
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
                      {isEditing && (!isUserRow || row.linkedProviderId != null) ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.dailyRate}
                          onChange={e => setEditForm({ ...editForm, dailyRate: e.target.value })}
                          placeholder="0,00"
                          className="h-8 max-w-28"
                        />
                      ) : row.dailyRate != null ? (
                        <div>{formatCurrency(row.dailyRate)}
                          {row.localOnly && <div className="text-xs text-muted-foreground">Vínculo local · exportação bloqueada</div>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleActive(row)}
                        disabled={isSelf || isUpdating || editingKey !== null}
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
                            <Button size="icon" variant="ghost" onClick={() => setEditingKey(null)} disabled={isUpdating}><X size={16} /></Button>
                            <Button size="icon" variant="ghost" onClick={() => handleSaveEdit(row)} disabled={!editForm.name.trim() || isUpdating}><Save size={16} /></Button>
                          </>
                        ) : (
                          <>
                            {isAdmin && (!isUserRow || row.linkedProviderId != null) && (
                              <Button size="sm" variant="outline" onClick={() => setConfirmationPerson({
                                providerId: isUserRow ? row.linkedProviderId! : row.sourceId,
                                name: row.name,
                              })}>
                                Confirmação People
                              </Button>
                            )}
                            {isUserRow && row.linkedProviderId == null && (
                              <Button size="sm" variant="outline" onClick={() => setEnablingPerson(row)}>
                                Habilitar diárias
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => startEdit(row)} disabled={isUpdating}>
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
