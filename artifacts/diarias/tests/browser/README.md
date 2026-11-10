# Correção financeira: verificação em navegador

Somente `ExportCorrectionDialog`, não a confirmação People. O HTML monta o
componente real e seu CSS com 8 grupos, 24 diárias, um registro excluído e nomes,
referências e documentos legados longos. Há quatro candidatos exclusivamente
sintéticos, incluindo dois com o mesmo nome e IDs locais, IDs People e CNPJs
diferentes. IDs People e CNPJ de destino continuam válidos para permitir a
conferência.

## Execução reproduzível comprovada

Executar da raiz do repositório, com o workflow **Controle de Diárias**
(somente Vite) em execução e a prévia HTTP local disponível em `localhost:80`.
Não iniciar o servidor de API. A configuração foi comprovada no host
Ubuntu 24.04 x86_64 com Nix, Node 24 e as dependências do `pnpm-lock.yaml`.
Não é uma receita validada para outros sistemas operacionais.

```sh
pnpm --filter @workspace/diarias test:correction:setup
PLAYWRIGHT_JSON_OUTPUT_FILE="$PWD/generated-artifacts/correction-runtime/reordered-results.json" \
  pnpm --filter @workspace/diarias test:correction \
  export-correction.spec.ts --grep 'exact reordered receipt' --reporter=list,json
```

O preparo exige acesso aos downloads oficiais do Playwright e à fonte/cache
Nix; não acessa serviços da aplicação. Instala os builds do Playwright **1.64.0**
em uma área privada e ignorada, copia os originais antes de aplicar os ajustes e
abre uma página estática sem rede em cada engine antes de marcar o runtime
como pronto. É seguro repetir o preparo: não modifica o cache compartilhado.

`runtime.nix` fixa a revisão **e o hash** do nixpkgs. O runtime usa somente
as bibliotecas dessa árvore de dependências, incluindo glibc **2.40**,
Mesa **25.0.7** e patchelf **0.18.0-unstable-2025-02-15**. Não pesquisa nem
concatena todas as bibliotecas do `/nix/store`.
Os executáveis baixados recebem o carregador correspondente e RPATH para
resolver também dependências indiretas. As bibliotecas internas do Firefox
ficam intactas; seu processo recebe a biblioteca do runtime por ambiente.
O WebKit usa o EGL/Mesa fixado com renderização de software (`llvmpipe`),
não a pilha gráfica mais nova do host.

O wrapper remove `LD_AUDIT`, `LD_PRELOAD`, `LD_LIBRARY_PATH` e substituições
herdadas de carregador **somente dos processos de testes**. Também ignora
o executável Chromium opcional para usar o build fixado. A verificação de
dependências orientada a Debian do Playwright é desativada somente nesses
processos, pois não descobre RPATHs Nix; erros reais de inicialização continuam
falhando o preparo e a execução. Não há engine pulada, repetição automática,
alteração de TLS nem relaxamento das asserções. Se a versão do Playwright ou
a configuração de preparo mudar, o wrapper exige novo preparo.

Versões abertas e verificadas: Chromium **156.0.8078.4** (build 1248),
Firefox **157.0** (1555), WebKit **27.2** (2370).
O resultado comprovado deste comando é **18/18**, sem retries ou skips:
os dois recibos reordenados nas nove combinações de engine e largura.
A suíte completa e o arquivo de viewport/CDP não foram executados nesta
verificação. Consulte `export-correction-results.md` para detalhes e limites.

Não inicia servidor de API, não usa credenciais nem banco. A fixture substitui
`fetch` por respostas locais com lista fechada de método/caminho, inclusive
para salvar. O navegador também bloqueia qualquer API real, escrita ou endereço
externo e verifica as violações fora do tratamento de erro do componente.
Fontes externas são substituídas por CSS vazio, sem acesso à rede externa.

Cobertura em 320×568, 390×844 e 1280×800: avisos e resumo acessíveis,
ausência de transbordamento horizontal, rolagem interna, entrada de CNPJ,
motivo e consentimento pelo teclado, habilitação de salvar, contenção de foco,
fechamento por Escape/cancelar/X e retorno do foco após salvar simulado.
Nos três navegadores, ArrowUp/ArrowDown/Home/End operam os selects nativos:
a opção e a identidade detalhada devem corresponder ao ID/CNPJ escolhido.
Trocas entre homônimos e para o último candidato apagam CNPJ e consentimento.
O homônimo salvo é selecionado pelo teclado; o único POST simulado é conferido
para os 24 registros, incluindo ID local, ID People e CNPJ verificado.
Evidências ficam em `generated-artifacts/correction-browser` (fora do Git).
O HTML de teste não integra as entradas do build de produção.

A busca por nome, ID People e CNPJ é exercitada separadamente em cada um dos
nove projetos. Após conferir o prestador, filtros que o incluem, o excluem ou
não encontram ninguém preservam a opção selecionada, ID/CNPJ detalhados,
documento digitado, consentimento, resumo e habilitação de salvar. Limpar a
busca restaura todas as alternativas. A troca explícita para o homônimo apaga
documento e consentimento; o CNPJ antigo não autoriza salvar. Após conferir
novamente, o único POST local é validado para os 24 registros, mesmo com busca
sem resultados. A identidade de outro grupo também deve permanecer intacta.

O cenário separado `?scenario=mixed` usa sete registros: quatro já no
prestador 201/tipo 32, um no mesmo prestador/tipo 33 e dois com vínculo legado
ao prestador 101/tipo 32. Ao escolher o prestador 201 e o tipo 32, o resumo
deve mostrar 3 alterados/4 preservados; no tipo 33, 6 alterados/1 preservado.
Voltar ao tipo 32 restaura 3/4 e exige novo consentimento. Dois casos salvam
separadamente os tipos 32 e 33 e conferem todos os campos do POST e os IDs
exatos de `correctedIds`/`unchangedIds`, calculados localmente a partir dos
registros sintéticos originais. O cadastro sintético de prestadores permanece
igual e não há CNPJ de conferência para o vínculo já correto. A aceitação do
recibo é comprovada pelo fechamento do diálogo e pelo callback de conclusão.
Isso verifica o cliente com respostas simuladas, não a persistência no servidor.
O cenário padrão de 24 alterações e as duas barreiras de rede são preservados.
O comando comprovado acima seleciona somente os dois casos de recibos
reordenados em cada projeto; o caso misto anterior sem reordenação não faz
parte dessa seleção.

O arquivo `export-correction-viewport.spec.ts` também cobre zoom real de página
a 200% no Chromium, texto a 200%, resize e offsets do visual viewport.
Nos dois projetos móveis, troca retrato/paisagem e volta com CNPJ ou motivo
focados, sem rolagem de ajuda após o resize. Com zoom a 200%, simula pan lateral
com `offsetLeft` não zero em todos os projetos, mantendo o campo antigo focado
enquanto a leitura está nos avisos ou botões. Verifica início/fim dos avisos,
ausência de cortes, todos os documentos, motivo, consentimento e posição da
rolagem. Rotação por troca de dimensões e pan por eventos são simulações
explícitas: não representam teclado nativo nem certificação Android/iPhone.
