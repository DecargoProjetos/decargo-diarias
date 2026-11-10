import type { AuditLog, ConfirmationProvider } from '@workspace/api-client-react';
import { formatDateTime } from '@/lib/utils';

const recordLabel = (record: ConfirmationProvider | null | undefined) =>
  record ? `#${record.id} — ${record.name ?? 'Nome não registrado'} (DECARGO ID: ${record.decargoId ?? 'não registrado'})` : 'Não registrado';

export function PeopleConfirmationDetails({ log }: { log: AuditLog }) {
  const confirmation = log.peopleConfirmation;
  if (!confirmation) return <p className="text-muted-foreground">Não há evidência registrada de confirmação deste vínculo People.</p>;
  const cnpj = confirmation.verifiedCnpj?.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5',
  );
  return (
    <dl className="space-y-3 text-sm [&_dt]:font-medium [&_dd]:text-muted-foreground [&_dd]:break-words">
      <div><dt>Responsável pela confirmação — nome na época</dt><dd>{confirmation.confirmedByName ?? 'Nome histórico não registrado'}{log.userId != null ? ` — usuário #${log.userId}` : ''}</dd></div>
      <div><dt>Nome atual no cadastro de usuários</dt><dd>{log.userName ?? 'Nome atual não disponível'}</dd></div>
      <div><dt>Data da confirmação</dt><dd>{formatDateTime(log.timestamp)}</dd></div>
      <div><dt>Identidade People</dt><dd>{confirmation.externalId ?? 'Não registrada'}</dd></div>
      <div><dt>CNPJ verificado</dt><dd>{cnpj ?? 'Não registrado'}</dd></div>
      <div><dt>Descrição do documento conferido</dt><dd className="whitespace-pre-wrap">{confirmation.documentDescription ?? 'Não há evidência documental registrada.'}</dd></div>
      <div><dt>Cadastro preservado</dt><dd>{recordLabel(confirmation.preservedProvider)}</dd></div>
      <div><dt>Cadastro retirado</dt><dd>{confirmation.removedProvider ? recordLabel(confirmation.removedProvider) : 'Nenhum cadastro retirado nesta confirmação.'}</dd></div>
      <p className="text-xs text-muted-foreground">Os dados da confirmação, incluindo o nome na época quando registrado, são históricos. O nome atual é consultado no cadastro de usuários e não substitui um nome histórico ausente.</p>
    </dl>
  );
}
