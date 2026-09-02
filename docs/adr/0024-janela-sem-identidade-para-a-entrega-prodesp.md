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
| `ACESSO_SEM_IDENTIDADE=sim` | liga a janela. Só a palavra exata `sim` |
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
subprocesso do indexador.

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
