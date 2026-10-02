# Sincronização People em nome do usuário

Pull request People: https://github.com/DecargoProjetos/sistema-rh/pull/2

## Escopo

Somente sincronização de funcionários e prestadores. Exportação de diárias/faltas
mantém o contrato e a chave existentes. Papéis continuam locais a cada aplicação.
Somente administradores do Diárias podem iniciar a sincronização; a conta People
também precisa das permissões de leitura dos recursos solicitados.

## Contrato com o sistema-rh

1. People emite um código aleatório de uso único, válido por 90 segundos, e o
   inclui como `people_sync_code` no handoff destinado exclusivamente a `diarias`.
2. O backend do Diárias troca o código em
   `POST /api/integration/diarias/user-sync/exchange`, body `{ "code": "..." }`.
3. Toda chamada exige `X-Diarias-Sync-Key`, uma chave dedicada a este cliente.
   Consultas e revogação também exigem `Authorization: Bearer <token-delegado>`.
4. Exchange responde com `access_token`, `token_type`, `expires_in`,
   `id_usuario` e `email`. O Diárias confere os identificadores com o handoff
   verificado, antes de vincular o acesso à sessão.
5. Consultas: `GET .../funcionarios?page=1&limit=100` e `GET .../prestadores`.
   A primeira retorna `{ data, total, page, limit }`; a segunda retorna um array.
   Somente campos necessários ao importador são expostos, nunca folha/salários,
   documentos pessoais ou dados bancários.
6. Logout usa `POST .../revoke`, sem body.

O token delegado dura no máximo 8 horas, acompanhando a sessão do Diárias.
Não há renovação indefinida: expirado ou revogado, o usuário entra novamente
pelo DECARGO ID. O People revalida conta ativa, acesso ao app, revisão de senha,
troca obrigatória, LGPD e permissões em cada consulta.

## Armazenamento

People armazena apenas hashes dos códigos e tokens. O consumo de código é um
UPDATE condicional, seguro entre instâncias concorrentes. No Diárias, o token
fica criptografado com AES-256-GCM no banco, vinculado ao usuário e ao identificador
de sessão. O navegador recebe apenas o JWT local com a referência da sessão.
O token People não é colocado em URLs, no JWT local nem no storage do navegador.

Rotação de SESSION_SECRET invalida a criptografia das sessões existentes:
os usuários devem entrar novamente. Logout remove a sessão local mesmo quando
o People estiver indisponível; a delegação externa nesse caso expira em até 8h.

## Ativação, somente após aprovação da pull request People

1. Aplicar a migração aditiva `lib/db/migrations/diarias_user_sync.sql` no People
   e `lib/db/migrations/people_user_sync.sql` no Diárias (ou o deploy Drizzle
   equivalente, conferindo o diff antes de executar).
2. Configurar uma mesma chave dedicada por armazenamento seguro:
   People: `DIARIAS_USER_SYNC_API_KEY`; Diárias: `PEOPLE_USER_SYNC_API_KEY`.
   NÃO reutilizar SESSION_SECRET ou a chave da exportação financeira.
3. Publicar primeiro o People, com `DIARIAS_USER_SYNC_ENABLED=true`.
   O handoff continua compatível: apenas acrescenta um campo opcional.
4. Publicar o Diárias e só então habilitar `PEOPLE_USER_SYNC_ENABLED=true`.
   `PEOPLE_API_URL` deve usar HTTPS e apontar para o serviço People correto.
5. Administradores saem e entram novamente pelo portal DECARGO ID.
6. Validar sincronização com um administrador autorizado no People e uma conta
   sem permissão. A segunda deve receber bloqueio, sem recorrer à conta de serviço.

As flags ficam desativadas por padrão. Não houve alteração de produção ou
configuração de segredos durante a preparação do código.

## Erros

- 409 `PEOPLE_SYNC_REAUTH_REQUIRED` no Diárias: sessão sem delegação/expirada;
  entrar novamente pelo DECARGO ID.
- 403 `PEOPLE_SYNC_PERMISSION_DENIED`: falta de permissão da própria conta People.
- 403 `PEOPLE_SYNC_ACCOUNT_ACTION_REQUIRED`: concluir senha/LGPD no People.
- 503 `PEOPLE_SYNC_UNAVAILABLE`: integração não configurada ou People indisponível.

Não há fallback automático para credenciais de serviço quando a nova flag está ativa.