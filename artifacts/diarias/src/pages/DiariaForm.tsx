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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

export default function DiariaForm() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditing = !!id && id !== 'nova';
  
  const { data: user } = useGetMe();
  const { data: teams } = useListTeams();
  const { data: providers } = useListProviders();
  
  const { data: existingDiaria, isLoading: isLoadingExisting } = useGetDiaria(
    Number(id), 
    { query: { enabled: isEditing, queryKey: ['getDiaria', id] } }
  );

  const createMutation = useCreateDiaria();
  const updateMutation = useUpdateDiaria();

  const [formData, setFormData] = useState({
    providerId: '',
    teamId: '',
    workDate: new Date().toISOString().split('T')[0],
    value: '',
    observations: ''
  });

  useEffect(() => {
    if (existingDiaria) {
      setFormData({
        providerId: existingDiaria.providerId.toString(),
        teamId: existingDiaria.teamId.toString(),
        workDate: existingDiaria.workDate.split('T')[0],
        value: existingDiaria.value?.toString() || '',
        observations: existingDiaria.observations || ''
      });
    } else if (user?.teamId) {
      setFormData(prev => ({ ...prev, teamId: user.teamId?.toString() || '' }));
    }
  }, [existingDiaria, user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isEditing) {
      updateMutation.mutate({
        id: Number(id),
        data: {
          workDate: formData.workDate,
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
          workDate: formData.workDate,
          value: Number(formData.value),
          observations: formData.observations || null
        }
      }, {
        onSuccess: (data) => {
          toast({ title: 'Diária criada com sucesso.' });
          setLocation(`/diarias/${data.id}`);
        },
        onError: () => toast({ title: 'Erro ao criar', variant: 'destructive' })
      });
    }
  };

  if (isEditing && isLoadingExisting) return <div>Carregando...</div>;

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
                  disabled={isEditing || user?.role === 'gestor'}
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
