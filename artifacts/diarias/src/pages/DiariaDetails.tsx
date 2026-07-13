import { useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { 
  useGetDiaria, 
  useGetMe,
  useApproveDiaria,
  useRejectDiaria,
  useRequestCorrectionDiaria,
  useMarkDiariaPaid,
  useDeleteDiaria
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatDateTime, statusColors, statusLabels } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, CheckCircle, XCircle, AlertCircle, 
  DollarSign, Trash2, Edit, User, Calendar, Briefcase, FileText
} from 'lucide-react';

export default function DiariaDetails() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [actionType, setActionType] = useState<'reject' | 'correction' | null>(null);

  const { data: user } = useGetMe();
  const { data: diaria, isLoading, refetch } = useGetDiaria(Number(id), { 
    query: { enabled: !!id, queryKey: ['getDiaria', id] } 
  });

  const approve = useApproveDiaria();
  const reject = useRejectDiaria();
  const requestCorrection = useRequestCorrectionDiaria();
  const markPaid = useMarkDiariaPaid();
  const deleteDiaria = useDeleteDiaria();

  if (isLoading) return <div>Carregando...</div>;
  if (!diaria) return <div>Diária não encontrada.</div>;

  const showFinancials = user?.role !== 'prestador' && user?.role !== 'funcionario';
  const isAdmin = user?.role === 'admin';
  const isGestor = user?.role === 'gestor';

  const handleAction = (actionFn: any, isDelete = false) => {
    const payload = isDelete ? { id: Number(id) } : { id: Number(id), data: { note: note || null } };
    
    actionFn.mutate(payload, {
      onSuccess: () => {
        toast({ title: 'Ação realizada com sucesso.' });
        if (isDelete) {
          setLocation('/diarias');
        } else {
          refetch();
          setIsNoteOpen(false);
          setNote('');
        }
      },
      onError: () => toast({ title: 'Erro ao realizar ação', variant: 'destructive' })
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/diarias" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 w-9">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Diária #{diaria.id}
              </h1>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColors[diaria.status]}`}>
                {statusLabels[diaria.status]}
              </span>
            </div>
            <p className="text-muted-foreground mt-1">
              Criada em {formatDate(diaria.createdAt)} por {diaria.createdByName}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Gestor Actions */}
          {(isGestor || isAdmin) && (diaria.status === 'pendente_aprovacao' || diaria.status === 'solicitacao_correcao') && (
            <Link href={`/diarias/${diaria.id}/editar`} className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 gap-2">
              <Edit size={16} /> Editar
            </Link>
          )}

          {/* Admin Actions */}
          {isAdmin && diaria.status === 'pendente_aprovacao' && (
            <>
              <Button onClick={() => handleAction(approve)} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle className="w-4 h-4 mr-2" /> Aprovar
              </Button>
              <Button variant="outline" onClick={() => { setIsNoteOpen(true); setActionType('correction'); }}>
                <AlertCircle className="w-4 h-4 mr-2" /> Solicitar Correção
              </Button>
              <Button variant="destructive" onClick={() => { setIsNoteOpen(true); setActionType('reject'); }}>
                <XCircle className="w-4 h-4 mr-2" /> Rejeitar
              </Button>
            </>
          )}

          {isAdmin && diaria.status === 'exportada' && (
            <Button onClick={() => handleAction(markPaid)} className="bg-green-600 hover:bg-green-700">
              <DollarSign className="w-4 h-4 mr-2" /> Marcar como Paga
            </Button>
          )}

          {(isAdmin || isGestor) && (diaria.status === 'pendente_aprovacao' || diaria.status === 'rejeitada') && (
            <Button variant="destructive" onClick={() => {
              if (confirm('Tem certeza que deseja excluir esta diária?')) {
                handleAction(deleteDiaria, true);
              }
            }}>
              <Trash2 className="w-4 h-4 mr-2" /> Excluir
            </Button>
          )}
        </div>
      </div>

      {isNoteOpen && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="pt-6">
            <h3 className="font-medium mb-2">
              {actionType === 'reject' ? 'Motivo da Rejeição' : 'Instruções de Correção'}
            </h3>
            <textarea 
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-4"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Digite o motivo..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsNoteOpen(false); setNote(''); }}>Cancelar</Button>
              <Button 
                variant={actionType === 'reject' ? 'destructive' : 'default'}
                onClick={() => handleAction(actionType === 'reject' ? reject : requestCorrection)}
              >
                Confirmar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase size={18} className="text-primary" />
              Detalhes do Serviço
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Prestador</p>
                <div className="flex items-center gap-2 mt-1 font-medium">
                  <User size={16} className="text-muted-foreground" />
                  {diaria.providerName}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Equipe</p>
                <p className="mt-1 font-medium">{diaria.teamName}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Data do Trabalho</p>
                <div className="flex items-center gap-2 mt-1 font-medium">
                  <Calendar size={16} className="text-muted-foreground" />
                  {formatDate(diaria.workDate)}
                </div>
              </div>
              {showFinancials && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Valor</p>
                  <p className="mt-1 font-medium text-emerald-600 text-lg">
                    {formatCurrency(diaria.value)}
                  </p>
                </div>
              )}
            </div>

            {diaria.observations && (
              <div className="pt-4 border-t">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                  <FileText size={16} /> Observações
                </p>
                <p className="text-sm bg-muted/30 p-3 rounded-md border">
                  {diaria.observations}
                </p>
              </div>
            )}
            
            {diaria.actionNote && (
              <div className="pt-4 border-t">
                <p className="text-sm font-medium text-destructive flex items-center gap-2 mb-2">
                  <AlertCircle size={16} /> Nota da Aprovação/Correção
                </p>
                <p className="text-sm bg-destructive/10 text-destructive-foreground p-3 rounded-md border border-destructive/20 font-medium">
                  {diaria.actionNote}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Histórico do Workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative pl-6 border-l-2 border-muted space-y-6">
              
              <div className="relative">
                <div className="absolute -left-[31px] bg-background p-1">
                  <div className="w-3 h-3 rounded-full bg-primary ring-4 ring-background" />
                </div>
                <p className="text-sm font-medium">Criação</p>
                <p className="text-xs text-muted-foreground">
                  Por {diaria.createdByName} em {formatDateTime(diaria.createdAt)}
                </p>
              </div>

              {diaria.approvedAt && (
                <div className="relative">
                  <div className="absolute -left-[31px] bg-background p-1">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-background" />
                  </div>
                  <p className="text-sm font-medium">Aprovação</p>
                  <p className="text-xs text-muted-foreground">
                    Por {diaria.approvedByName} em {formatDateTime(diaria.approvedAt)}
                  </p>
                </div>
              )}

              {diaria.exportedAt && (
                <div className="relative">
                  <div className="absolute -left-[31px] bg-background p-1">
                    <div className="w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-background" />
                  </div>
                  <p className="text-sm font-medium">Exportação</p>
                  <p className="text-xs text-muted-foreground">
                    Por {diaria.exportedByName} em {formatDateTime(diaria.exportedAt)}
                    <br />Ref: {diaria.integrationId}
                  </p>
                </div>
              )}

              {diaria.paidAt && (
                <div className="relative">
                  <div className="absolute -left-[31px] bg-background p-1">
                    <div className="w-3 h-3 rounded-full bg-green-500 ring-4 ring-background" />
                  </div>
                  <p className="text-sm font-medium">Pagamento</p>
                  <p className="text-xs text-muted-foreground">
                    Confirmado em {formatDateTime(diaria.paidAt)}
                  </p>
                </div>
              )}

              {diaria.cancelledAt && (
                <div className="relative">
                  <div className="absolute -left-[31px] bg-background p-1">
                    <div className="w-3 h-3 rounded-full bg-slate-500 ring-4 ring-background" />
                  </div>
                  <p className="text-sm font-medium">Cancelamento</p>
                  <p className="text-xs text-muted-foreground">
                    Em {formatDateTime(diaria.cancelledAt)}
                  </p>
                </div>
              )}

            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
