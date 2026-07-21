import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { 
  useGetMe, 
  useCreateDiaria, 
  useUpdateDiaria, 
  useGetDiaria,
  useListProviders,
  useListTeams
} from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, ChevronsUpDown, Check } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Tipos de Diária — fetch inline (não precisa de geração orval)
// ---------------------------------------------------------------------------
type DiariaType = { id: number; description: string; exportTarget: string; active: boolean };

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
function apiFetch(path: string) {
  const token = localStorage.getItem('access_token');
  return fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(r => r.json());
}
function useActiveDiariaTypes() {
  return useQuery<DiariaType[]>({
    queryKey: ['diaria-types', 'active'],
    queryFn: () => apiFetch('/api/diaria-types?activeOnly=true'),
  });
}

// ---------------------------------------------------------------------------
// Combobox pesquisável
// ---------------------------------------------------------------------------
interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}

function SearchableSelect({ value, onChange, options, placeholder = 'Selecione…', disabled }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown size={14} className="ml-2 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command filter={(itemValue, search) => {
          const opt = options.find(o => o.value === itemValue);
          return opt?.label.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
        }}>
          <CommandInput placeholder="Pesquisar…" />
          <CommandList>
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            {options.map(o => (
              <CommandItem key={o.value} value={o.value} onSelect={(v) => { onChange(v); setOpen(false); }}>
                <Check size={14} className={cn('mr-2', value === o.value ? 'opacity-100' : 'opacity-0')} />
                {o.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Formulário principal
// ---------------------------------------------------------------------------
export default function DiariaForm() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditing = !!id && id !== 'nova';
  
  const { data: user } = useGetMe();
  const { data: teams } = useListTeams();
  const { data: providers } = useListProviders({ activeOnly: true });
  const { data: diariaTypes = [] } = useActiveDiariaTypes();
  
  const { data: existingDiaria, isLoading: isLoadingExisting } = useGetDiaria(
    Number(id), 
    { query: { enabled: isEditing, queryKey: ['getDiaria', id] } }
  );

  const createMutation = useCreateDiaria();
  const updateMutation = useUpdateDiaria();

  const [formData, setFormData] = useState({
    providerId: '',
    teamId: '',
    typeId: '',
    workDate: new Date().toISOString().split('T')[0],
    startTime: '',
    endTime: '',
    value: '',
    observations: ''
  });

  useEffect(() => {
    if (existingDiaria) {
      setFormData({
        providerId: existingDiaria.providerId.toString(),
        teamId: existingDiaria.teamId.toString(),
        typeId: (existingDiaria as any).typeId?.toString() ?? '',
        workDate: existingDiaria.workDate.split('T')[0],
        startTime: existingDiaria.startTime?.slice(0, 5) || '',
        endTime: existingDiaria.endTime?.slice(0, 5) || '',
        value: existingDiaria.value?.toString() || '',
        observations: existingDiaria.observations || ''
      });
    } else if (user?.teamId) {
      setFormData(prev => ({ ...prev, teamId: user.teamId?.toString() || '' }));
    }
  }, [existingDiaria, user]);

  const typeOptions = [...diariaTypes]
    .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'))
    .map(t => ({ value: String(t.id), label: t.description }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.typeId) {
      toast({ title: 'Selecione o tipo de diária.', variant: 'destructive' });
      return;
    }
    
    if (isEditing) {
      updateMutation.mutate({
        id: Number(id),
        data: {
          workDate: formData.workDate,
          startTime: formData.startTime || null,
          endTime: formData.endTime || null,
          value: Number(formData.value),
          observations: formData.observations || null
        }
      }, {
        onSuccess: () => {
          toast({ title: 'Diária atualizada com sucesso.' });
          setLocation(`/diarias/${id}`);
        },
        onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' })
      });
    } else {
      createMutation.mutate({
        data: {
          providerId: Number(formData.providerId),
          teamId: Number(formData.teamId),
          typeId: Number(formData.typeId),
          workDate: formData.workDate,
          startTime: formData.startTime || null,
          endTime: formData.endTime || null,
          value: Number(formData.value),
          observations: formData.observations || null
        } as any
      }, {
        onSuccess: (data) => {
          toast({ title: 'Diária criada com sucesso.' });
          setLocation(`/diarias/${data.id}`);
        },
        onError: (err: any) => toast({ title: err?.message ?? 'Erro ao criar', variant: 'destructive' })
      });
    }
  };

  if (isEditing && isLoadingExisting) return <div>Carregando...</div>;

  if (isEditing && user?.role === 'gestor') {
    return <div>Acesso negado. Diárias já salvas só podem ser corrigidas por um administrador.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={isEditing ? `/diarias/${id}` : "/diarias"} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 w-9">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {isEditing ? 'Editar Diária' : 'Nova Diária'}
          </h1>
          <p className="text-muted-foreground mt-1">
            Preencha os dados do serviço prestado.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Prestador *</label>
                <select 
                  required
                  disabled={isEditing}
                  value={formData.providerId}
                  onChange={(e) => setFormData({...formData, providerId: e.target.value})}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>Selecione um prestador</option>
                  {providers?.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Equipe *</label>
                <select 
                  required
                  disabled={isEditing}
                  value={formData.teamId}
                  onChange={(e) => setFormData({...formData, teamId: e.target.value})}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>Selecione uma equipe</option>
                  {teams?.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium leading-none">
                  Tipo de Diária *
                </label>
                <SearchableSelect
                  value={formData.typeId}
                  onChange={(v) => setFormData({ ...formData, typeId: v })}
                  options={typeOptions}
                  placeholder="Selecione o tipo…"
                  disabled={isEditing}
                />
                {diariaTypes.length === 0 && (
                  <p className="text-xs text-amber-600">
                    Nenhum tipo cadastrado. Acesse Configurações para criar os tipos de diária.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Data do Serviço *</label>
                <Input 
                  type="date" 
                  required
                  value={formData.workDate}
                  onChange={(e) => setFormData({...formData, workDate: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Horário Inicial</label>
                <Input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Horário Final</label>
                <Input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                />
              </div>

              {user?.role !== 'gestor' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Valor (R$) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.value}
                    onChange={(e) => setFormData({...formData, value: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Observações</label>
              <textarea 
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                value={formData.observations}
                onChange={(e) => setFormData({...formData, observations: e.target.value})}
                placeholder="Detalhes adicionais sobre o serviço..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Link href={isEditing ? `/diarias/${id}` : "/diarias"} className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background px-4 py-2 hover:bg-accent">
                Cancelar
              </Link>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                Salvar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
