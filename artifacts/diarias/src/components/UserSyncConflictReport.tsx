import type { UserSyncResult, UserSyncConflict, UserSyncEmployee, UserSyncReport, UserSyncReportPage } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';

const REASONS: Record<UserSyncConflict['reasons'][number], string> = {
  employee_id_account_collision: 'ID de funcionário colide com a referência de uma conta com outro e-mail.',
  ambiguous_local_email: 'E-mail corresponde a mais de uma conta local, incluindo inativas.',
  duplicate_source: 'Mais de um registro na origem usa o mesmo ID de funcionário ou e-mail.',
  invalid_employee_id: 'ID de funcionário inválido na origem.',
};

function Employee({ employee }: { employee: UserSyncEmployee }) {
  return <div className="text-sm break-words">
    <strong>{employee.name}</strong> — {employee.active ? 'Ativo' : 'Inativo (demitido)'}
    <div>ID funcionário People: <span className="font-mono">{employee.employeeId}</span></div>
    <div>E-mail normalizado: {employee.email || 'Não informado'}</div>
  </div>;
}

/** Historical evidence only, not an identity-confirmation surface. */
export function UserSyncConflictReport({ result, savedReport, failed, loading, historyFailed, unavailable, history, historyLoading, page, selectedReportId, onPageChange, onSelect, onReload, onLocate }: {
  result: UserSyncResult | null;
  savedReport: UserSyncReport | null;
  failed: boolean;
  loading: boolean;
  historyFailed: boolean;
  unavailable: boolean;
  history: UserSyncReportPage | null;
  historyLoading: boolean;
  page: number;
  selectedReportId: string | null;
  onPageChange: (page: number) => void;
  onSelect: (id: string | null) => void;
  onReload: () => void;
  onLocate: (localUserId: number) => void;
}) {
  return <Card className="border-amber-200">
    <CardContent className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Relatórios de funcionários</h2>
        <Button variant="outline" size="sm" onClick={onReload} disabled={loading || historyLoading}>
          {loading ? 'Consultando relatório…' : 'Atualizar relatório salvo'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Execuções concluídas ficam disponíveis por 30 dias. Consultar este relatório não chama o People nem repete a importação.
      </p>
      <div className="space-y-2" aria-label="Selecionar execução salva por data">
        <Button variant={selectedReportId === null ? 'secondary' : 'outline'} size="sm"
          aria-pressed={selectedReportId === null} onClick={() => onSelect(null)}>
          Execução mais recente
        </Button>
        {historyLoading ? <p role="status" className="text-sm">Consultando execuções salvas…</p> :
          history?.reports.filter(report => new Date(report.expiresAt).getTime() > Date.now()).map(report =>
            <Button key={report.id} variant={selectedReportId === report.id ? 'secondary' : 'outline'}
              className="w-full h-auto whitespace-normal justify-start text-left" size="sm"
              aria-pressed={selectedReportId === report.id} onClick={() => onSelect(report.id)}>
              {formatDateTime(report.completedAt)} — {report.conflicts} conflito(s), {report.created} criado(s)
              {' '}({report.id.slice(0, 8)})
            </Button>)}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1 || historyLoading}
            onClick={() => onPageChange(page - 1)}>Execuções mais recentes</Button>
          <span className="text-sm">Página {page}</span>
          <Button variant="outline" size="sm" disabled={!history?.hasMore || historyLoading}
            onClick={() => onPageChange(page + 1)}>Execuções mais antigas</Button>
        </div>
        {!historyLoading && history?.reports.length === 0 && page > 1 &&
          <p className="text-sm">Nenhuma execução vigente nesta página. Volte às execuções mais recentes.</p>}
      </div>
      {failed && <p role="alert" className="text-sm">
        A última tentativa de sincronização falhou. O relatório salvo abaixo, se disponível, não representa essa tentativa.
      </p>}
      {historyFailed && <p role="alert" className="text-sm">
        Não foi possível consultar o histórico. Isso não significa que a importação falhou.
        Use “Atualizar relatório salvo” para tentar a consulta novamente.
      </p>}
      {unavailable && <p role="alert" className="text-sm">
        Esta execução não está disponível ou expirou. Selecione outra execução vigente.
      </p>}
      {loading && !result && <p role="status" className="text-sm">Consultando a execução selecionada…</p>}
      {!loading && !historyFailed && !unavailable && !result && <p className="text-sm">
        Nenhum relatório salvo nos últimos 30 dias. Tentativas que falharam antes da conclusão não geram relatório.
      </p>}
      {result && <>
        {savedReport ? <p className="text-sm">
          Execução concluída em {formatDateTime(savedReport.completedAt)}.
          {' '}Disponível até {formatDateTime(savedReport.expiresAt)}.
          {historyFailed && ' Exibindo a última versão consultada; não foi possível atualizá-la.'}
        </p> : <p className="text-sm">Resultado da tentativa atual. Consultando os dados do relatório salvo.</p>}
        <p className="text-sm">{result.created} criado(s), {result.skipped} já existente(s) ou sem e-mail e {result.conflicts} ignorado(s) por conflito, de {result.synced} registro(s) na origem.</p>
        <p className="text-sm text-muted-foreground">
          Evidências no momento da execução; os cadastros podem ter mudado desde então.
          IDs de funcionário People, IDs locais do Diárias e referências externas de contas são domínios diferentes.
          A referência externa pode ser legada ou manual; números iguais não comprovam identidade.
          Nenhum conflito altera cadastros, login, permissões ou confirma vínculos.
        </p>
        {result.conflictDetails.length === 0
          ? <p className="text-sm">Nenhum conflito de funcionário nesta sincronização.</p>
          : result.conflictDetails.map((conflict, index) => <details key={`${savedReport?.id ?? 'current'}-${index}`} className="rounded border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {conflict.employee.name} — ID funcionário People {conflict.employee.employeeId}
            </summary>
            <div className="space-y-3 mt-3">
              <Employee employee={conflict.employee} />
              <ul className="text-sm list-disc pl-5">{conflict.reasons.map(reason => <li key={reason}>{REASONS[reason]}</li>)}</ul>
              <h3 className="text-sm font-semibold">Contas locais envolvidas</h3>
              {conflict.localAccounts.length === 0 && <p className="text-sm">Nenhuma conta local correspondente. Confira os registros na origem People.</p>}
              {conflict.localAccounts.map(account => <div key={account.localUserId} className="rounded bg-muted p-3 text-sm space-y-1 break-words">
                <div><strong>{account.name}</strong> — {account.active ? 'Ativa' : 'Inativa'}</div>
                <div>ID local Diárias: <span className="font-mono">{account.localUserId}</span></div>
                <div>Referência externa armazenada na conta: <span className="font-mono">{account.externalReference}</span></div>
                <div>E-mail cadastrado: {account.email}</div>
                <Button size="sm" variant="outline" onClick={() => onLocate(account.localUserId)}>Localizar cadastro local #{account.localUserId}</Button>
              </div>)}
              {conflict.reasons.includes('duplicate_source') && <>
                <h3 className="text-sm font-semibold">Registros envolvidos na origem People</h3>
                {conflict.sourceEmployees.map((employee, sourceIndex) => <Employee key={sourceIndex} employee={employee} />)}
              </>}
            </div>
          </details>)}
      </>}
    </CardContent>
  </Card>;
}
