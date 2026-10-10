import { useEffect, useRef, useState } from 'react';
import {
  previewExportCorrection, resolveExportCorrection,
  type ExportCorrectionPreview, type ExportCorrectionRow, type ExportCorrectionItem,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Loader2, UserCheck } from 'lucide-react';

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 2147483647;
const isStr = (v: unknown): v is string => typeof v === 'string';
const nullableString = (v: unknown) => v === null || isStr(v);
const unique = (ids: number[]) => new Set(ids).size === ids.length;
function validDate(v: unknown) {
  if (!isStr(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}

function validPreview(p: ExportCorrectionPreview | null | undefined, ids: number[]): p is ExportCorrectionPreview {
  if (!p || !Array.isArray(p.rows) || !Array.isArray(p.skipped) || !Array.isArray(p.providers) || !Array.isArray(p.types)) return false;
  const rowIds = p.rows.map((r) => r?.id); const skipIds = p.skipped.map((s) => s?.id);
  const all = [...rowIds, ...skipIds];
  return all.length === ids.length && all.every((id) => isId(id) && ids.includes(id)) && unique(all)
    && p.rows.every((r) => isId(r.providerId) && isStr(r.providerName) && isStr(r.updatedAt) && r.updatedAt.length > 0
      && r.updatedAt.length <= 100 && (r.typeId === null || isId(r.typeId)) && validDate(r.workDate)
      && (r.paymentDate === null || validDate(r.paymentDate)) && isStr(r.value) && r.value.trim().length > 0 && Number.isFinite(Number(r.value))
      && isStr(r.providerDecargoId) && nullableString(r.cnpj) && nullableString(r.typeName) && nullableString(r.exportTarget)
      && ['pendente_aprovacao', 'solicitacao_correcao', 'em_analise', 'aprovada', 'disponivel_exportacao'].includes(r.status)
      && r.integrationId === null && r.exportedAt === null && r.exportedBy === null)
    && p.skipped.every((s) => isStr(s.reason))
    && p.providers.every((c) => isId(c.id) && isStr(c.name) && isStr(c.decargoId)
      && /^[1-9]\d*$/.test(c.decargoId) && isId(Number(c.decargoId)) && nullableString(c.cnpj)) && unique(p.providers.map((c) => c.id))
    && p.types.every((t) => isId(t.id) && isStr(t.name)) && unique(p.types.map((t) => t.id));
}

function money(v: string) { const n = Number(v); return Number.isFinite(n) ? formatCurrency(n) : v; }

export default function ExportCorrectionDialog({ diariaIds, onDone, disabled }: { diariaIds: number[]; onDone: () => void; disabled?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<ExportCorrectionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [cnpj, setCnpj] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [typeId, setTypeId] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => () => { generation.current++; ctrl.current?.abort(); }, []);

  async function withDeadline<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    const timer = window.setTimeout(() => c.abort(), 30000);
    try { return await fn(c.signal); }
    catch (err) {
      if (c.signal.aborted) throw new Error('O servidor não respondeu a tempo ou a operação foi cancelada. Atualize a conferência.');
      throw err;
    } finally { window.clearTimeout(timer); if (ctrl.current === c) ctrl.current = null; }
  }

  function reset() { setPreview(null); setConfirmed(false); }

  async function load(snapshot: number[]) {
    const version = ++generation.current;
    setLoading(true); reset(); setError('');
    try {
      const p = await withDeadline((signal) => previewExportCorrection({ diariaIds: snapshot }, { signal }));
      if (version !== generation.current) return;
      if (!validPreview(p, snapshot)) throw new Error('O servidor devolveu uma conferência inválida. Nenhuma alteração foi feita.');
      const cand = new Set(p.providers.map((c) => c.id));
      const ch: Record<number, string> = {};
      p.rows.forEach((r) => { ch[r.providerId] = cand.has(r.providerId) ? String(r.providerId) : ''; });
      const typeSet = new Set(p.types.map((t) => t.id));
      const current = [...new Set(p.rows.map((r) => r.typeId))];
      setTypeId(p.types.length === 1 ? String(p.types[0].id)
        : current.length === 1 && current[0] !== null && typeSet.has(current[0]) ? String(current[0]) : '');
      setChoice(ch); setCnpj({}); setPreview(p);
    } catch (err) {
      if (version === generation.current) setError(err instanceof Error ? err.message : 'Falha ao consultar os registros.');
    } finally { if (version === generation.current) setLoading(false); }
  }

  function start() {
    const snap = [...new Set(diariaIds)];
    setIds(snap); setReason(''); setSearch(''); setOpen(true); void load(snap);
  }

  function close(next: boolean) {
    if (next) return;
    generation.current++; ctrl.current?.abort(); setLoading(false); setOpen(false); reset(); setError('');
  }

  const groups = new Map<number, ExportCorrectionRow[]>();
  preview?.rows.forEach((r) => groups.set(r.providerId, [...(groups.get(r.providerId) ?? []), r]));
  const provById = new Map((preview?.providers ?? []).map((c) => [c.id, c]));
  const chosenType = Number(typeId);

  const items: ExportCorrectionItem[] = [];
  let missing = !preview || !preview.rows.length || !preview.types.some(t => t.id === chosenType);
  if (preview) for (const [orig, rows] of groups) {
    const sel = Number(choice[orig]); const cand = provById.get(sel);
    if (!cand) { missing = true; continue; }
    const changesProvider = sel !== orig;
    if (changesProvider && (digits(cnpj[orig]).length !== 14
      || (cand.cnpj?.trim() && digits(cnpj[orig]) !== digits(cand.cnpj)))) missing = true;
    rows.forEach((r) => items.push({
      id: r.id, expectedProviderId: r.providerId, expectedTypeId: r.typeId, expectedUpdatedAt: r.updatedAt,
      expectedProviderDecargoId: r.providerDecargoId, expectedPeopleId: cand.decargoId,
      providerId: sel, typeId: chosenType, ...(changesProvider ? { verifiedCnpj: digits(cnpj[orig]) } : {}),
    }));
  }
  const changed = items.filter((i) => i.providerId !== i.expectedProviderId || i.typeId !== i.expectedTypeId).map((i) => i.id);
  const unchanged = items.filter((i) => !changed.includes(i.id)).map((i) => i.id);
  const trimmed = reason.trim();
  const canSave = !loading && !saving && !missing && changed.length > 0 && confirmed && trimmed.length >= 10 && trimmed.length <= 1000;

  async function save() {
    if (!canSave) return;
    const version = ++generation.current;
    setSaving(true); setError('');
    try {
      const res = await withDeadline((signal) => resolveExportCorrection({ confirmed: true, reason: trimmed, corrections: items }, { signal }));
      if (version !== generation.current) return;
      const c = res?.correctedIds, u = res?.unchangedIds;
      if (!Array.isArray(c) || !Array.isArray(u) || !unique([...c, ...u]) || c.length !== changed.length || u.length !== unchanged.length
        || !c.every((id) => changed.includes(id)) || !u.every((id) => unchanged.includes(id))) {
        throw new Error('Não foi possível confirmar o resultado da correção. Atualize a conferência antes de tentar novamente.');
      }
      toast({ title: `${c.length} diária(s) corrigida(s).`, description: 'Os registros voltaram para Pendente de aprovação. Nada foi exportado.' });
      setOpen(false); reset(); onDone();
    } catch (err) {
      if (version === generation.current) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar a correção. O resultado pode ser incerto; atualize a conferência.');
        reset();
      }
    } finally { if (version === generation.current) setSaving(false); }
  }

  const q = search.trim().toLowerCase();
  const roster = (preview?.providers ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.decargoId.includes(q) || digits(c.cnpj).includes(digits(q) || '\u0000'));
  const busy = loading || saving;

  return <>
    <Button size="sm" variant="outline" disabled={disabled || open || diariaIds.length === 0} onClick={start} data-testid="button-open-export-correction">
      <UserCheck size={16} className="mr-2" /> Corrigir prestador/tipo
    </Button>
    <Dialog open={open} onOpenChange={(n) => { if (!saving) close(n); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Corrigir prestador e tipo de pagamento extra</DialogTitle>
          <DialogDescription>
            Escolha o prestador integrado ao DECARGO People (ID e CNPJ) e o tipo de diária extra. Valores, datas, equipe e autoria são preservados.
            Registros alterados voltam para Pendente de aprovação e não são exportados. Cadastros do People e contas de usuário nunca são alterados.
          </DialogDescription>
        </DialogHeader>
        {loading && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" /> Consultando {ids.length} registro(s)…</p>}
        {error && <div role="alert" data-testid="text-correction-error" className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
        {!loading && !preview && <Button variant="outline" disabled={saving} onClick={() => void load(ids)} data-testid="button-refresh-correction">Atualizar conferência</Button>}
        {preview && <div className="space-y-5 text-sm">
          {preview.skipped.length > 0 && <details className="rounded border bg-muted/30 p-3">
            <summary>{preview.skipped.length} registro(s) não podem ser corrigidos aqui</summary>
            <ul className="mt-2 space-y-1">{preview.skipped.map((s) => <li key={s.id}>Diária #{s.id}: {s.reason}</li>)}</ul>
            <p className="mt-2 text-xs text-muted-foreground">Registros reservados, exportados, pagos ou cancelados ficam de fora. Bloqueios de exportação são tratados separadamente em "Resolver bloqueios"; esta correção nunca libera bloqueios.</p>
          </details>}
          {preview.rows.length === 0 ? <p className="rounded border p-3">Nenhum registro selecionado pode ser corrigido. Ajuste a seleção e abra novamente.</p>
          : preview.providers.length === 0 || preview.types.length === 0 ? <p className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
              {preview.providers.length === 0 ? 'Não há prestadores ativos integrados ao People disponíveis. Sincronize ou concilie os prestadores antes de corrigir.' : 'Não há tipo ativo de diária extra cadastrado. Cadastre o tipo de pagamento antes de corrigir.'}
            </p>
          : <>
            <label className="block space-y-1.5">
              <span className="font-medium">Tipo de pagamento extra *</span>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={typeId} disabled={busy}
                onChange={(e) => { setTypeId(e.target.value); setConfirmed(false); }} data-testid="select-correction-type">
                <option value="">Selecione o tipo de diária extra</option>
                {preview.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">Somente pagamentos (diária extra). Descontos não são permitidos.</span>
            </label>
            <Input aria-label="Buscar prestador pelo nome, ID People ou CNPJ" placeholder="Filtrar prestadores por nome, ID People ou CNPJ" value={search} disabled={busy}
              onChange={(e) => setSearch(e.target.value)} data-testid="input-correction-search" />
            <p className="text-xs text-muted-foreground">Não encontrou o ID? Confira em Pessoas se o cadastro integrado está ativo e disponível.
              Esta ação não cria, ativa nem mescla cadastros e não concede acesso a contas.</p>
            {[...groups].map(([orig, rows]) => {
              const sel = Number(choice[orig]); const cand = provById.get(sel); const changes = !!cand && sel !== orig;
              const opts = cand && !roster.includes(cand) ? [cand, ...roster] : roster;
              return <section key={orig} className="rounded-md border p-3 space-y-3" data-testid={`group-correction-${orig}`}>
                <div>
                  <p className="font-medium">Registro atual: {rows[0].providerName}</p>
                  <p className="text-xs text-muted-foreground">Referência atual {rows[0].providerDecargoId || '---'} · CNPJ {rows[0].cnpj || 'não informado'} · registro local #{orig}</p>
                </div>
                <ul className="text-xs space-y-0.5">{rows.map((r) => <li key={r.id}>
                  Diária #{r.id} · {formatDate(r.workDate)} · {money(r.value)} · pagamento {r.paymentDate ? formatDate(r.paymentDate) : '---'} · tipo atual: {r.typeName ?? 'não definido'}{r.exportTarget ? ` (${r.exportTarget})` : ''}
                </li>)}</ul>
                <label className="block space-y-1.5">
                  <span className="font-medium">Prestador correto no People *</span>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={choice[orig] ?? ''} disabled={busy}
                    onChange={(e) => { setChoice((c) => ({ ...c, [orig]: e.target.value })); setCnpj((c) => ({ ...c, [orig]: '' })); setConfirmed(false); }} data-testid={`select-correction-provider-${orig}`}>
                    <option value="">Selecione explicitamente</option>
                    {opts.map((c) => <option key={c.id} value={c.id}>{c.name} · ID People {c.decargoId} · CNPJ {c.cnpj || 'não informado'}</option>)}
                  </select>
                </label>
                {changes && <label className="block space-y-1.5">
                  <span className="font-medium">CNPJ conferido no People *</span>
                  <Input inputMode="numeric" autoComplete="off" maxLength={18} value={cnpj[orig] ?? ''} disabled={busy}
                    onChange={(e) => { setCnpj((c) => ({ ...c, [orig]: e.target.value })); setConfirmed(false); }} placeholder="Digite o CNPJ consultado no People" data-testid={`input-correction-cnpj-${orig}`} />
                  {!cand.cnpj?.trim() && <span className="block text-xs text-amber-700">
                    O CNPJ não consta no cadastro local. Confira diretamente no People o ID {cand.decargoId} e o documento da mesma pessoa.
                    Esta conferência manual fica na auditoria e não preenche nem altera o cadastro de Pessoas.
                  </span>}
                  {cand.cnpj?.trim() && digits(cnpj[orig]).length === 14 && digits(cnpj[orig]) !== digits(cand.cnpj) && <span className="text-xs text-destructive">O CNPJ informado não corresponde ao prestador escolhido.</span>}
                </label>}
              </section>;
            })}
            <label className="block space-y-1.5">
              <span className="font-medium">Motivo da correção *</span>
              <Textarea value={reason} maxLength={1000} disabled={busy} onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva a conferência realizada (mínimo 10 caracteres)." data-testid="input-correction-reason" />
            </label>
            <label className="flex items-start gap-3">
              <Checkbox checked={confirmed} disabled={busy} onCheckedChange={(v) => setConfirmed(v === true)} data-testid="checkbox-correction-confirm" />
              <span>Conferi o ID do People e, nos vínculos alterados, o CNPJ da mesma pessoa. Confirmo que estes pagamentos são diárias extras. *</span>
            </label>
            <p className="text-xs text-muted-foreground" data-testid="text-correction-summary">
              {changed.length} registro(s) serão alterados e voltarão para Pendente de aprovação; {unchanged.length} permanecerão como estão. A ação fica registrada na auditoria.
            </p>
          </>}
        </div>}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => close(false)} data-testid="button-cancel-correction">Cancelar</Button>
          <Button disabled={!canSave} onClick={() => void save()} data-testid="button-save-correction">
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />} Salvar correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
