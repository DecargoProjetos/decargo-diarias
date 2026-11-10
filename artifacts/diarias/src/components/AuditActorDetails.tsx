import type { AuditLog } from '@workspace/api-client-react';

type ActorDetails = Pick<AuditLog, 'userId' | 'userName' | 'userNameAtAction'>;

export function AuditActorDetails({ log }: { log: ActorDetails }) {
  return (
    <div className="space-y-1">
      <div>Nome na época: {log.userNameAtAction ?? 'Nome histórico não registrado'}</div>
      {log.userId != null && <div>Usuário #{log.userId}</div>}
      <div className="text-muted-foreground">Nome atual: {log.userName ?? 'Nome atual não disponível'}</div>
    </div>
  );
}
