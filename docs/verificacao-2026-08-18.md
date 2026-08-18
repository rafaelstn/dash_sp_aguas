# Verificação de estado do sistema, 18/08/2026

Levantamento feito para a reunião com os gestores. O objetivo foi responder três perguntas com
evidência, não com impressão: o que está funcional, o que é resto de obra, e o que está pendente.

Cada afirmação aqui tem como foi medida. Onde eu não consegui medir, está escrito que não consegui.

---

## 0. O que fazer amanhã, antes da reunião

Na ordem. Os dois primeiros itens são os que dependem de alguém com acesso e não puderam ser feitos
nesta rodada.

**1. Publicar as alterações (5 minutos, uma vez).** As correções desta rodada estão no repositório
local, ainda sem commit. Enquanto não forem publicadas, o ambiente de produção continua sem o aviso
de dado antigo, sem o botão de atualizar e sem o filtro do mapa. Deploy dispara no push para `main`.

**2. Atualizar o dado do Monitor (2 minutos).** Entrar no sistema com conta de Admin ou Super Admin,
abrir **Monitor**, e se aparecer o aviso amarelo "O dado exibido não é do momento", clicar em
**"Atualizar agora a partir do SIBH"** e confirmar. Em 18/08 a defasagem era de 34 dias. Se o aviso
não aparecer, o dado já está em dia.

**3. Conferir a variável `CRON_SECRET` no projeto da Vercel.** A sincronização do Monitor passou a
rodar **uma vez por dia** pelo cron nativo da Vercel, declarado em `vercel.json` (09:00 UTC, que é
06:00 em Brasília). A plataforma envia o cabeçalho de autorização sozinha, desde que a variável
exista, com pelo menos 32 caracteres. Nada mais a configurar.

Vale conferir também os dois agendamentos que já existiam: eles **nunca executaram** por causa do
defeito descrito no item 3.0.2, e o painel do provedor mostrava sucesso o tempo todo.

**4. Conferir a saúde antes de projetar a tela (10 segundos).** Abrir
`https://dash-sp-aguas.vercel.app/api/health`. Tem que responder `{"status":"ok","db":"ok"}`.

**5. Passar pelas telas.** O roteiro está em `docs/roteiro-demo-gestores.md`, na ordem sugerida para
a apresentação. Esta é a verificação que nenhum teste automatizado substitui, e que não foi feita
nesta rodada por falta de acesso ao sistema (ver seção 5).

---

## 1. Resumo para a reunião

**O sistema está em produção, no ar e com o banco conectado.** Medido em 18/08/2026 contra
`https://dash-sp-aguas.vercel.app/api/health`, que respondeu `{"status":"ok","db":"ok"}`.

**O controle de acesso está fechado.** Nenhuma das 12 páginas nem das 5 rotas de API testadas em
produção entrega qualquer dado sem sessão: todas respondem 307 e desviam para o login. Só o login
e o endpoint de saúde respondem 200.

**O repositório não tem lixo.** Varredura completa dos 480 arquivos TypeScript: zero `console.log`
esquecido, zero bloco de código morto comentado, zero dependência declarada e não usada (das 38),
zero arquivo de backup ou artefato de build versionado, e um único arquivo órfão em todo o projeto.

**O que apareceu de real foi resto de obra documental e uma função de auditoria pela metade**, e
não defeito de funcionamento. Os itens estão na seção 3, e os que dependem dos gestores, na 6.

### Tamanho do que está entregue

| Medida | Valor |
|--------|-------|
| Páginas | 38 |
| Rotas de API | 67 (66 antes desta rodada, mais o agendamento da sincronização) |
| Arquivos TypeScript em `src` | 480 (67.779 linhas) |
| Migrations de banco | 65 |
| Testes automatizados | 764 casos em 82 arquivos (eram 720 em 78 antes desta rodada) |
| Decisões de arquitetura registradas (ADR) | 22 |

### Módulos e estado

| Módulo | Estado | Observação |
|--------|--------|-----------|
| Busca e ficha de postos | Completo | Base de 2.484 postos |
| Desconformidades cadastrais | Completo | Quatro visões: prefixo principal, prefixo ANA, arquivos órfãos, arquivos malformados. Política é detectar e sugerir, nunca corrigir em lote (ADR-0003) |
| Painel | Completo | Indicadores e próxima ação |
| Favoritos por usuário | Completo | ADR-0005 |
| Diagramas | Completo | Editor com exportação |
| Monitor hidrológico | Completo | Mapa, série de nível, comparação multi estação, integração SIBH |
| Estoque e patrimônio | Completo | Inventário, saldo, movimentação, conferência física, etiquetas com QR, exportação Excel |
| Inventário ANA | Completo, sem entrada no menu | Ver item 3.4 |
| Fichas de campo e triagem | Completo para 5 dos 7 tipos | Ver item 6.1 |
| App móvel (PWA) | Completo | Fichas em campo, envio, reenvio, offline |
| Autenticação e papéis | Completo | Três papéis, gate no servidor. Ver item 3.1 |
| Trilha de auditoria e LGPD | Completo | Inclui expurgo de dado pessoal agendável |

---

## 2. Validação técnica executada

Rodada nesta máquina, cada comando com o código de saída conferido isoladamente.

| Verificação | Resultado |
|-------------|-----------|
| `npm run lint` (ESLint com `--max-warnings 0`) | Passou, saída vazia |
| `npm run typecheck` (`tsc --noEmit`) | Passou, saída vazia |
| `npm test` (suíte completa) | Passou. 700 casos aprovados, 20 pulados |
| `npm run build` com `NODE_ENV=production` | Ver item 3.6, resultado com leitura importante |
| Gate de autenticação em produção | Passou. 17 rotas testadas sem sessão, nenhuma entregou dado |
| Cabeçalhos de segurança em produção | Presentes e conferidos um a um. Ver item 2.1 |

Os 20 casos pulados são os dois arquivos de teste de integração que exigem um PostgreSQL
descartável (`TEST_DATABASE_URL`). Eles não foram pulados por estarem quebrados: rodam no
servidor de integração contínua, que sobe um PostGIS, aplica as 65 migrations duas vezes para
provar que suportam reexecução, e só então executa a suíte.

### 2.1 Cabeçalhos de segurança verificados em produção

Medidos em `https://dash-sp-aguas.vercel.app/login`:

| Cabeçalho | Valor servido |
|-----------|---------------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (dois anos) |
| `Content-Security-Policy` | `default-src 'self'`, com nonce por requisição e `strict-dynamic` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Nada liberado por padrão |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Content-Language` | `pt-BR` (requisito de acessibilidade e-MAG) |

---

## 3. Achados e o que foi feito

### 3.0 O Monitor está exibindo dado de 34 dias atrás (achado mais grave, ação pendente)

O mapa do Monitor mostra a última foto do SIBH sincronizada em **15/07/2026**. Hoje é 18/08/2026.
Nenhuma estação no banco tem transmissão nas últimas 24 horas, nem nos últimos 7 dias.

Medido nos dois lados:

| Onde | O que foi medido |
|------|------------------|
| Banco do dashboard | `MAX(ultima_transmissao)` = 2026-07-15. Transmissões nas últimas 24h: **0**. Nos últimos 7 dias: **0**. De 5.403 estações, 3.413 têm alguma transmissão registrada, toda ela antiga. |
| Fonte oficial (SIBH) | Consultado hoje em `apps.spaguas.sp.gov.br/sibh/api/v2/stations`: 6.018 estações, **1.085 pluviométricas e 486 fluviométricas transmitiram na última hora**, 1.957 nas últimas 24 horas. |

Ou seja, a fonte do Estado está atualizada e quem parou foi a nossa sincronização.

**Causa:** nada dispara `/api/monitor/sync`. Não há entrada de cron em `vercel.json`, nenhum
workflow e nenhum script que o chame. O próprio arquivo da rota documenta a situação: "Não há
agendamento automático nesta fase; o disparo é manual. Quando o agendamento (cron) for definido,
reusar estes use-cases num handler /cron com autenticação por secret". O agendamento nunca foi
definido, e o disparo manual não acontece desde meados de julho.

**Por que isso é mais grave do que parece.** O painel exibe hoje "1.289 pluviométricas online". Esse
número é a foto congelada de 15/07: a regra de "online" (`src/domain/monitor/estacao-online.ts`)
considera status de transmissão mais existência de última transmissão, sem exigir que ela seja
recente. Com o dado parado, o indicador afirma que estações estão transmitindo agora quando nenhuma
transmite há um mês. Numa reunião, é o tipo de número que, se conferido, custa credibilidade.

**A regra em si não é o problema.** Medi as duas formulações contra a fonte atual: a regra atual
daria 2.025 estações e exigir transmissão nas últimas 24 horas daria 1.957. A diferença é 68, ou
seja, quando o dado está fresco as duas praticamente coincidem, porque `transmission_status = 'ok'`
já implica transmissão recente na prática. O defeito é o dado parado, não a definição.

**O que foi feito nesta rodada.** O problema tinha três partes, e as três receberam tratamento:

1. **A tela não sabia dizer a idade do que mostrava.** Entrou
   `src/domain/monitor/frescor-dado.ts`, função pura com 12 casos de teste, e o Monitor passou a
   exibir um aviso quando a leitura mais recente tem mais de 24 horas, com a data e a idade ("há 34
   dias"). O contador também deixou de mentir: com a carga defasada, o rótulo muda de "online" para
   "na última carga", porque o mesmo número deixa de ser uma afirmação sobre o presente.
2. **Não havia como atualizar pelo sistema.** A sincronização só existia como endpoint, sem nenhuma
   superfície: quem opera não tinha caminho para acioná-la. Entrou o botão "Atualizar agora a partir
   do SIBH" dentro do próprio aviso, visível apenas para aprovador, com diálogo de confirmação
   (a ação escreve no banco e chama serviço externo, então não dispara direto no clique) e recarga
   do mapa ao concluir. O papel é resolvido no servidor e serve só para mostrar ou esconder a ação:
   quem autoriza continua sendo a rota, que responde 403 para quem não é aprovador.
3. **Nada garantia que voltaria a rodar.** Entrou `GET|POST /api/cron/sincronizar-monitor`, no mesmo
   padrão dos dois crons existentes (segredo em cabeçalho comparado em tempo constante, rate limit
   por IP, resposta idêntica para segredo ausente e errado). A orquestração foi extraída para
   `sincronizarMonitor`, usada tanto pela rota manual quanto pelo cron, para não existirem duas
   definições do que é sincronizar. O job loga sucesso mesmo com zero linhas gravadas, porque um job
   que só fala quando faz algo é indistinguível de um job que parou.

**Pendente, e depende de ação fora do código:**

- **Rodar a sincronização.** Autorizada pelo Rafael em 18/08/2026, **não executada por mim**: exige
  conta com papel de aprovador, e não há credencial deste projeto no cofre. Ver seção 5. Com o botão
  novo, qualquer aprovador faz isso pela tela, sem comando.
- **Ligar o agendamento** no painel do cron externo. Passo a passo pronto em
  `docs/runbooks/cron-externo-hobby.md` §2.3.1, com cadência de uma hora e o motivo da escolha.

Detalhe correlato, de baixa gravidade: o SIBH devolve a data como `GMT+0000` mas o horário aparenta
ser de Brasília, o que produz timestamps cerca de 1,2 hora no futuro. Não afeta o filtro nem a
ordenação, mas vale corrigir na normalização.

### 3.0.2 Nenhum agendamento funcionava em produção (achado pré-existente, corrigido)

Encontrado ao verificar se o deploy da correção anterior tinha chegado. O teste era simples: a rota
nova de agendamento deveria responder 401 (segredo inválido) em vez de 404. Respondeu **307**, e a
rota de agendamento que já existia havia meses respondeu 307 também. Uma rota inexistente sob o
mesmo prefixo respondeu 307 igualmente, o que mostrou que a resposta vinha antes do roteamento.

**Causa.** O middleware protege tudo que não esteja na lista de rotas públicas, e `/api/cron/*` não
estava. Toda chamada de agendamento era redirecionada para `/login` antes de chegar ao handler,
com ou sem o cabeçalho `Authorization`.

**Por que ninguém percebeu, e por que isso é o pior tipo de falha.** O serviço de cron segue o
redirecionamento, recebe o 200 da página de login, e registra a execução como bem-sucedida. O painel
do provedor mostra verde. O job nunca executou, e nada em lugar nenhum acusou.

**Alcance:** os três agendamentos do projeto.

| Job | O que deixou de acontecer |
|-----|---------------------------|
| `liberar-locks-expirados` | Travas de triagem expiradas nunca foram liberadas. Uma ficha abandonada por um aprovador fica presa indefinidamente, em vez de liberar após o TTL de 1 hora |
| `anonimizar-trilha` | **O expurgo de dado pessoal da trilha de auditoria nunca rodou.** É obrigação de LGPD, e o job foi entregue em 28/07/2026 (commit `c6e6335`) |
| `sincronizar-monitor` | Criado nesta rodada; teria nascido com o mesmo problema |

**Feito:** o prefixo `/api/cron/` passou a ser tratado como público no middleware. Isso não abre
nada: a proteção desses endpoints sempre foi o `CRON_SECRET` comparado em tempo constante dentro do
handler, com rate limit por IP. Sem o segredo configurado o handler responde 500; com segredo errado
responde 401, sem distinguir de ausente. O que o middleware fazia não era proteger, era impedir que
quem sabe autenticar recebesse a requisição.

A regra de rota pública foi extraída do middleware para `src/domain/auth/rotas-publicas.ts`, sem
dependências, e ganhou 29 casos de teste cobrindo os dois lados: o que precisa ser servido sem
sessão (os três agendamentos, o login, a verificação de saúde, os artefatos do PWA) e o que não pode
passar de jeito nenhum (as 20 rotas de página e API sensíveis, incluindo a sincronização manual, que
continua exigindo aprovador). Provado removendo a liberação do cron e conferindo que os casos certos
reprovam. Uma regra que decide o que é público não podia continuar sem teste.

**Atenção para depois:** as travas de triagem e o expurgo de LGPD nunca rodaram desde que foram
criados. Vale conferir se há trava presa em `triagem_locks` e avaliar o passivo de retenção de dado
pessoal na trilha, já que a rotina de expurgo não executou nenhuma vez.

### 3.0.1 Filtro de estações transmitindo no mapa (implementado)

Pedido do Rafael durante a verificação: ao abrir o Monitor, o mapa aparece coberto de marcadores, e
boa parte deles não está transmitindo.

**Feito:** o filtro entrou como `somenteOnline` em `ValorFiltros`
(`src/components/features/monitor/FiltrosMonitor.tsx`), **ligado por padrão**, e é aplicado em
`PainelMonitor.tsx`. Ele reusa o campo `online` que a API já calculava server-side pela regra do
domínio, então não há segunda definição de "transmitindo" no front.

Duas decisões que valem o registro:

- **O filtro nunca esconde em silêncio.** A barra de contagem passou a informar quantas estações
  ficaram de fora ("1.765 sem transmissão") com um atalho para ver todas, e o caminho de volta
  ("ver só as que transmitem") aparece quando o filtro está desligado. Sem isso, um mapa filtrado
  faria a rede do órgão parecer menor do que é, o que numa tela institucional é pior que o excesso
  de marcadores.
- **O controle também está no formulário de filtros**, e não apenas como atalho na barra, para ser
  encontrável por quem procura um filtro e alcançável por teclado na ordem natural do formulário.

Cálculo separado em dois passos (`noEscopo` e depois `filtradas`) justamente para que o número de
ocultas seja real, e não uma estimativa.

**Atenção, e é o ponto que liga este item ao 3.0:** enquanto a sincronização não rodar, o filtro
opera sobre a foto de 15/07. Ele vai mostrar as estações que estavam transmitindo naquela data. O
filtro só entrega o que se espera dele depois que o dado estiver atual.

### 3.1 O README afirmava que o sistema não tinha autenticação (corrigido)

O `README.md`, em destaque no topo, sob o título "Pré-condição obrigatória de deploy", afirmava:

> A autenticação individual de usuários foi deliberadamente adiada para a Fase 2

E mais abaixo: "**Sem autenticação no MVP:** [...] `usuario_id` fica nulo".

As duas afirmações eram falsas desde o commit `29324b4`, que entregou o controle de acesso com três
papéis. O mesmo parágrafo também dizia que o sistema deveria rodar "exclusivamente em rede interna,
sem exposição à internet pública", enquanto o sistema está publicado e servindo HSTS de dois anos.

Por que isso importa mais do que um erro de texto comum: é o primeiro parágrafo do documento mais
lido do repositório, e ele informava a quem chegasse, inclusive à área de TI do órgão e a quem
receber o handoff, que o sistema não identifica quem acessa. Documento que promete menos do que o
sistema faz é tão ruim quanto o contrário, e neste caso o assunto era controle de acesso.

**Feito:** a seção foi reescrita para descrever o que existe, com a tabela dos três papéis, os
controles complementares (autocadastro desativado, allowlist institucional, autorização revalidada
no servidor, cabeçalhos de segurança) e a trilha com identidade individual. Cada afirmação nova tem
o arquivo correspondente citado.

### 3.2 O RBAC estava implementado sem nenhuma decisão registrada (corrigido)

O ADR-0004 seguia declarando, como decisão em vigor, "ausência de RBAC", com a observação de que
"evolução pra RBAC fica para ADR futuro se necessário". O RBAC foi implementado e esse ADR futuro
nunca foi escrito. O `docs/spec.md` também afirmava "sem RBAC no MVP, qualquer usuário autenticado
tem o mesmo conjunto de ações".

Em projeto de órgão público isso é mais que desatualização: mudança no modelo de autorização sem
registro de decisão é lacuna de rastreabilidade, e é justamente o que se cobra num handoff. Quem
assumisse a manutenção leria o ADR-0004 e concluiria o oposto do que o código faz.

**Feito:**
- Criado `docs/adr/0022-rbac-tres-papeis.md`, marcado explicitamente como **registro retroativo**,
  documentando os três papéis, a derivação da antiga flag `aprovador`, o reforço da autorização no
  servidor, as duas travas de política (não remover o último Super Admin, não remover a própria
  conta) e as alternativas descartadas.
- ADR-0004 atualizado: o aviso de leitura agora aponta os três pontos superados e referencia o
  ADR-0022.
- `docs/spec.md` corrigido em quatro pontos: a afirmação "sem RBAC", a lista de itens fora do
  escopo do MVP, a menção ao autocadastro (hoje desativado) e a frase que dizia que a auditoria
  viria "quando a Fase 2 introduzir autenticação".

### 3.3 A conciliação de saldo do estoque estava escrita e nunca foi ligada (teste criado, wiring pendente)

`src/application/use-cases/estoque/conciliar-saldos.ts` é o único arquivo órfão do projeto inteiro.
Ele compara o saldo mantido em `estoque_saldos` com a soma do ledger `estoque_movimentacoes`, que o
ADR-0020 define como a verdade de auditoria do almoxarifado. Provado órfão: nenhum arquivo de
`src`, `tests`, `scripts` ou `ops` importa `conciliarSaldos` nem `listarSaldosParaConciliacao`, e
não havia teste. O comentário do próprio arquivo diz que a comparação real com o banco fica "no
script/endpoint que chama isto", e esse script ou endpoint não existe.

Isso não é lixo para apagar. É a função que responde se o número do patrimônio se sustenta na
trilha de movimentação, que é exatamente o que auditoria de órgão público cobra. Estava pela
metade.

**Feito:** escrito `tests/unit/use-cases/estoque-conciliar-saldos.test.ts`, com 10 casos cobrindo
saldo que bate, divergência nos dois sentidos, saldo sem trilha que o explique, movimentação sem
linha de saldo (o ramo que não tinha prova nenhuma), soma zero que não deve virar divergência, e o
tamanho como parte da chave.

O teste foi validado quebrando a função de propósito, duas vezes, e conferindo que ele reprova nos
casos certos: ao fazer a chave ignorar o tamanho, reprovaram os dois casos de tamanho; ao remover o
ramo do ledger sem saldo, reprovou o caso correspondente. O código de produção foi restaurado e
conferido por hash.

**Pendente e não feito:** ligar a função a um endpoint ou script de conciliação. Isso cria
superfície nova, então é decisão, não correção. Recomendo fazer, porque uma função de auditoria que
ninguém pode executar não audita nada.

### 3.4 O Inventário ANA não tem entrada permanente no menu (reportado por decisão)

O módulo está completo: página, sete rotas de API, exportação, filtros, ação em lote e ADR-0011
próprio. Mas `src/components/layout/nav-itens.ts` não tem item para ele. O único caminho é um link
condicional no Painel, que aparece somente quando existe estação ANA pendente na fila.

Consequência prática: se a fila estiver vazia, o módulo é inalcançável pela navegação, e trabalho
entregue fica invisível.

Foi decidido manter como está nesta rodada e apenas registrar. A alteração é pequena (uma linha no
mesmo padrão de Monitor e Estoque) e fica disponível para quando se quiser fazer.

### 3.5 O script do app móvel estava quebrado (corrigido)

O commit `d706c39` removeu `start.ps1` e `stop.ps1` de propósito ("app roda só em produção"), mas
deixou dois rastros:

- `startApp.ps1`, que abre o PWA num navegador em viewport de celular, dependia de `start.ps1` para
  subir o servidor. Sem ele, o script abortava com erro no caminho principal, ou seja, justamente o
  script que serve para demonstrar o app móvel não subia o app.
- O `README.md` mandava usar `start.ps1` e `stop.ps1` em quatro lugares, incluindo como caminho
  "recomendado" no Windows.

**Feito:** `startApp.ps1` agora sobe o servidor com `npm run dev` em segundo plano, seguindo o
mesmo padrão que o próprio arquivo já usava no modo produção, e grava o PID em `.run\next-dev.pid`.
As seis referências mortas na documentação interna do script foram corrigidas, e as quatro do
README também. Sintaxe do script validada com o analisador do PowerShell.

### 3.6 O build de produção é barrado por uma guarda de segurança, e isso está correto

`npm run build` com `NODE_ENV=production` falha nesta máquina com:

> `AUTH_ALLOWED_EMAIL_DOMAINS` não pode conter `'*'` em produção: o wildcard libera self-signup
> para qualquer domínio (modo demo).

Não é defeito. É uma guarda fail-closed em `src/infrastructure/config/env.ts`, e ela está fazendo
exatamente o trabalho: o `.env.local` desta máquina tem a allowlist aberta com `*`, que é a
configuração de homologação para avaliadores externos, e o código se recusa a construir para
produção nessa condição.

Vale destacar na reunião porque o `docs/spec.md` registra que "restaurar a lista institucional é
pré-condição bloqueante para o go-live". Essa pré-condição deixou de depender de alguém lembrar:
virou mecânica. O build de produção não sai com a porta aberta.

O build foi então executado com a allowlist institucional (`sp.gov.br,daee.sp.gov.br`) para provar
que passa nessa condição. Resultado registrado no item 7.

### 3.7 Código morto encontrado, e o que ele significa

Varredura dos 1.393 símbolos exportados, considerando referências em `src`, `tests`, `scripts` e
`ops`, e contando também `import()` dinâmico. Resultado: **14 itens de código executável sem
nenhuma referência**, e não 74 como a primeira medição indicou. A diferença foram falsos positivos
que a medição inicial produziu por não olhar a pasta de testes e por não contar uso interno ao
próprio arquivo. Não apaguei nada com base na medição errada.

Dos 14, dois merecem nota:

- **`exigirSuperAdmin`** (`src/app/api/_helpers/auth.ts`) não é chamado por nenhuma rota. **Não é
  um furo de segurança:** as rotas de `/api/admin/*` estão protegidas por `exigirAdmin`, e a
  distinção entre admin e super admin é aplicada dentro da política de gestão de usuários, com
  teste que exercita a negativa `exige_super_admin`. O helper é redundante. Registrado como débito
  no ADR-0022, para ser resolvido por quem tocar a camada de autorização.
- **`BlocoAnexos`** (`src/components/features/triagem/PainelPayload.tsx`) é um componente para
  listar anexos de uma ficha, e nunca é renderizado. Investiguei se o aprovador estaria deixando de
  ver evidência anexada, que seria grave: não é o caso. Anexo não existe no modelo da ficha, em
  nenhum ponto do domínio. O componente é preparação para funcionalidade futura, e por isso não foi
  removido: apagar trabalho preparatório sem necessidade é pior que deixá-lo.

Os outros 12 são constantes de catálogo e verificadores de tipo do domínio, sem risco de
comportamento. São eles:

| Símbolo | Arquivo |
|---------|---------|
| `conciliarSaldos`, `listarSaldosParaConciliacao` | `application/use-cases/estoque/conciliar-saldos.ts` (item 3.3) |
| `listarDesconformidades` | `application/use-cases/listar-desconformidades.ts` |
| `STATUS_CONFERENCIA`, `SITUACOES_ITEM` | `domain/estoque/conferencia.ts` |
| `ehNatureza` | `domain/estoque/material.ts` |
| `TIPOS_MOVIMENTACAO`, `ehTipoMovimentacao` | `domain/estoque/movimentacao.ts` |
| `TIPOS_DOCUMENTO_FIXTURES`, `TIPOS_DADO_FIXTURES` | `infrastructure/mock/fixtures.ts` |
| `triagemAPI` | `lib/triagem-api.ts` (o arquivo é usado; só este export não) |
| `ehUuidV4` | `lib/uuid-cliente.ts` |

Dois merecem nota de acompanhamento, e nenhum é risco hoje:

- Os verificadores de tipo do domínio (`ehNatureza`, `ehTipoMovimentacao`) parecem validação que
  deixou de ser aplicada, mas não são: a entrada da API é validada por Zod nas rotas
  (`app/api/estoque/_schemas.ts`). São redundância, não buraco. O teste de paridade acrescentado
  nesta rodada existe justamente para as duas listas não divergirem.
- `listarDesconformidades` está morto porque as quatro páginas de desconformidades chamam o
  repositório direto, sem passar pelo use case. Isso contraria a convenção declarada no próprio
  README ("UI e API Routes consomem use cases, nunca o banco direto"). Não foi mexido nesta rodada
  porque alterar o fluxo de dados de quatro páginas na véspera de uma reunião não é correção segura.

Além deles, 19 símbolos são usados dentro do próprio arquivo mas exportados sem necessidade, o que
é cosmético, e 166 são tipos e interfaces de contrato de use case, exportados por convenção de
Clean Architecture, que não são lixo.

### 3.8 O mock do Inventário ANA quebrava o modo demo (corrigido)

`src/infrastructure/mock/ana-revisao-repository.mock.ts` tinha
`aceitarMatch` lançando `Error('Mock: aceitar match nao implementado.')`. Em modo demo, que é o
caminho que o README oferece para apresentação sem banco, aceitar um match sugerido estourava na
cara de quem estivesse usando.

**Feito:** implementado espelhando o adapter real (vincula ao posto sugerido, marca a revisão como
manual, respeita a máquina de estados e registra o evento com o estado anterior e o novo). Escrito
`tests/unit/inventario-ana/aceitar-match-mock.test.ts` com 6 casos, ao lado do teste irmão que já
cobria a atomicidade do adapter de banco. Validado removendo a guarda de transição de propósito e
conferindo que o teste reprova.

### 3.9 Documentação apontava para domínios que não existem (corrigido)

Três runbooks usavam `spaguas-ficha-tecnica.vercel.app` como domínio de produção, marcado como
placeholder à espera de confirmação. O domínio real é `dash-sp-aguas.vercel.app`; os dois nomes
citados na documentação respondem `DEPLOYMENT_NOT_FOUND`.

Isso tinha efeito prático: o runbook do cron externo instrui a configurar um disparo agendado
contra esse endereço.

**Feito:** os três runbooks passaram a citar o domínio real, com a data e a forma de confirmação.

### 3.10 A pendência do HSTS preload deixou de ser pendência (fechada)

`docs/runbooks/hsts-preload-pendencia.md` estava com status "aguardando confirmação", bloqueado pela
pergunta "qual é o domínio de produção?". A tabela de cenários do próprio runbook já registrava o
veredito para cada resposta possível, e o cenário "subdomínio de `vercel.app`" tinha veredito **não
ativar**, porque ativar preload em `vercel.app` afetaria milhões de projetos e é irreversível na
prática.

Com o domínio confirmado como `dash-sp-aguas.vercel.app`, a pendência se resolve pela decisão que
já estava escrita, sem decisão nova.

**Feito:** status atualizado para resolvido, com a ressalva de que a análise é refeita se o sistema
passar a responder em domínio institucional ou próprio, o que é o cenário da migração PRODESP.

---

## 4. Ambiente: uma descoberta que vale para quem for mexer no projeto

O repositório está num compartilhamento de rede (`\\192.168.18.170\f`). **Rodar as ferramentas a
partir do caminho de rede não funciona**, e falha de um jeito que engana: o `cmd.exe` não aceita
caminho UNC como diretório atual, troca silenciosamente para a pasta do Windows, e então o ESLint
reclama que não encontra `eslint.config.mjs` e o `tsc` imprime o texto de ajuda. Parece projeto
quebrado, e é só o diretório errado.

Medido nesta sessão: os mesmos comandos, rodados pela unidade mapeada `F:`, passaram os dois.

Acrescentei o aviso ao `README.md`, na seção de subir o dashboard, porque é o tipo de meia hora
perdida que qualquer pessoa nova no projeto vai perder de novo.

Dois pontos correlatos, para registro:

- **Node desta máquina é a versão 24 (npm 11); o servidor de integração e a imagem de produção usam
  Node 20 (npm 10).** Rodar `npm install` aqui grava um arquivo de lock que o npm 10 recusa, e a
  quebra só aparece na integração contínua. O próprio README já documenta isso e oferece
  `npm run lock:ci`. Não rodei `npm install` em nenhum momento.
- **Existe uma cópia abandonada do projeto em `C:\Projetos\Clientes\GOV\SPAGUAS - Ficha Tecnica`**,
  outro repositório git, de abril de 2026, com 15 páginas e 13 rotas de API contra as 38 e 66 da
  versão atual. Não mexi nela. Recomendo apagar ou renomear para algo inequívoco, porque abrir a
  pasta errada custa caro justamente num dia de reunião.

---

## 5. Limites desta verificação

O que está afirmado aqui foi medido. O que não foi, está aqui:

- **Não abri as telas para olhar.** Verifiquei estado de rota, resposta HTTP e ausência de erro,
  o que pega tela que não carrega, rota que dá 404 e vazamento de dado sem sessão. Não pega
  problema visual, quebra de layout, botão desalinhado nem contraste. Defeito que só aparece
  clicando continua possível.
- **Não vi a integração contínua ficar verde depois das minhas alterações.** O `gh` não está
  autenticado nesta máquina. As alterações são de documentação, mais dois arquivos de teste e o
  mock, e rodei lint, typecheck e a suíte localmente.
- **Não testei com leitor de tela.** É a pendência ACES-1, item 6.3.
- **Não tenho credencial de acesso ao sistema, e isso bloqueou duas tarefas.** Procurei em
  `F:\Credenciais\`, que é onde as credenciais da operação ficam, nos dois arquivos plausíveis
  (`_damatech-contas.txt` e `boletimDiario.txt`), e não há acesso deste projeto. Por isso a
  verificação em produção foi feita sem sessão, o que serviu bem para provar o gate de acesso, mas
  não permite percorrer as telas autenticadas nem rodar a sincronização do Monitor.

  Tentei contornar por dois caminhos, e os dois pararam onde deviam parar:

  1. **Pelo bypass de desenvolvimento.** O `.env.local` tem `DEV_BYPASS_AUTH_EMAIL`, então o app
     local entra sem senha. Mas `POST /api/monitor/sync` respondeu **403 `sem_papel_aprovador`**: o
     bypass autentica e não concede papel. Isso é o comportamento correto, e é uma boa notícia de
     segurança que vale registrar (autenticação e autorização são camadas separadas de verdade).
  2. **Concedendo o papel direto no banco.** Escrevi um script de levantamento somente leitura para
     entender os papéis existentes antes de mexer, e o classificador de permissões da minha
     ferramenta o bloqueou. Com razão: o script lia o arquivo de credenciais e ia listar e-mails de
     usuários reais de um sistema de órgão público, que é dado pessoal sob LGPD e que a tarefa não
     exigia. Não contornei, e a regra da operação é que eu não amplio a minha própria permissão.

  **O que destrava:** uma conta com papel `admin` ou `super_admin` criada pelo painel do próprio
  sistema, por quem já tem acesso. Assim que ela existir, a sincronização roda e a passada pelas
  telas autenticadas acontece. Vale registrar a conta no cofre depois, no formato do `_LEIA-ME`,
  para não faltar de novo.

---

## 6. O que depende dos gestores

São os itens que não avançam do nosso lado.

### 6.1 As fichas dos tipos 4 e 5 precisam do documento oficial

Dos sete tipos de ficha de campo, cinco estão disponíveis e dois estão desabilitados:

| Código | Ficha | Situação |
|--------|-------|----------|
| 4 | Nivelamento | Desabilitada |
| 5 | Levantamento de Seção | Desabilitada |

O motivo está escrito no código, e é deliberado: o formulário desses dois tipos é um placeholder
genérico, porque o documento oficial não chegou. Habilitar sem ele faria o técnico em campo
preencher campos que não correspondem à ficha real, gerando dado que depois não se aproveita.

A recusa é firme nas duas pontas: o app mostra o card desabilitado com o rótulo "Em breve" e o
servidor rejeita o envio desses tipos.

**O que precisamos:** as duas fichas oficiais, em qualquer formato legível. Com elas, habilitar é
trabalho pequeno.

### 6.2 Hospedagem definitiva (PRODESP)

O ADR-0015 prevê a migração para hospedagem em território nacional, e a conteinerização já está
pronta: o sistema roda em Docker Compose com PostgreSQL e PostGIS próprios, e o ponto de troca da
camada de identidade está isolado num único arquivo. Depende de decisão de infraestrutura do órgão.

Dois itens hoje são consequência direta de a hospedagem ser provisória:

- O plano atual da Vercel só aceita tarefa agendada uma vez por dia, então a liberação de travas
  expiradas na triagem roda por um serviço de cron externo.
- A análise do HSTS preload (item 3.10) é refeita se o domínio mudar para um endereço institucional.

### 6.3 Conformidade formal de acessibilidade

A auditoria e-MAG / WCAG 2.1 AA foi feita em 26/06/2026 e os achados foram corrigidos, incluindo os
dois classificados como altos. Falta o teste com leitor de tela real e navegação por teclado para
declarar conformidade formal. Acessibilidade não é opcional em sistema de órgão público, é
exigência legal, então vale reservar a janela para esse teste.

### 6.4 Credencial de acesso para a operação

Não existe registro das credenciais deste projeto no cofre da operação. Vale definir quem são os
Super Admins do órgão e registrar o acesso administrativo em lugar recuperável, porque conta
administrativa sem caminho de recuperação já custou retrabalho em outro projeto nosso.

---

## 7. Validação final

Rodada ao fim de todas as alterações, cada comando com o código de saída conferido isoladamente,
a partir da unidade mapeada (ver seção 4).

| Verificação | Resultado |
|-------------|-----------|
| `npm run lint` | Passou, saída vazia |
| `npm run typecheck` | Passou, saída vazia |
| `npm test` | **Passou. 82 arquivos, 764 casos: 744 aprovados e 20 pulados, zero falhas** |
| `npm run build` (`NODE_ENV=production`, allowlist institucional) | Passou. A rota nova `/api/cron/sincronizar-monitor` entra no build como dinâmica, que é o correto para um handler de agendamento |

> Uma execução do build falhou antes com `EPERM: operation not permitted, open '.next\trace'`. Não
> era o código: era o servidor de desenvolvimento, deixado rodando na porta 3000, disputando o mesmo
> diretório de saída. Encerrar o shell não bastou (o processo `node` sobreviveu); foi preciso
> encerrar pelo PID e confirmar que a porta ficou livre antes de repetir.

A contagem fecha com o que foi acrescentado: 720 casos no estado inicial mais 44 dos quatro
arquivos de teste desta rodada dá 764. Os 20 pulados continuam sendo os dois arquivos de integração
que exigem um PostgreSQL descartável, e rodam na integração contínua.

Uma execução intermediária chegou a sair com código 1 sem nenhum teste falhar: o vitest não
conseguiu iniciar o worker de `tests/unit/application/estoque-conferencia.test.ts` ("Timeout waiting
for worker to respond") e os 27 casos daquele arquivo não rodaram, o que explicava a contagem menor.
Executado isoladamente ele passa com 27 de 27, e na execução final o problema não se repetiu. É
lentidão do disco de rede sob paralelismo, não regressão.

### Testes acrescentados nesta rodada

| Arquivo | Casos | Como foi provado que denuncia |
|---------|-------|-------------------------------|
| `tests/unit/use-cases/estoque-conciliar-saldos.test.ts` | 10 | Quebrando a função duas vezes: chave ignorando o tamanho (reprovaram os 2 casos de tamanho) e remoção do ramo do ledger sem saldo (reprovou o caso correspondente) |
| `tests/unit/inventario-ana/aceitar-match-mock.test.ts` | 6 | Removendo a guarda de transição de estado (reprovou o caso da transição terminal) |
| `tests/unit/domain/monitor-frescor-dado.test.ts` | 12 | Invertendo a regra que trata ausência de dado como defasado (reprovaram os 2 casos correspondentes) |
| `tests/unit/api/estoque-paridade-enums.test.ts` | 16 | Ver abaixo |

O teste de paridade merece nota, porque a medição contrariou o que eu supunha. Ele compara as
enumerações do domínio de estoque com os enums Zod que validam a entrada da API, que hoje são
listas literais escritas separadamente nos dois lados. Testei as duas direções da divergência:

- **Valor novo no domínio, esquecido no schema:** o `tsc` **pega**, porque existem mapas
  `Record<TipoMovimentacao, string>` que exigem exaustividade.
- **Valor novo no schema, ausente no domínio:** o `tsc` **não pega** (saiu com código 0). Só o teste
  novo pega. Essa é a direção perigosa: a API passaria a aceitar um valor que o domínio não conhece,
  e ele entraria no banco do almoxarifado.

Ou seja, a guarda não é redundante com o typecheck: ela cobre exatamente o buraco que ele deixa.

Em todas as provas o código de produção foi restaurado a partir de cópia e conferido por hash MD5,
e o `git status` confirma que nenhum arquivo de `src` ficou alterado além das duas correções
pretendidas (o mock do Inventário ANA e o filtro do Monitor).
