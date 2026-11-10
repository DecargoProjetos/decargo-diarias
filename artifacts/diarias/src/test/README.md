# Testes da interface de confirmação People

Execute `pnpm --filter @workspace/diarias run test:ui` na raiz do workspace.
O comando `pnpm --filter @workspace/diarias run test` executa também os testes
existentes de identidade.

As quatro suítes renderizam os componentes reais, incluindo os portais Radix,
e usam os hooks gerados com um QueryClient novo por teste. Somente o transporte
HTTP é simulado; não é necessário iniciar a API, autenticar uma conta nem
configurar banco de dados ou credenciais.

`setup.ts` bloqueia a rede por padrão. `peopleFixtures.tsx` responde somente
às rotas GET explicitamente conhecidas com dados inventados. Qualquer rota não
tratada ou tentativa de escrita faz o teste falhar, sem encaminhamento à rede.
Não adicione passthrough nem dados extraídos de cadastros reais.

Cobertura:
- usuário com provider vinculado, prestador independente e colisão numérica de IDs;
- pessoa sem diárias vinculadas, fechamento/reabertura, reinício de página e resposta atrasada;
- consulta por pessoa, paginação e filtro de confirmações na auditoria;
- documento longo completo com quebras de linha e classes de leitura;
- estados de carregamento, ausência de evidência, campos históricos ausentes e lista vazia;
- falha HTTP e tentativa novamente preservando pessoa, página e filtro;
- controles administrativos ausentes após carregar os papéis não administradores.

Os testes de documento verificam o conteúdo e as classes; jsdom não mede
dimensões, rolagem ou layout visual em dispositivos.

## Cache de atividade entre sessões

`Dashboard.sessionCache.test.tsx` usa o `SessionQueryProvider`, o `Shell`, o
Dashboard e os hooks gerados reais, com tokens, identidades e HTTP inteiramente
sintéticos. Verifica saída com atividade em cache e nova entrada nos papéis
admin, prestador, funcionario e gestor; ausência dos nomes e ações anteriores
enquanto a identidade e a atividade novas aguardam resposta; bloqueio das
consultas do Dashboard para gestor; cancelamento de uma atualização antiga com
resposta atrasada; e substituição direta da credencial. Não testa indicadores,
escopo SQL, banco ou autenticação real.

Para executar somente essa cobertura:
`pnpm --filter @workspace/diarias exec vitest run --config vitest.config.ts src/pages/Dashboard.sessionCache.test.tsx`.


## Saída pelo botão Sair

`components/layout/Sidebar.logout.test.tsx` clica no botão real dentro do
`SessionQueryProvider`, do Shell e do Dashboard. O POST de logout é sintético e
fica pendente até o teste liberar sucesso HTTP 200 ou falha HTTP 503, exercitando
os dois callbacks da mutação real. O redirecionamento é interceptado sem abrir
o portal. Nos dois casos, o token armazenado e todo o cache são apagados antes
da navegação; nomes, ações anteriores e controles administrativos desaparecem.
Não usa autenticação real, API externa ou banco.

Para executar somente essa cobertura:
`pnpm --filter @workspace/diarias exec vitest run --config vitest.config.ts src/components/layout/Sidebar.logout.test.tsx`.
## Entrada pelo portal

`App.handoff.test.tsx` importa o App somente depois de instalar um fragmento
de URL fictício. Exercita HandoffGate, SessionQueryProvider e a instalação da
credencial reais; substitui as páginas por um observador de montagem, sem hooks
de login ou consultas externas. O único HTTP permitido é o POST sintético de
handoff, sem encaminhamento à rede.

Verifica remoção imediata do fragmento, bloqueio das rotas durante a troca,
limpeza dos caches de consultas e mutações antes de notificar a nova sessão,
uma única troca mesmo após renderizações e remontagem das rotas por outra
credencial, falhas HTTP/rede bloqueando o app e entrada sem fragmento.

Para executar somente essa cobertura:
`pnpm --filter @workspace/diarias exec vitest run --config vitest.config.ts src/App.handoff.test.tsx`.

## Correção de prestador ou tipo na análise

`components/ExportCorrectionDialog.test.tsx` e
`pages/AnaliseDiarias.correction.test.tsx` renderizam o diálogo, a página e
os clientes gerados reais. `exportCorrectionFixtures.tsx` intercepta todo HTTP
com uma lista fechada de método e rota: somente os dois POSTs de conferência e
correção são simulados como escritas. Aprovação, exportação, liberação de reserva
e alterações em Pessoas/contas são proibidas. Origens externas, rotas desconhecidas,
XMLHttpRequest, WebSocket e sendBeacon (quando disponível) são bloqueados, sem
encaminhamento à rede. Tentativas proibidas ficam registradas e fazem o teste
falhar no encerramento, mesmo quando a interface captura o erro.

Todos os nomes, IDs, documentos e respostas são inventados. Não é necessário
iniciar serviços, configurar banco ou fornecer credenciais. Cada teste usa
um cache novo e limpa os observadores ao terminar.

Cobertura:
- escolha explícita por ID com nomes iguais, IDs selecionados congelados e
  dados de concorrência no payload;
- CNPJ digitado independentemente, divergência/ausência, limpeza do documento
  e consentimento ao trocar vínculo, exceção para alteração apenas de tipo;
- motivo mínimo após remover espaços e consentimento obrigatório;
- aviso de documento local ausente, sem preencher ou alterar Pessoas;
- conferência incompleta, duplicada, desconhecida ou reservada bloqueada;
- conflito HTTP 409 sem repetição automática, inclusive após avançar o relógio
  em um minuto; nova conferência somente por ação explícita;
- resultado incompleto sem confirmação de sucesso ou repetição da correção;
- sucesso limpando seleção e nome, retornando à primeira página e a Pendente
  de aprovação, preservando equipe e atualizando lista, indicadores, relatório,
  Dashboard e auditoria, sem atualizar o cadastro de prestadores. Relatórios
  e Dashboard são montados como páginas reais para testar suas chaves de cache
  próprias e os endpoints gerados; em conflitos ou resultados incompletos,
  suas consultas e dados permanecem sem atualização.

Execute apenas estas suítes:

```sh
pnpm --filter @workspace/diarias exec vitest run --config vitest.config.ts src/components/ExportCorrectionDialog.test.tsx src/pages/AnaliseDiarias.correction.test.tsx
```

São regressões de interação em jsdom, não uma conferência visual de layout.
