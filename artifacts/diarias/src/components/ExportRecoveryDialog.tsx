import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UnlockKeyhole } from 'lucide-react';

interface Reservation { id: number; integrationId: string }
interface RecoveryPreview {
  eligible: Reservation[];
  skipped: { id: number; reason: string }[];
}

async function request(path: string, body: unknown) {
  const base = (import.meta.env.VITE_API_URL ?? import.meta.env.BASE_URL).replace(/\/+$/, '');
  const token = getToken();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${base}/api/diarias/export/recovery${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Não foi possível consultar os bloqueios.');
    return data;
  } catch (err) {
    if (controller.signal.aborted) throw new Error('O servidor não respondeu a tempo. Atualize a conferência antes de tentar novamente.');
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export default function ExportRecoveryDialog({
  selectedIds, disabled, onDone,
}: { selectedIds: number[]; disabled: boolean; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<RecoveryPreview | null>(null);
  const [snapshotIds, setSnapshotIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function load(ids: number[]) {
    setLoading(true);
    setPreview(null);
    setError('');
    setConfirmed(false);
    try {
      const result = await request('/preview', { diariaIds: ids });
      if (!result || !Array.isArray(result.eligible) || !Array.isArray(result.skipped)
        || !result.eligible.every((row: Reservation) => row && Number.isSafeInteger(row.id)
          && ids.includes(row.id) && typeof row.integrationId === 'string'
          && row.integrationId.length > 0 && row.integrationId.length <= 100)
        || new Set(result.eligible.map((row: Reservation) => row.id)).size !== result.eligible.length
        || !result.skipped.every((row: { id: number; reason: string }) => row
          && ids.includes(row.id) && typeof row.reason === 'string')) {
        throw new Error('O servidor devolveu uma conferência incompleta. Nenhuma liberação foi realizada.');
      }
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao consultar os bloqueios.');
    } finally {
      setLoading(false);
    }
  }

  function start() {
    const ids = [...selectedIds];
    setSnapshotIds(ids);
    setReason('');
    setOpen(true);
    void load(ids);
  }

  async function release() {
    if (!preview?.eligible.length || !confirmed || reason.trim().length < 10) return;
    setSaving(true);
    setError('');
    try {
      const result = await request('', {
        reservations: preview.eligible,
        confirmedNotExported: true,
        reason: reason.trim(),
      });
      if (!result || result.released !== preview.eligible.length || !Array.isArray(result.releasedIds)
        || result.releasedIds.length !== preview.eligible.length
        || new Set(result.releasedIds).size !== preview.eligible.length
        || !result.releasedIds.every((id: number) => preview.eligible.some((row) => row.id === id))) {
        throw new Error('Não foi possível confirmar o resultado. Atualize a conferência antes de tentar novamente.');
      }
      await queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === 'string'
          && (query.queryKey[0].includes('/diarias') || query.queryKey[0].includes('/dashboard') || query.queryKey[0].includes('/audit')),
      });
      toast({ title: `${result.released} bloqueio(s) liberado(s).`, description: 'Nenhuma diária foi enviada ao People. A exportação precisa ser iniciada separadamente.' });
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar a liberação.');
      // A failed response may follow a committed transaction. Require a fresh
      // preview rather than replaying an old recovery request.
      setPreview(null);
      setConfirmed(false);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Button size="sm" variant="outline" disabled={disabled || selectedIds.length === 0} onClick={start}>
      <UnlockKeyhole size={16} className="mr-2" /> Resolver bloqueios
    </Button>
    <Dialog open={open} onOpenChange={(next) => { if (!saving && !loading) setOpen(next); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conferir exportação bloqueada</DialogTitle>
          <DialogDescription>
            Use esta opção somente depois de conferir no DECARGO People que os registros não foram recebidos.
            A liberação não exporta diárias nem altera valores, datas ou aprovações.
          </DialogDescription>
        </DialogHeader>
        {loading && <p role="status" className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Consultando os bloqueios…</p>}
        {error && <div role="alert" className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
        {!loading && !preview && <Button variant="outline" disabled={saving} onClick={() => void load(snapshotIds)}>Atualizar conferência</Button>}
        {preview && <div className="space-y-4">
          <p className="text-sm font-medium">{preview.eligible.length} diária(s) com bloqueio de tentativa que falhou.</p>
          <p className="text-xs text-muted-foreground break-all">
            Lotes: {[...new Set(preview.eligible.map((row) => row.integrationId))].join(', ') || 'Nenhum'}.
          </p>
          {preview.skipped.length > 0 && <details className="text-sm">
            <summary>{preview.skipped.length} registro(s) não serão liberados</summary>
            <ul className="mt-2 space-y-1">{preview.skipped.map((row) => <li key={row.id}>Diária #{row.id}: {row.reason}</li>)}</ul>
          </details>}
          {preview.eligible.length > 0 && <>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} disabled={saving} />
              <span>Confirmei no DECARGO People que nenhuma das {preview.eligible.length} diárias deste bloqueio foi exportada. *</span>
            </label>
            <label className="block space-y-2 text-sm">
              <span>Motivo e conferência realizada *</span>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving}
                minLength={10} maxLength={1000} placeholder="Descreva como foi feita a conferência no People (mínimo 10 caracteres)." />
            </label>
            <p className="text-xs text-muted-foreground">A confirmação, o motivo e o administrador responsável ficarão registrados na auditoria. Exportações em andamento e registros exportados ou pagos não podem ser liberados aqui.</p>
          </>}
        </div>}
        <DialogFooter>
          <Button variant="outline" disabled={saving || loading} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={loading || saving || !preview?.eligible.length || !confirmed || reason.trim().length < 10} onClick={() => void release()}>
            {saving && <Loader2 size={16} className="mr-2 animate-spin" />} Liberar para nova tentativa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
