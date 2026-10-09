import { useState, type FormEvent } from 'react';
import { useCreateUser, type Team, type UserCreate } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

type Props = {
  teams: Team[];
  existingPeople: { name: string; email?: string | null }[];
  onClose: () => void;
  onCreated: () => void;
  onLocateExisting: (person: { name: string; email?: string | null }) => void;
  onRefresh: () => void;
};

const normalizeName = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toLowerCase();

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return data.error;
    }
  }
  return error instanceof Error ? error.message : 'Não foi possível cadastrar a pessoa. Tente novamente.';
}

export function ManualPersonDialog({ teams, existingPeople, onClose, onCreated, onLocateExisting, onRefresh }: Props) {
  const createUser = useCreateUser();
  const [form, setForm] = useState({
    name: '', email: '', role: 'prestador' as UserCreate['role'],
    teamId: '', dailyRate: '',
  });
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const existingRecord = duplicate ? (existingPeople.find(person =>
    Boolean(person.email) && person.email?.trim().toLowerCase() === form.email.trim().toLowerCase()
  ) ?? existingPeople.find(person => normalizeName(person.name) === normalizeName(form.name))) : undefined;
  const setField = (field: 'name' | 'email' | 'teamId' | 'dailyRate', value: string) => {
    setError('');
    setDuplicate(false);
    setForm(previous => ({ ...previous, [field]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createUser.isPending) return;
    setError('');
    setDuplicate(false);
    const name = form.name.trim().replace(/\s+/g, ' ');
    const email = form.email.trim().toLowerCase();
    if (!name || !email) {
      setError('Preencha os campos obrigatórios marcados com asterisco.');
      return;
    }
    const dailyRate = form.dailyRate.trim() === '' ? null : Number(form.dailyRate);
    if (dailyRate != null && (!Number.isFinite(dailyRate) || dailyRate < 0 || dailyRate > 99999999.99)) {
      setError('Informe um valor de diária válido, maior ou igual a zero.');
      return;
    }
    createUser.mutate({
      data: {
        name, email, role: form.role,
        teamId: form.teamId === '' ? null : Number(form.teamId),
        dailyRate, active: true,
      },
    }, {
      onSuccess: onCreated,
      onError: err => {
        setError(errorMessage(err));
        if (err && typeof err === 'object' && 'status' in err && err.status === 409) {
          setDuplicate(true);
          onRefresh();
        }
      },
    });
  };

  return (
    <Dialog open onOpenChange={open => { if (!open && !createUser.isPending) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar pessoa</DialogTitle>
          <DialogDescription>Cadastro local no Diárias, sem criar uma conta no DECARGO People. Campos com * são obrigatórios.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={createUser.isPending} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="person-name">Nome completo <span className="text-destructive">*</span></Label>
              <Input id="person-name" autoFocus required maxLength={200} autoComplete="name"
                value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Nome completo da pessoa" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-email">E-mail <span className="text-destructive">*</span></Label>
              <Input id="person-email" type="email" required maxLength={254} autoComplete="email"
                value={form.email} onChange={e => setField('email', e.target.value)} placeholder="pessoa@exemplo.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-role">Tipo <span className="text-destructive">*</span></Label>
              <select id="person-role" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.role} onChange={e => setForm(previous => ({ ...previous, role: e.target.value as UserCreate['role'] }))}>
                <option value="prestador">Prestador</option>
                <option value="funcionario">Funcionário</option>
                <option value="gestor">Gestor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="person-team">Equipe</Label>
                <select id="person-team" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.teamId} onChange={e => setField('teamId', e.target.value)}>
                  <option value="">Sem equipe</option>
                  {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="person-rate">Valor da diária (R$)</Label>
                <Input id="person-rate" type="number" min="0" max="99999999.99" step="0.01"
                  value={form.dailyRate} onChange={e => setField('dailyRate', e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </fieldset>
          {error && (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p>{error}</p>
              {duplicate && existingRecord ? (
                <div className="mt-2">
                  <p>Cadastro encontrado: <strong>{existingRecord.name}</strong>.</p>
                  <Button type="button" size="sm" variant="outline" className="mt-2"
                    onClick={() => onLocateExisting(existingRecord)}>
                    Ver cadastro existente
                  </Button>
                </div>
              ) : duplicate ? <p className="mt-2">Pesquise também pelo e-mail informado na lista de Pessoas.</p> : null}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createUser.isPending}>Cancelar</Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {createUser.isPending ? 'Cadastrando…' : 'Cadastrar pessoa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
