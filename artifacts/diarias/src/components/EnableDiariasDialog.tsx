import { useState, type FormEvent } from 'react';
import { useEnableUserDiarias } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

type Props = {
  person: { sourceId: number; name: string; active: boolean };
  onClose: () => void;
  onEnabled: () => void;
  onConflict: () => void;
};

export function EnableDiariasDialog({ person, onClose, onEnabled, onConflict }: Props) {
  const enable = useEnableUserDiarias();
  const [rate, setRate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (enable.isPending) return;
    const dailyRate = Number(rate);
    if (!confirmed || !rate.trim() || !Number.isFinite(dailyRate) ||
        dailyRate < 0 || dailyRate > 99999999.99 ||
        Math.abs(dailyRate * 100 - Math.round(dailyRate * 100)) > 0.000001) {
      setError('Informe um valor válido com até duas casas decimais e confirme a habilitação.');
      return;
    }
    setError('');
    enable.mutate({ id: person.sourceId, data: { dailyRate, confirmed: true } }, {
      onSuccess: onEnabled,
      onError: err => {
        const data = err && typeof err === 'object' && 'data' in err ? err.data : null;
        setError(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error : 'Não foi possível habilitar diárias. Tente novamente.');
        if (err && typeof err === 'object' && 'status' in err && err.status === 409) onConflict();
      },
    });
  };
  return (
    <Dialog open onOpenChange={open => { if (!open && !enable.isPending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Habilitar diárias</DialogTitle>
          <DialogDescription>
            Habilitar {person.name} para receber diárias neste sistema, sem criar outra pessoa.
            Nome, e-mail, papel de acesso, equipe e status não serão alterados.
            A exportação ficará bloqueada até existir um vínculo validado com o DECARGO People.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={enable.isPending} className="space-y-4">
            {!person.active && <p className="text-sm">Esta pessoa está inativa. O vínculo será criado inativo e não aparecerá em Nova Diária até ser ativado.</p>}
            <div className="space-y-2">
              <Label htmlFor="enable-rate">Valor da diária (R$)</Label>
              <Input id="enable-rate" autoFocus type="number" min="0" max="99999999.99" step="0.01" required
                value={rate} onChange={event => setRate(event.target.value)} />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
              Confirmo a habilitação local de diárias para esta pessoa, sem alterar suas permissões.
            </label>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={enable.isPending}>Cancelar</Button>
            <Button type="submit" disabled={enable.isPending || !confirmed}>
              {enable.isPending ? 'Habilitando…' : 'Confirmar habilitação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
