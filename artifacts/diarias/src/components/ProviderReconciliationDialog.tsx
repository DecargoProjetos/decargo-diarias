import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListProviderReconciliation,
  useResolveProviderReconciliation,
  getListProviderReconciliationQueryKey,
  type Provider,
  type ProviderReconciliationCandidate,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

type Props = {
  providers: Provider[];
  onClose: () => void;
  onResolved: () => void;
};

type Action = 'link' | 'separate';

function messageOf(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  const data = err && typeof err === 'object' && 'data' in err ? (err as { data: unknown }).data : null;
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    return (data as { error: string }).error;
  }
  return fallback;
}

export function ProviderReconciliationDialog({ providers, onClose, onResolved }: Props) {
  const queryClient = useQueryClient();
  const list = useListProviderReconciliation();
  const resolve = useResolveProviderReconciliation();
  const [externalId, setExternalId] = useState<string | null>(null);
  const [localId, setLocalId] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  const eligible = useMemo(
    () => providers.filter(p => (p.decargoId.startsWith('local-user:') || p.decargoId.startsWith('manual-')) && !p.localReference),
    [providers],
  );
  const candidates: ProviderReconciliationCandidate[] = list.data ?? [];
  const candidate = candidates.find(c => c.externalId === externalId) ?? null;
  const local = eligible.find(p => String(p.id) === localId) ?? null;
  const pending = resolve.isPending;

  const reset = () => { setExternalId(null); setLocalId(''); setCnpj(''); setEvidence(''); setConfirmed(false); setError(''); };
  const select = (id: string) => { reset(); setExternalId(id); };

  const submit = (action: Action) => {
    if (pending || !candidate || candidate.conflict) return;
    const text = evidence.trim();
    if (text.length < 10 || text.length > 500) { setError('Descreva o documento verificado com 10 a 500 caracteres.'); return; }
    if (!confirmed) { setError('Confirme a verificação documental.'); return; }
    const data: Parameters<typeof resolve.mutate>[0]['data'] = { externalId: candidate.externalId, action, evidence: text, confirmed: true };
    if (action === 'link') {
      const digits = cnpj.replace(/\D/g, '');
      if (!local) { setError('Selecione o prestador local a vincular.'); return; }
      if (digits.length !== 14) { setError('Informe o CNPJ verificado com 14 dígitos.'); return; }
      data.localProviderId = local.id;
      data.verifiedCnpj = digits;
    }
    setError('');
    resolve.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProviderReconciliationQueryKey() });
        reset();
        onResolved();
      },
      onError: err => setError(messageOf(err, 'Não foi possível concluir a conciliação. Tente novamente.')),
    });
  };

  const blocked = !!candidate?.conflict;
  const linkReady = !!local && cnpj.replace(/\D/g, '').length === 14 && !blocked && confirmed && evidence.trim().length >= 10;
  const sepReady = !blocked && candidate?.existingProviderId == null && confirmed && evidence.trim().length >= 10;

  return (
    <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conciliar prestadores do People</DialogTitle>
          <DialogDescription>
            Nunca vincule por ID numérico ou por nome. Vincular preserva histórico, valor da diária, equipe,
            permissões e status de inatividade do prestador local. O CNPJ deve coincidir com documento
            independente; o CNPJ vindo do People, sozinho, não é evidência. Registros remotos já existentes
            só podem ser mesclados se estiverem sem histórico ou configuração (o servidor bloqueia colisões).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground" data-testid="text-reconciliation-count">
            {list.isSuccess ? `${candidates.length} identidade(s) pendente(s)` : 'Identidades pendentes'}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => list.refetch()}
            disabled={list.isFetching || pending} data-testid="button-refresh-reconciliation">
            {list.isFetching ? 'Atualizando…' : 'Atualizar'}
          </Button>
        </div>

        {list.isLoading && (
          <div className="space-y-2" data-testid="loading-reconciliation">
            <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
          </div>
        )}
        {list.isError && (
          <div role="alert" className="space-y-2 text-sm text-destructive" data-testid="error-reconciliation">
            <p>{messageOf(list.error, 'Não foi possível carregar as pendências.')}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => list.refetch()}>Tentar novamente</Button>
          </div>
        )}
        {list.isSuccess && candidates.length === 0 && (
          <p className="rounded-md border p-4 text-sm text-muted-foreground" data-testid="empty-reconciliation">
            Nenhuma identidade pendente de conciliação.
          </p>
        )}

        {candidates.length > 0 && (
          <ul className="space-y-2" aria-label="Identidades pendentes">
            {candidates.map(c => (
              <li key={c.externalId}>
                <button type="button" disabled={pending} onClick={() => select(c.externalId)}
                  aria-pressed={c.externalId === externalId}
                  data-testid={`button-candidate-${c.externalId}`}
                  className={`w-full rounded-md border p-3 text-left text-sm ${c.externalId === externalId ? 'border-primary bg-muted' : ''}`}>
                  <span className="font-medium">{c.name}</span>
                  <span className="block text-muted-foreground">ID People {c.externalId} · CNPJ {c.cnpj ?? 'não informado'}</span>
                  {c.conflict && <span className="block text-destructive">Conflito: {c.conflict}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {candidate && (
          <form onSubmit={(e: FormEvent) => e.preventDefault()} className="space-y-4">
            <fieldset disabled={pending} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3 text-sm" data-testid="panel-remote">
                  <p className="font-medium">People (remoto)</p>
                  <p>{candidate.name}</p>
                  <p>ID: {candidate.externalId}</p>
                  <p>CNPJ: {candidate.cnpj ?? 'não informado'}</p>
                  {candidate.existingProviderId != null && <p>Registro remoto já existente (#{candidate.existingProviderId})</p>}
                  {candidate.existingProviderId != null && (
                    <p className="mt-2 text-muted-foreground">
                      Ao vincular, esse registro remoto será removido somente se estiver vazio e sem alterações próprias.
                      O cadastro local e suas diárias permanecerão.
                    </p>
                  )}
                </div>
                <div className="rounded-md border p-3 text-sm" data-testid="panel-local">
                  <p className="font-medium">Local selecionado</p>
                  {local ? (
                    <>
                      <p>{local.name}</p>
                      <p>CNPJ: {local.cnpj ?? 'não informado'}</p>
                      <p>Equipe: {local.teamName ?? 'sem equipe'}</p>
                      <p>Diária: {local.dailyRate == null ? 'não definida' : Number(local.dailyRate).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                      <p>Status: {local.active ? 'ativo' : 'inativo'}</p>
                    </>
                  ) : <p className="text-muted-foreground">Nenhum selecionado.</p>}
                </div>
              </div>

              {blocked && (
                <p role="alert" className="text-sm text-destructive" data-testid="text-conflict">
                  Conflito: {candidate.conflict}. Vincular e importar estão bloqueados.
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="rec-local">Prestador local habilitado (para vincular)</Label>
                <select id="rec-local" value={localId} onChange={e => setLocalId(e.target.value)}
                  data-testid="select-local-provider"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">Selecione…</option>
                  {eligible.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.teamName ?? 'sem equipe'} · {p.active ? 'ativo' : 'inativo'}
                    </option>
                  ))}
                </select>
                {eligible.length === 0 && <p className="text-xs text-muted-foreground">Nenhum prestador local elegível; só é possível importar como pessoa distinta.</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="rec-cnpj">CNPJ verificado em documento independente (para vincular)</Label>
                <Input id="rec-cnpj" inputMode="numeric" value={cnpj} onChange={e => setCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00" data-testid="input-verified-cnpj" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rec-evidence">Documento verificado (10 a 500 caracteres, sem credenciais)</Label>
                <textarea id="rec-evidence" rows={3} maxLength={500} value={evidence}
                  onChange={e => setEvidence(e.target.value)} data-testid="input-evidence"
                  className="w-full rounded-md border bg-background p-2 text-sm" />
                <p className="text-xs text-muted-foreground">{evidence.trim().length}/500</p>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                  className="mt-1" data-testid="checkbox-confirm-reconciliation" />
                Confirmo que verifiquei a identidade em documento independente e entendo que a decisão altera a identidade do prestador.
              </label>
            </fieldset>

            {error && <p role="alert" className="text-sm text-destructive" data-testid="text-reconciliation-error">{error}</p>}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => submit('separate')}
                disabled={pending || !sepReady} data-testid="button-import-separate">
                {pending ? 'Salvando…' : 'Importar como pessoa distinta'}
              </Button>
              <Button type="button" onClick={() => submit('link')}
                disabled={pending || !linkReady} data-testid="button-link-provider">
                {pending ? 'Salvando…' : 'Vincular ao prestador local'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {!candidate && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Fechar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
