import { useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getToken } from '@/lib/auth';
import {
  Download, Upload, CheckCircle2, XCircle, AlertTriangle, Loader2, FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

function apiFetch(path: string, init?: RequestInit) {
  const token = getToken();
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// ─── types (mirrored from backend) ───────────────────────────────────────────

interface PreviewRowError { campo: string; motivo: string }

interface PreviewRow {
  line: number;
  prestadorRaw: string;
  tipoRaw: string;
  dataRaw: string;
  horarioInicial: string | null;
  horarioFinal: string | null;
  observacoes: string | null;
  valor: number | null;
  status: 'valido' | 'duplicado' | 'erro';
  errors: PreviewRowError[];
  providerId?: number;
  providerName?: string;
  teamId?: number;
  typeId?: number;
  workDate?: string;
  startTime?: string | null;
  endTime?: string | null;
}

interface PreviewResult {
  rows: PreviewRow[];
  summary: { total: number; validos: number; erros: number; duplicados: number };
}

interface ConfirmResult {
  imported: number;
  skipped: number;
  details: { line: number; motivo: string }[];
}

// ─── Step types ───────────────────────────────────────────────────────────────

type Step = 'upload' | 'preview' | 'result';

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportarPlanilhaDialog({
  open,
  onOpenChange,
  onImportDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImportDone?: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);

  function reset() {
    setStep('upload');
    setSelectedFile(null);
    setPreviewResult(null);
    setConfirmResult(null);
    setLoadingPreview(false);
    setLoadingConfirm(false);
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  // ── Template download ─────────────────────────────────────────────────────

  async function handleDownloadTemplate() {
    const resp = await apiFetch('/api/diarias/import/template');
    if (!resp.ok) { toast({ title: 'Erro ao baixar modelo', variant: 'destructive' }); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-diarias.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── File selection ────────────────────────────────────────────────────────

  function handleFileChange(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const ok = f.name.endsWith('.xlsx') || f.name.endsWith('.csv') || f.name.endsWith('.xls');
    if (!ok) { toast({ title: 'Formato inválido', description: 'Selecione um arquivo .xlsx ou .csv.', variant: 'destructive' }); return; }
    setSelectedFile(f);
  }

  // ── Preview (validate) ────────────────────────────────────────────────────

  async function handleValidate() {
    if (!selectedFile) return;
    setLoadingPreview(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const resp = await apiFetch('/api/diarias/import/preview', { method: 'POST', body: fd });
      const data = await resp.json();
      if (!resp.ok) { toast({ title: 'Erro na validação', description: data?.error ?? resp.statusText, variant: 'destructive' }); return; }
      setPreviewResult(data as PreviewResult);
      setStep('preview');
    } catch (e: any) {
      toast({ title: 'Erro na validação', description: e?.message, variant: 'destructive' });
    } finally {
      setLoadingPreview(false);
    }
  }

  // ── Confirm import ────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!previewResult) return;
    const validRows = previewResult.rows.filter(r => r.status === 'valido');
    if (validRows.length === 0) return;
    setLoadingConfirm(true);
    try {
      const resp = await apiFetch('/api/diarias/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      });
      const data = await resp.json();
      if (!resp.ok) { toast({ title: 'Erro na importação', description: data?.error ?? resp.statusText, variant: 'destructive' }); return; }
      setConfirmResult(data as ConfirmResult);
      setStep('result');
      onImportDone?.();
    } catch (e: any) {
      toast({ title: 'Erro na importação', description: e?.message, variant: 'destructive' });
    } finally {
      setLoadingConfirm(false);
    }
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────

  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true); }
  function onDragLeave() { setDragging(false); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    handleFileChange(e.dataTransfer.files);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {step === 'upload' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet size={20} /> Importar Planilha
              </DialogTitle>
              <DialogDescription>
                Baixe o modelo, preencha com as diárias e faça o upload para validação antes de importar.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Download template */}
              <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30">
                <Download size={24} className="text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Planilha Modelo</p>
                  <p className="text-xs text-muted-foreground">Baixe o modelo com os campos obrigatórios e exemplos de preenchimento.</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download size={14} className="mr-2" /> Baixar Modelo
                </Button>
              </div>

              {/* Dropzone */}
              <div
                ref={dropRef}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-accent/30',
                  selectedFile && 'border-emerald-400 bg-emerald-50',
                )}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => handleFileChange(e.target.files)}
                />
                <Upload size={32} className={cn('mx-auto mb-3', selectedFile ? 'text-emerald-600' : 'text-muted-foreground')} />
                {selectedFile ? (
                  <>
                    <p className="font-medium text-emerald-700">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{(selectedFile.size / 1024).toFixed(1)} KB — clique para trocar</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Arraste a planilha aqui ou clique para selecionar</p>
                    <p className="text-xs text-muted-foreground mt-1">Aceita .xlsx e .csv</p>
                  </>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button disabled={!selectedFile || loadingPreview} onClick={handleValidate}>
                {loadingPreview ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                Validar Planilha
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'preview' && previewResult && (
          <>
            <DialogHeader>
              <DialogTitle>Pré-visualização</DialogTitle>
              <DialogDescription>
                Revise os dados antes de confirmar. Somente registros válidos serão importados.
              </DialogDescription>
            </DialogHeader>

            {/* Summary badges */}
            <div className="flex flex-wrap gap-3 py-2">
              <SummaryBadge color="slate" label="Total" value={previewResult.summary.total} />
              <SummaryBadge color="emerald" label="Válidos" value={previewResult.summary.validos} />
              <SummaryBadge color="amber" label="Duplicados" value={previewResult.summary.duplicados} />
              <SummaryBadge color="red" label="Com erro" value={previewResult.summary.erros} />
            </div>

            {/* Rows table */}
            <div className="rounded-md border overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium w-12">Linha</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Prestador</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Data</th>
                    <th className="px-3 py-2 text-left text-xs font-medium w-24">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Erros / Avisos</th>
                  </tr>
                </thead>
                <tbody>
                  {previewResult.rows.map(row => (
                    <tr key={row.line} className={cn(
                      'border-t',
                      row.status === 'valido' && 'bg-emerald-50/50',
                      row.status === 'duplicado' && 'bg-amber-50/50',
                      row.status === 'erro' && 'bg-red-50/50',
                    )}>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{row.line}</td>
                      <td className="px-3 py-2 font-medium max-w-[160px] truncate" title={row.prestadorRaw}>{row.prestadorRaw || '—'}</td>
                      <td className="px-3 py-2 max-w-[120px] truncate" title={row.tipoRaw}>{row.tipoRaw || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.dataRaw || '—'}</td>
                      <td className="px-3 py-2">
                        {row.status === 'valido' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 size={11} /> Válido
                          </span>
                        )}
                        {row.status === 'duplicado' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            <AlertTriangle size={11} /> Duplicado
                          </span>
                        )}
                        {row.status === 'erro' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                            <XCircle size={11} /> Erro
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.errors.map((e, i) => (
                          <div key={i}><span className="font-medium">{e.campo}:</span> {e.motivo}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
              <Button
                disabled={previewResult.summary.validos === 0 || loadingConfirm}
                onClick={handleConfirm}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {loadingConfirm ? <Loader2 className="animate-spin mr-2" size={16} /> : <CheckCircle2 size={16} className="mr-2" />}
                Importar {previewResult.summary.validos} registro{previewResult.summary.validos !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'result' && confirmResult && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-600" /> Importação concluída
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Result summary */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ResultCard label="Total processados" value={previewResult?.summary.total ?? 0} color="slate" />
                <ResultCard label="Importados" value={confirmResult.imported} color="emerald" />
                <ResultCard label="Não importados" value={confirmResult.skipped} color="red" />
                <ResultCard label="Duplicados" value={previewResult?.summary.duplicados ?? 0} color="amber" />
              </div>

              {/* Error detail */}
              {confirmResult.details.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-700 mb-2">Registros não importados:</p>
                  {confirmResult.details.map((d, i) => (
                    <p key={i} className="text-xs text-red-700">
                      <span className="font-medium">Linha {d.line}:</span> {d.motivo}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => { reset(); handleClose(false); }}>Fechar</Button>
              <Button variant="outline" onClick={reset}>Nova Importação</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function SummaryBadge({ color, label, value }: { color: 'slate' | 'emerald' | 'amber' | 'red'; label: string; value: number }) {
  const cls: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
  };
  return (
    <div className={cn('px-3 py-1.5 rounded-lg text-sm font-medium', cls[color])}>
      {value} {label}
    </div>
  );
}

function ResultCard({ label, value, color }: { label: string; value: number; color: 'slate' | 'emerald' | 'amber' | 'red' }) {
  const cls: Record<string, string> = {
    slate: 'border-slate-200',
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
    red: 'border-red-200 bg-red-50',
  };
  const numCls: Record<string, string> = {
    slate: 'text-slate-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  };
  return (
    <div className={cn('border rounded-lg p-3 text-center', cls[color])}>
      <p className={cn('text-2xl font-bold', numCls[color])}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
