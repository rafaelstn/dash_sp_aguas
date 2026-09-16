# ADR-0024: janela sem identidade para a entrega no servidor do órgão

| | |
|---|---|
| Data | 2026-09-02 |
| Situação | Aceita |
| Escopo | Autenticação, gate de rota, trilha de auditoria, entrega PRODESP |
| Cliente | GOVERNO (SP Águas / DAEE). Rules `governo`, `padrao`, `padrao-ui` |
| Resolve | A pendência de identidade que impedia a aplicação de subir no servidor do órgão |
| Revisa | ADR-0004 e ADR-0006 (auth), ADR-0015 (conteinerização), ADR-0022 (RBAC) |
| Antecipa | ADR-0023 §4 (autenticação do órgão), que substitui esta janela |

---

## 1. O problema, medido antes de decidir

O proprietário pediu para "tirar a necessidade de autenticação por enquanto,
deixar o sistema livre", com a justificativa de que o órgão fornecerá as APIs de
login depois.

Ao medir, o pedido mudou de natureza: **não era uma preferência, era um
pré-requisito da migração.** A aplicação não subia naquele servidor, e não
chegava à tela de login.

Três evidências independentes, colhidas em 02/09/2026:

1. `src/infrastructure/config/env.ts` recusava o boot em produção sem
   `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. `docker-compose.prod.yml` e `ops/producao/ambiente-producao.exemplo` não
   declaram nenhuma variável do Supabase. O Supabase saiu por ordem de
   27/08/2026 ("esquece o supabase").
3. Reproduzido com o banco no ar e `DATABASE_URL` preenchida:
   `npm run build` termina com **código 1** e a mensagem
   `NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias em produção`.

O Supabase Auth é serviço de internet, e o servidor do órgão não tem saída para
a internet. A autenticação da Fase 1 é fisicamente impossível ali.

## 2. O defeito que a auditoria desenterrou, e que é anterior a esta decisão

Ao auditar a mudança, o PO de Segurança encontrou um **fail-open que já existia
em produção**, sem relação com este ADR:

```ts
// src/middleware.ts, antes desta mudança
// Dev local sem Supabase: libera (env.ts bloqueia em produção).
if (!url || !anon) { return NextResponse.next(...) }   // portão aberto
```

A segunda metade do comentário era falsa: `env.ts` **nunca é importado pelo
middleware**. E como `NEXT_PUBLIC_*` é substituída em tempo de **build**, uma
imagem construída sem os `--build-arg` correspondentes servia o sistema inteiro
sem autenticação, **de dentro da imagem**, sem correção possível por variável de
ambiente no servidor.

Havia, portanto, **dois** jeitos de abrir o portão, e o que já existia era o
silencioso e o irreparável em runtime. Ele foi fechado nesta mesma mudança:
em produção, ausência de identidade configurada passa a responder **503** com
mensagem acionável, e a rota pública segue servida para o healthcheck do
container responder.

## 3. Decisão

**Uma janela declarada em que o sistema opera sem verificar identidade,
atribuindo toda requisição a um único usuário institucional, com a estrutura de
autenticação inteira preservada no código.**

Instrução literal do proprietário: *"deixa a estrutura guardada"*. Nada foi
removido. Religar a autenticação é remover três variáveis de ambiente.

### 3.1 Ligada por ambiente, nunca por artefato

Três variáveis, todas obrigatórias juntas, nenhuma com prefixo `NEXT_PUBLIC_`:

| Variável | Papel |
|---|---|
| `ACESSO_SEM_IDENTIDADE=sim` | liga a janela. Só a palavra `sim`, sem diferenciar maiúscula e ignorando espaço nas pontas (`true`, `1` e vazio mantêm a autenticação) |
| `ACESSO_SEM_IDENTIDADE_MOTIVO` | por que, mínimo de 10 caracteres |
| `ACESSO_SEM_IDENTIDADE_REVISAR_EM` | data `AAAA-MM-DD` da reavaliação |

Ligar sem motivo ou sem data **recusa o boot**. Suspensão sem justificativa
escrita é como uma suspensão temporária vira permanente.

**Medido, e é o que torna a janela reversível sem internet:** o mesmo artefato
(`BUILD_ID` idêntico) responde 503 na rota privada sem a variável e 200 com ela.
Variável sem `NEXT_PUBLIC_` lida dentro do middleware **chega em runtime** no
Next 15. Religar a autenticação no servidor do órgão é editar o `app.env` e
reiniciar o container, sem reconstruir imagem, que é justamente o que não se faz
numa máquina sem internet.

### 3.2 Papel `user`, e a contenção é a omissão

A primeira decisão do proprietário foi `admin`. Depois da medição do PO de
Segurança, ele recuou para `user`, e **a implementação disso é não fazer nada**:
não existe linha em `usuarios_papeis` para o usuário institucional, então
`papeisRepository.obterPapel` cai em `PAPEL_PADRAO = 'user'` sozinho.

Medido com a aplicação no ar:

| Rota | Resposta |
|---|---|
| `/api/estoque/saldos` (leitura) | 200 |
| `/api/triagem` (aprovar ficha) | 403 |
| `/api/admin/usuarios` (gestão de usuários) | 403 |

O que decidiu o recuo: `permitirDonoOuAprovador` compara `tecnicoId ===
usuario.id`. Com **uma** identidade para todos, todo registro criado na janela
pertence a todos, e qualquer anônimo apaga o que outro anônimo criou. Com papel
`user` isso fica contido ao que nasceu na janela; com `admin`, o `DELETE`
alcançaria o histórico dos técnicos reais.

### 3.2.1 Adendo de 16/09/2026: escrita no estoque liberada na janela

Pedido do proprietário: "como não temos login por enquanto deixa sem operador".
Sem isso o módulo de estoque fica só leitura no servidor do órgão, e a
conferência com leitor de código de barras não funciona.

A liberação é **só do estoque** e **não mexe no papel**. O usuário institucional
continua `user`; o critério novo mora em `podeGerenciarEstoque`
(`src/infrastructure/auth/permissao-estoque.ts`), usado pelas rotas de escrita de
`/api/estoque` (`exigirGestorEstoque`) e pelas quatro páginas do módulo. Ele
aceita Admin, ou o id institucional **com** `ACESSO_SEM_IDENTIDADE=sim`. Decisão
de triagem, edição e exclusão de ficha de outro técnico e gestão de usuários
continuam com 403 (medido pelo QA em 16/09/2026). A criação de ficha já era
permitida a qualquer usuário (`exigirUsuario`) e segue na seção 4. Desligar a
janela devolve o critério de Admin sem mudar código.

Por que isto não reabre o risco que motivou o recuo da 3.2, medido no banco do
ensaio com a carga da planilha (814 unidades, 85 materiais). A contagem vale
para o dia da carga e envelhece com o uso:

| O que um anônimo pode fazer | Alcance |
|---|---|
| Apagar unidade serializada | Exclusão física só sem movimentação. Na carga, 0 de 814. Unidade criada pela tela (`POST /api/estoque/unidades`) não grava entrada, então **toda unidade criada na janela pode ser apagada fisicamente por outro anônimo** (medido: a unidade criada no ensaio era a única sem movimentação, 1 de 815) |
| Apagar material | 1 de 85 sem vínculo; os demais só são inativados |
| Apagar categoria (`DELETE /api/estoque/categorias/[id]`) | Exclusão física e irreversível; a FK `ON DELETE SET NULL` desvincula todos os materiais dela |
| Apagar local (`DELETE /api/estoque/locais/[id]`) | Exclusão física, só de local sem uso (senão 409) |
| Reconciliar conferência (`POST .../conferencias/[id]/reconciliar`) | Ajuste de saldo em lote, a escrita de maior alcance; vira linhas em `estoque_movimentacoes` |
| Editar conferência, apagar item de sobra | Só com a sessão aberta e antes de reconciliar |
| Baixa, transferência, ajuste | Viram linha em `estoque_movimentacoes`, que é trilha, gravada com "Acesso sem identificação" |
| Editar cadastro de unidade, material, local ou categoria | Permitido. **Não tem histórico no banco**: a única trilha é o log da aplicação, com o id institucional e rotação de cerca de 50 MB. Edição de cadastro na janela não é atribuível nem reconstituível |
| Decidir ou reabrir desconformidade | Reabrir apaga da linha quem decidiu, quando e a unidade ligada; o evento `estoque.desconformidades.decidida` leva ao log a `decisaoAnterior` inteira, sem a nota |

**Nota livre da desconformidade (LGPD).** Texto de 3 a 500 caracteres que pode
conter nome de pessoa. Finalidade: justificar a decisão sobre o inventário.
Retenção: acompanha o registro da desconformidade. Não vai para log nem para
exportação.

**Rate limit na janela.** Com um usuário só para todos, um balde por usuário
seria um balde para o órgão inteiro. Na janela, a chave das rotas de
`/api/estoque` é o IP de origem lido **só** de `X-Real-IP`, que o Nginx do órgão
sobrescreve com `$remote_addr` (`src/app/api/estoque/_rl.ts`). O Nginx também
limpa `X-Vercel-Forwarded-For`. O limite por IP depende desse Nginx: quem
alcançar a porta da aplicação sem passar por ele escolhe o próprio balde.

**Guarda de escopo.** `tests/unit/infrastructure/auth/permissao-estoque-escopo.test.ts`
reprova qualquer uso de `exigirGestorEstoque` ou `podeGerenciarEstoque` fora do
estoque (provado com o import numa rota de triagem).

O que fica exposto e precisa estar no aceite da seção 4: tudo o que a tabela
acima lista, em especial a exclusão de categoria, de local e de unidade criada
na janela, e a edição de cadastro sem trilha no banco.

**Revisão de segurança (André), 16/09/2026: aprovado com condições**, todas
aplicadas no mesmo dia: rate limit por IP na janela, decisão anterior no log ao
reabrir, guarda de escopo e esta complementação. Não há decisão técnica
pendente; resta o aceite por escrito do órgão.

### 3.2.2 Inventário de toda rota de escrita na janela (André, 16/09/2026)

O QA achou três escritas fora desta ADR (favoritos e revisão de
desconformidade). Para não aparecer uma quarta, a varredura cobriu **todo**
`export` de `POST`, `PUT`, `PATCH` e `DELETE` em `src/app/api` (41 arquivos, mais o reexport
em `/api/postos/[prefixo]/reindexar`) e leu o portão de cada um. Não há `PUT`
no projeto. Fora de `src/app/api`, a única rota com esses verbos é
`/auth/sair`, que na janela só redireciona para a raiz, e a única server action
(`src/app/login/actions.ts`) é o login, sem uso na janela. O que decide o
resultado é o portão da rota, porque na janela `obterUsuarioAtual` devolve
sempre o usuário institucional com papel `user`.

**Recusam na janela (403)**

| Rota | Portão |
|---|---|
| `POST /api/admin/usuarios`, `PATCH` e `DELETE /api/admin/usuarios/[id]` | `exigirAdmin` |
| `POST /api/triagem/[id]/aprovar`, `devolver`, `rejeitar`, `iniciar-revisao` | `ehAprovador` no caso de uso |
| `POST /api/inventario-ana/bulk`, `[codigo]/aceitar-match`, `[codigo]/revisar` | `ehAprovador` na rota |
| `POST /api/postos` e `PATCH /api/postos/[prefixo]` | `ehAprovador` na rota |
| `POST /api/monitor/sync` | `exigirAprovador` |
| `PATCH` e `DELETE /api/fichas/[id]` e `/api/diagramas/[id]` sobre registro de técnico real | `permitirDonoOuAprovador` |
| `POST /api/desconformidades/revisoes` | `exigirIdentidadeVerificada`, **fechada nesta revisão** (abaixo) |

**Não dependem de identidade:** `GET` e `POST` de `/api/cron/*` exigem
`Authorization: Bearer` com `CRON_SECRET`. Sem internet ninguém os chama (seção 4).

**Gravam na janela, atribuídas ao usuário institucional**

| Rota | Efeito real, medido no código |
|---|---|
| Todas as escritas de `/api/estoque` | seção 3.2.1 |
| `POST /api/postos/[prefixo]/fichas` (formulário web) | cria `fichas_visita` **direto, sem triagem**, com `tecnico_id` institucional; o `tecnicoNome` é texto livre digitado e não é verificado |
| `POST /api/app/fichas` (app) | cria ficha em triagem com `tecnico_id` institucional; a decisão continua com aprovador |
| `PATCH` e `DELETE /api/fichas/[id]` sobre ficha criada na janela | qualquer anônimo edita ou **apaga fisicamente** (`DELETE FROM fichas_visita`) a ficha de outro anônimo, porque o dono é o mesmo id (seção 3.2) |
| `POST /api/postos/[prefixo]` e o alias `/reindexar` | subprocesso do indexador, sem gate (seção 4) |
| `POST /api/favoritos/[prefixo]` e `DELETE` (os dois alternam) | **favoritos viram uma lista só do órgão**: `postos_favoritos` é chaveada por `(usuario_id, prefixo)`, e com um id para todos, a estrela de um é a de todos, e qualquer um desmarca a de outro. "Meus favoritos" passa a ser coletivo. Os favoritos gravados com login ficam intactos e invisíveis na janela. Sem trilha e sem rate limit; o alcance é só a lista de atalhos |
| `POST /api/diagramas` e `/api/diagramas/[id]/duplicar` | cria diagrama com `criado_por` institucional |
| `PATCH` e `DELETE /api/diagramas/[id]` sobre diagrama criado na janela | qualquer anônimo edita ou **apaga fisicamente** (`DELETE FROM diagramas`) o diagrama de outro anônimo; os de técnico real seguem com 403 |
| `POST /api/app/postos/[prefixo]/foto` | tentaria trocar a foto de capa do posto, mas o armazenamento é o Supabase Storage, ausente no órgão: o envio falha com 500 **antes** de gravar no banco. Se um armazenamento local for ligado, esta rota passa a trocar a capa sem identificação e precisa voltar a esta tabela |

**Leitura com verbo `POST`:** `POST /api/diagramas/valores` só consulta o SIBH
ao vivo e não grava. Sem internet, falha.

**Decisão sobre as duas rotas achadas pelo QA**

1. **Favoritos: aceito na janela.** O efeito é só a lista coletiva de atalhos,
   sem afirmar nada em nome de ninguém e sem tocar dado de outra pessoa gravado
   com login.
2. **Revisão de desconformidade: fechada com 403 na janela.** Marcar
   "revisado" afirma que alguém conferiu a desconformidade; o produto não tem
   caminho para reabrir (`reabrir` existe no repositório e em nenhuma rota); e
   o `UPSERT` troca `usuario_id` e `ip` da linha, apagando a autoria de quem
   revisou antes com login. A tela mostra só "revisado", sem autor, então a
   trilha "Acesso sem identificação" nem chegaria ao usuário. O portão novo é
   `exigirIdentidadeVerificada` (`src/app/api/_helpers/auth.ts`): igual a
   `exigirUsuario` com autenticação ligada, e 403 com a janela ligada **ou**
   para o id institucional em qualquer modo. Prova pelo efeito, com o
   repositório não chamado e dois mutantes que reprovam:
   `tests/unit/api/desconformidades-revisoes-identidade.test.ts`.

### 3.3 A trilha declara a ausência, não inventa uma pessoa

O usuário institucional existe como linha em `auth.users` (migration 0066),
porque quatro chaves estrangeiras `NOT NULL` recusam escrita sem ela:
`postos_favoritos.usuario_id`, `usuarios_papeis.usuario_id`,
`fichas_triagem.tecnico_id` (RESTRICT) e `triagem_locks.revisor_id`.

Ele se chama **"Acesso sem identificação"** de propósito. Uma trilha que inventa
um nome é pior que uma trilha que declara não saber.

Isso também corrige um defeito achado pela PO de Frontend:
`postos-repository.pg.ts` resolve o autor por
`SELECT email FROM auth.users WHERE id = ator_id`. Sem a linha, aquilo devolvia
`NULL` e a tela de histórico renderizava **"Automação (sem ator humano)"** para
toda edição feita por uma pessoa, ou seja, a trilha afirmaria que um robô fez o
que um servidor fez.

**Uma migration foi dispensada por medição:** a proposta de coluna
`origem_identidade` em quatro tabelas de trilha, para separar esta janela do
`NULL` histórico da Fase 1, é desnecessária, porque neste desenho a trilha grava
o UUID institucional, que já é o marcador.

### 3.4 O prazo reprova a nossa cadeia, não a produção do órgão

Vencida a data, a aplicação **continua no ar** e registra alerta severo a cada
boot. Quem fica vermelho é a nossa suíte
(`tests/unit/infrastructure/auth/janela-sem-identidade-vigente.test.ts`), que lê
a data do próprio modelo que vai para o servidor.

O PO de Segurança defendeu recusar o boot após a data, com o argumento de que a
janela vira fato conferido e não promessa. O argumento é bom e foi recusado por
um fato operacional: aquele servidor não tem internet e ninguém nosso o alcança
depressa, então recusar o boot transformaria um lembrete nosso em
indisponibilidade do cliente. A quebra fica onde é barata.

### 3.5 Os dois modos não convivem

Com `ACESSO_SEM_IDENTIDADE=sim` **e** variáveis do Supabase preenchidas, a
aplicação recusa subir. É o que impede a configuração do servidor do órgão de
ser copiada para um ambiente que alcança a internet, onde ela ficaria exposta e
sem autenticação, funcionando normalmente e sem ninguém perceber.

## 4. O que fica exposto, e é isto que o órgão precisa aceitar por escrito

Alcance: o compose publica em `127.0.0.1` e quem responde é o Nginx do órgão.
"Qualquer pessoa" significa **quem alcança o Nginx do órgão**, mais quem tiver
Portainer ou shell no host.

**Leitura sem identificação:** busca de postos, ficha técnica, arquivos, fichas
de visita com geolocalização, painel, monitor, inventário ANA, estoque e as
exportações em XLSX.

**O dado mais sensível não é de servidor, é de terceiro.** A ficha tipo 6
("Troca de Observador") carrega nome, RG, **CPF**, data de nascimento, endereço
residencial, telefone e **conta bancária** do observador, que é pessoa física e
não é usuária do sistema. Ela é alcançável em
`/postos/{prefixo}/fichas/{id}/imprimir`.

**Escrita sem identificação:** criação de ficha, e `POST /api/postos/[prefixo]`
com o alias `/reindexar`, que **já não tinha gate antes desta mudança** e dispara
subprocesso do indexador. Desde 16/09/2026, também **toda a escrita do módulo de
estoque**, com o alcance listado na tabela da seção 3.2.1 (exclusão de categoria,
local e unidade criada na janela, reconciliação de conferência, edição de
cadastro sem histórico no banco e decisão de desconformidade). A lista
completa de escrita na janela, com favoritos coletivos, diagramas e o que fica
com 403, está na seção 3.2.2.

**Conflito de LGPD que se declara, e não se resolve em silêncio:** na janela,
`ip` e `user_agent` são a única origem rastreável, e a rotina de anonimização os
apaga aos 180 dias. Ou a retenção da janela é maior (mais dado pessoal retido,
art. 16, I como enquadramento), ou a trilha da janela vira anônima de vez. É
decisão do órgão. Some-se a isto que, **sem internet, ninguém chama as rotinas
de `/api/cron/*`**, então hoje o expurgo simplesmente não roda naquele servidor.

**A RLS não é uma segunda barreira aqui.** As policies existem como defesa em
profundidade, mas a aplicação conecta com papel dono, que não é submetido a RLS.
Se o gate da aplicação abre, não há nada embaixo. Isso vale igualmente com
autenticação ligada, e está registrado aqui porque a documentação de arquitetura
descreve a RLS como proteção efetiva, o que só é verdade no caminho PostgREST do
Supabase, que este produto não usa.

## 5. Alternativas descartadas

**Remover a autenticação do código.** Contraria a instrução do proprietário e
custaria reconstruir tudo quando a API do órgão chegar.

**GoTrue self-hosted.** Superada pelo ADR-0023: o órgão já tem base de
identidade (`Dbfch.dbo.UsuariosIdentity`, 29 linhas), e reimplementar
autenticação ao lado dela seria uma segunda fonte de verdade.

**Interceptar nos 247 pontos de chamada.** Descartada por medição: 105 usos de
`obterUsuarioAtual` e 142 dos helpers `exigir*` em 63 rotas. A interceptação
mora nos funis.

## 6. Como isto morre

Quando o órgão fornecer a API de login, o ponto de plugagem é
`current-user.ts`, e **só ele**: a autorização continua em PostgreSQL,
inalterada, conforme o ADR-0023 §4, que separa autenticação (do órgão) de
autorização (nossa). As três variáveis saem do `app.env`, o container reinicia,
e a estrutura guardada volta a valer sem reconstrução de imagem.
