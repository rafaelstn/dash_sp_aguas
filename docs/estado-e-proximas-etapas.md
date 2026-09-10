# Estado do projeto e próximas etapas

**Atualizado em 10/09/2026.** Este documento é o ponto de retomada: o que está de
pé, o que está medido e o que ainda não foi afirmado. As perguntas ao órgão na
seção 4 estão prontas para virar ofício.

**O que mudou em 10/09/2026, e é o que evita reabrir investigação já fechada:**

1. **`postos` está vazia em produção: MEDIDO, e não mais inferido.** `count(*) = 0` no
   banco do órgão, junto de `fichas_visita`, `fichas_triagem`, favoritos e fotos, todas em
   zero. Até aqui a única base da afirmação era o comentário datado de 02/09 em
   `repositories.ts`.
2. **As nove chaves estrangeiras contra `postos` foram removidas em produção**
   (migration 0069). Eram **nove e não oito**: `ana_revisao_estacao` tem duas. Gravar ficha,
   favorito e foto voltou a funcionar. Ver 2.4.
3. **O painel Portainer do servidor responde na internet pública e está em versão
   vulnerável** (CVE-2026-72533, CVSS 9.4). É infraestrutura do órgão, não nossa. Ver 2.5.

Documento de ESTADO envelhece por construção, porque descreve um instante. Cada
afirmação daqui traz a data em que foi medida, e frase do tipo "está vazio",
"ninguém usa" ou "em todos os ambientes" se reconfere na fonte antes de virar
código.

---

## 1. O que está no ar

O sistema roda no servidor da PRODESP em `https://dmo.spaguas.sp.gov.br`, em
container, sem exigência de login (ADR-0024, janela sem identidade), com a
estrutura de autenticação preservada e desligada por chave, esperando as APIs de
login do órgão.

A saída para a internet passa pelo proxy corporativo (ADR-0025), descoberto no
próprio servidor e não perguntado ao cliente.

O cadastro de posto e as séries de medição são lidos **ao vivo** do `Dbfch`, o
SQL Server do órgão, sem cópia, sem banco intermediário e sem cache. É o ADR-0023
e é instrução direta do proprietário: *"não quero bancos intermediários, tudo que
vamos ler na tela tem que ser diretamente do banco original"*.

---

## 2. Concluído em 03, 04 e 10/09/2026

### 2.1 Séries históricas de medição (módulo Monitor)

As cinco séries do banco do órgão, ligadas ao posto por `PostoId`:

| Série | Tabela | Linhas | Postos |
|---|---|---|---|
| Chuva manual | `MedicaoPluviometricas` | 27.280.208 | 2.096 |
| Chuva automática | `MedicaoLoggerPluviograficas` | 1.965.398 | 140 |
| Cota do rio | `CotaEscalaFluviometricas` | 10.987.980 | 745 |
| Piezômetro manual | `LeituraManualPiezometricas` | 131.938 | 102 |
| Piezômetro eletrônico | `LeituraEletronicaPiezometricas` | 2.207.919 | 81 |

Três rotas, com o desenho pedido pelo proprietário (*"não precisa abrir de cara
para não pesar o processamento"*): o resumo abre a ficha **sem trazer leitura
nenhuma** (35 ms a 289 ms, incluindo o pior posto de cada série), e as medições
vêm sob demanda depois que a pessoa escolhe a janela (500 leituras em 74 ms, sem
degradar com a profundidade).

**O achado que muda o número na tela:** o banco guarda "não houve leitura" como
NÚMERO, e não como nulo. `Valor = 9999` na cota são 34,7% da série inteira;
`Medicao = 999.9` na chuva são 257 mil linhas. Somar ou mediar isso produziria
9.999 mm de chuva num mês com dez dias sem leitura, e 99 metros de cota média.
Vira nulo e é CONTADO, porque descartar em silêncio mostraria trinta dias de
série onde houve dez leituras.

### 2.2 Histórico na ficha do posto

Cinco cartões de resumo ao abrir, nenhuma série preselecionada, janela padrão
ancorada no FIM DA SÉRIE e nunca no relógio (a chuva do `E3-036` vai de 1888 a
2004, e "últimos 90 dias" devolveria vazio num posto com 41 mil leituras).

O comparativo com o SIBH tem quatro estados com tela própria, e a tela **não dá
veredito de coerência**: não existe tolerância publicada pelo órgão, e inventar
uma seria um selo que ninguém assinou sobre uma unidade que a origem não confirma.

### 2.3 Correção: o modo demo estava quebrado no projeto inteiro

`const COLUNAS = sql\`...\`` em escopo de módulo executa no import, porque `sql` é
um Proxy que cria o cliente no primeiro uso. Nove repositórios faziam isso, com
treze fragmentos, e o efeito era que importar `repositories.ts` sem
`DATABASE_URL` estourava antes da escolha entre mock e PostgreSQL: como toda
página e toda rota importam dali, o modo demo respondia 500. Guarda em
`tests/unit/db/importar-repositorios-em-demo.test.ts`, que varre o diretório em
vez de manter lista.

**Cadeia:** typecheck e lint limpos, 99 arquivos e 998 casos verdes.

### 2.4 As nove FKs contra `postos` saíram, e a gravação de ficha voltou (10/09/2026)

**O defeito.** O ADR-0023 deixou `postos` vazia por desenho, e nove restrições de chave
estrangeira ainda ligavam os dados próprios a ela. Com a tabela vazia, elas recusavam a
escrita de qualquer registro que se referisse a um posto: ficha de visita, ficha de
triagem, favorito, foto, cache de indexação e caminho de posto, todos com `23503`.

É a **mesma classe** que a 0067 fechou em 04/09 para o Monitor (2.714 estações recusadas).
Aquela migration nomeou a classe com todas as letras ("o nono ponto, e o único que não
aparece como JOIN") e **corrigiu um membro só**. Estes eram os restantes.

| Medição | Antes | Depois |
|---|---|---|
| FKs contra `postos` (produção) | 9 | **0** |
| Índices das seis tabelas de prefixo | 22 | 22 |
| INSERT de ficha com `postos` vazia | `23503` | **aceito** |

**O que a 0069 faz:** remove as nove restrições, mantendo coluna e índice. Nas seis de
`prefixo` a coluna **é** a chave natural compartilhada (a navegação já é
`/postos/{prefixo}`); nas três de `posto_id` remove-se só a FK, porque o módulo ANA lê
essas colunas em JOIN local e removê-las é escopo próprio. Nenhum dado alterado.

**Ordem seguida em produção**, e ela é a regra da casa: provado contra o banco real numa
transação desfeita (9 → 0 → 9, sem resíduo), aplicado, conferido **no catálogo** e não na
saída do comando, e a gravação de ficha verificada com INSERT em transação desfeita.

**Guarda que impede a classe de voltar:**
`tests/integration/acoplamento-postos-fk-postgres.test.ts` pergunta ao **catálogo**
(`pg_constraint`), não ao texto das migrations, e recusa qualquer FK para `postos` fora de
uma lista de permissão que **nasce vazia**. Provada nos dois lados (reprova nomeando as 9
antes, passa depois) e com sonda em transação desfeita, para não passar por vacuidade.
A guarda anterior media UMA tabela pelo nome literal, e por isso não via as outras oito.

**O que a 0069 NÃO resolve, e é código do próximo deploy:** a aprovação de triagem faz
`SELECT ... FROM postos` e responde sempre `posto_inativo` com a tabela vazia
(`triagem-repository.pg.ts`), e o "aceitar match" do inventário ANA responde 404 para posto
que existe e ainda tenta **escrever** em `postos`, que é somente leitura pelo ADR-0023.

### 2.5 Portainer: exposto na internet e em versão vulnerável (10/09/2026)

Medido de rede externa, sem qualquer tentativa de autenticação: o painel responde em
`https://dmo.spaguas.sp.gov.br/portainer/` **sem VPN** e informa a versão (2.39.6) sem
autenticação. Essa versão é afetada pela **CVE-2026-72533 (CVSS 9.4)**, corrigida na
2.39.7: escalonamento a root do host por usuário autenticado **sem** privilégio
administrativo. Conferido na fonte (advisory oficial do Portainer), não de memória.

**É infraestrutura do órgão, não nossa.** Está no relatório de pendências de 10/09 como
item IN-03, com a recomendação em ordem de esforço. O que é nosso e foi corrigido: o
roteiro de deploy mandava usar esse painel pela internet, e a DamaTech passou a ter conta
nele (o Diego enviou os logins), o que entra no IN-04.

---

## 3. Próximas etapas, em ordem

### 3.0 Fechar o fluxo de ficha: os dois pontos que a 0069 não alcança

A 0069 restaurou a **gravação**. Estes dois são de **código**, vão no próximo deploy, e
ambos falham hoje por consultarem a `postos` vazia. Nenhum deles é resolvido por migration.

1. **Aprovação de triagem responde `posto_inativo` para posto ativo.**
   `triagem-repository.pg.ts` faz `SELECT deleted_at FROM postos WHERE prefixo = ...` dentro
   da transação de aprovação; com a tabela vazia, `postos[0]` é sempre `undefined` e toda
   aprovação vira 409. A pergunta "este posto existe e está ativo?" tem que ir ao
   `postosRepository` (SQL Server), e **sai da transação**, virando composição por lote, que
   é o que o ADR-0023 §2.3 prescreve. O 409 só pode ser dito quando o órgão disser que o
   posto está inativo.
2. **`aceitar-match` do inventário ANA responde 404 para posto que existe, e escreve em
   `postos`.** `ana-revisao-repository.pg.ts` busca o posto com `FOR UPDATE` e depois faz
   `UPDATE postos SET prefixo_ana = ...`. A escrita contraria o ADR-0023 (o cadastro é
   somente leitura), então **isto é decisão de produto e não conserto mecânico**: ou a rota
   responde `EscritaIndisponivel` (o tipo já existe e já está mapeado para 501 em
   `erros.ts`), ou o `prefixo_ana` passa a morar em tabela nossa.

Junto, e é o que torna os dois visíveis para quem usa: `FalhaRepositorio` não tem ramo em
`respostaDeErro` e cai no genérico 500, e `FormularioFicha.tsx` imprime `body.erro` (o
slug) quando existe `body.mensagem` ao lado. Quem preenche uma ficha inteira lê
`erro_interno` na tela.

### 3.1 Fechar o módulo de postos e o painel

1. **`/desconformidades` responde zerada.** A régua de desconformidade não foi
   portada para a origem do órgão, e a antiga classificaria 54% da rede como
   irregular, o que não se publica sem a régua nova (seção 4).
2. ~~**`ResumoPendencias.desconformidadesPostos` precisa aceitar
   `number | null`**~~ **FEITO em 04/09/2026.** O contrato já declara
   `number | null` (`application/ports/painel-repository.ts`) e o adaptador do
   órgão devolve `null` com o motivo escrito ao lado. Conferido no código em
   08/09/2026.
3. **Substituto medível: DESCARTADO em 04/09/2026, e o motivo importa.** Eu havia
   registrado "1.093 postos sem código ANA" como número que o órgão reconhece e
   não depende de régua nova. Conferido, ele não se sustenta em três frentes:

   - **O rótulo seria falso para 199 postos.** Dos 4.697 com `PrefixoDNAEE`
     preenchido, 4.498 estão no formato ANA de oito dígitos e **199 têm
     caractere não numérico** (`130-036`, `267-005`), que a seção 6.4 de
     `viabilidade-dados-prodesp.md` conclui **não serem código ANA**. Ou seja,
     1.093 mede campo VAZIO e o rótulo prometeria identidade AUSENTE, que são
     1.292. Divergência que qualquer conferência na origem encontra.
   - **A consequência que justificaria o cartão é refutada pela aritmética.**
     Números corrigidos em 04/09/2026: dos 4.646 códigos ANA que já existem,
     **93 casam** com as 5.415 estações do SIBH, ou seja 2,0%. Preencher os 1.093
     restantes ao mesmo aproveitamento acrescentaria cerca de **vinte e duas**
     estações. O cartão mandaria o gestor executar um trabalho de cadastro que
     **não resolve o problema que o próprio cartão nomeia**.

     A refutação original usava "46 de 4.697, ou 0,98%", vindos da medição
     enviesada da seção 2.2 do catálogo de séries. **Os números mudaram e a
     conclusão não**: vinte e duas estações continuam sendo nada diante das 2.706
     que o prefixo direto já casa. Decisão certa com argumento errado continua
     precisando da correção do argumento, senão a próxima pessoa reusa o número.
   - **A premissa nunca foi verificada.** O inventário ANA de 2026 tem 2.371
     estações (ADR-0011) contra 5.790 postos, e 4.697 já carregam um
     `PrefixoDNAEE`. O campo é herança do DNAEE, não carteira do inventário
     vigente: afirmar que a ausência é defeito é a mesma objeção que fez a régua
     de desconformidade ser recusada.

   Some-se que 1.374 dos 5.790 estão desativados e ninguém mediu quanto do 1.093
   é posto extinto, e que não existe filtro de busca por esse critério, ou seja o
   cartão nasceria sem destino.

   **No lugar dele, e já publicado em 04/09/2026:** o cartão **"Postos com
   telemetria" (149 de 5.790)**. Ele já estava no contrato
   (`ResumoCadastroPostos.postosComTelemetria`), tem destino exercitado
   (`/?tem_telem=1`), quitou a dívida declarada no comentário do bloco "Panorama
   da rede" e devolveu a grade às três colunas. Severidade `info`, nunca alarme:
   2,6% em vermelho seria alarme falso, e baixa telemetria é fato de
   modernização da rede, não irregularidade de cadastro.

   O rótulo diz "com telemetria" e **nunca "transmitindo" ou "ativa"**: o
   `Dbfch` cadastra APARELHO instalado, e as séries pararam em ago/2025, então
   afirmar transmissão contradiria a própria base do cliente. Está fixado em
   guarda (`tests/unit/components/painel/telemetria-nao-afirma-transmissao.test.ts`),
   porque a troca é o tipo de coisa que alguém faz de boa-fé achando que melhora.
4. ~~**Relatório em PDF mostra 2 de 5 campos de instrumentação.**~~ **FEITO em
   04/09/2026** (commit `f95fde7`). O documento traz os cinco, na mesma ordem e
   com os mesmos rótulos da ficha de tela, porque ele existe para ser conferido
   CONTRA ela. Conferido no código em 08/09/2026.
5. **Migração de remoção dos 12 campos órfãos**, só depois que o adaptador
   PostgreSQL de posto sair de cena. Antes disso a remoção é irreversível sem
   ganho.

### 3.2 Monitor: CORRIGIDO em produção, 04/09/2026

A migration 0067 foi aplicada no banco do órgão às 13:13 e a rotina foi disparada
em seguida. Medido antes e depois, no mesmo banco:

| | Antes | Depois |
|---|---|---|
| Estações gravadas | 2.701 | **5.415** |
| Erros no corpo | 2.714 | **0** |
| Tipos hidrológicos | 2 | **3** (piezométricas estavam 100% fora) |
| `vinculadasAposto` | 0 | **2.714** |
| Medições recebidas | ~540 mil | 663.219 |
| Duração | 380 s | 746 s |

**`vinculadasAposto: 2714` é a confirmação final da causa:** é exatamente o
número de erros anteriores. Eram essas as estações que casavam com um posto do
órgão, e casar era a condição para serem recusadas.

A duração praticamente dobrou, o que é coerente com o dobro de estações, e está
**bem dentro do teto de 1800 s** configurado no systemd. Sem ação necessária.

**Detalhe operacional que o registro anterior errava:** as migrations viajam
DENTRO da imagem `spaguas/migrate`, com a mesma tag de commit da aplicação, e
não por bind mount. O comentário do compose diz que isso existe para não
transportar dois pacotes num servidor sem internet. Por isso a 0067 foi aplicada
com o SQL enviado direto ao banco, o que é seguro porque ela é idempotente e
será reaplicada sem efeito quando a imagem nova subir.

**Pendente:** a migration 0068, que remove a coluna `posto_id`, **só depois do
deploy da imagem nova**. Antes dele ela derrubaria 100% das estações, porque o
código que está rodando ainda grava naquela coluna.

### 3.2.0 Histórico do defeito

6. **2.714 erros na sincronização do SIBH, e a causa registrada estava errada.**
   O fato medido: 5.415 estações recebidas, 2.701 gravadas, 2.714 erros, e a
   conta fecha exatamente. Metade não é gravada, e a rotina responde HTTP 200
   assim mesmo, o que é sinal positivo falso para o systemd.

   **Retratado em 04/09/2026:** este item dizia "erros de chave estrangeira,
   porque `estacoes_pluviometricas` aponta para `postos`, que nasce vazia". É
   impossível, e a prova estava no próprio texto que copiei do runbook:
   `vinculadasAposto` é **zero**, ou seja toda estação grava `posto_id` nulo, e a
   coluna é `NULL REFERENCES`. **Nulo não viola chave estrangeira.** Duas
   afirmações verdadeiras coladas numa relação causal que não existe, e eu
   propaguei para uma segunda superfície sem reconferir.

   **Hipótese atual, NÃO medida:** o upsert conflita em `sibh_id`, e a migration
   0045 criava índice único em `prefixo`, que a 0052 derruba justamente porque o
   SIBH repete prefixo entre tipos hidrológicos. Se a sincronização de produção
   rodou antes da 0052, cada prefixo repetido falharia. Bate com a ordem de
   grandeza e com o incidente de 03/09, em que a criação daquele índice foi
   recusada por prefixo repetido e a aplicação respondeu 502 até as duplicatas
   saírem em transação (2.701 linhas para 2.345, sem perda de dado do cliente,
   porque a tabela tinha sido populada pela própria sincronização).

   **O código atual trata o caso**, e há teste afirmando que o mesmo prefixo em
   tipos diferentes vira dois upserts com `sibhId` distinto. O roteiro de
   medição de três passos está no runbook `entrega-imagem-sem-internet.md`,
   seção 9. O terceiro passo é o que faltou da primeira vez: **ler o `motivo`
   dos erros no corpo da resposta**, que já estava lá e foi substituído por uma
   dedução.
7. **Só depois disso** faz sentido ampliar o comparativo. E ele cobre **53,6%**
   da rede, não os 2% que este documento afirmava: aquele número saiu da mesma
   tabela envenenada pelo defeito do item 6, que continha só as estações que não
   casavam. Corrigido no catálogo de séries, seção 2.2.

### 3.2.1 Os dois achados do painel: RESOLVIDOS

Vieram da revisão de produto de 04/09/2026. O terceiro achado dela, o cartão de
arquivos órfãos verde por medição que não aconteceu, foi corrigido no mesmo dia.

- **"Postos sem arquivo" é permanentemente não apurável nesta instalação**, e
  isso é classe diferente de "Cadastro irregular". O ADR-0023 põe arquivos
  indexados fora de escopo e a imagem do órgão não contém o indexador (runbook
  §9.3). O de conformidade será apurado quando a régua chegar; este não será
  apurado nunca ali.

  **RESOLVIDO em 08/09/2026, e a decisão de produto foi tomada: o cartão SAI da
  tela onde não há como apurar.** `Apuracao<T>` ganhou o estado `foraDeEscopo`,
  que é classe própria e não mais um motivo: "ainda não apurado" é espera e o
  cartão fica dizendo por quê; "fora de escopo" é ausência definitiva e o cartão
  não é renderizado. Quem responde se o indexador existe é
  `indexadorDisponivelNesteAmbiente()`, que pergunta ao disco pela pasta `ops/`
  (a mesma evidência que a imagem não carrega) uma vez por processo, e não a
  cada render.

  O escopo é avaliado ANTES da falha de consulta, de propósito: numa instalação
  sem indexador, responder "histórico indisponível no momento" mandaria o gestor
  esperar por um número que não vem, ou procurar defeito de infraestrutura que
  não existe.

  Provado por mutante: removida a guarda de escopo, reprovam exatamente três
  casos, e os outros vinte e três seguem passando. O caso que quase não se
  escreve está lá: onde o indexador EXISTE, `foraDeEscopo` tem de ser falso,
  senão uma implementação que escondesse o cartão em toda instalação passaria.

- **Hipótese do zero à esquerda: MEDIDA e descartada, ainda em 04/09/2026.** O
  texto acima dizia "não está medido", e envelheceu em horas: a medição está na
  seção 2.2 do catálogo `series-de-medicao-dbfch-e-sibh.md`. Normalizar prefixo
  numérico para oito dígitos rende **164 de 1.235** (13,3%) contra os **53,6%**
  que o casamento direto por `Postos.Prefixo` já entrega. Não vale a
  complexidade.

  Remedido de forma independente em 08/09/2026, contra a API do SIBH (6.018
  estações) e o CSV oficial de postos: o ganho da normalização é **zero** pelo
  `prefix` e **dois postos** pelo `alt_prefix`, sobre uma amostra de 512. A
  conclusão do catálogo se confirma por outro caminho.

### 3.2.2 Inventário da varredura de código morto (04/09/2026)

O código estava limpo: **512 arquivos, zero órfãos, zero dependências mortas,
zero código comentado**. O lint roda com `--max-warnings 0`, o que já mantinha
import e variável sem uso em zero por construção. Foram removidas 76 linhas, e o
que sobrou está listado aqui com o motivo, para ninguém remedir.

**O critério que separou o que sai do que fica:** código morto **esquecido**
engana, porque parece usado, e sai. Código morto **declarado**, com docblock
dizendo que não é usado e por quê, informa, e é decisão de produto, não faxina.

**Removido:** dois aliases de tipo puros, e o cluster fechado de
`lib/triagem-api.ts` (`triagemAPI` e os cinco símbolos que só ele alcançava),
junto de dois comentários de seção órfãos que descreviam código já retirado
("Fetch utilitário pra Server Components" acima de um objeto que não faz fetch).

**Mantido por ser reserva DECLARADA:** `BlocoAnexos`
(`components/features/triagem/PainelPayload.tsx`), cujo docblock diz que nenhum
tipo de ficha tem campo de anexo hoje e que o bloco existe para o dia em que o
app enviar arquivos. Não mente sobre o próprio estado, então não é o alvo desta
limpeza.

**Mantido por pertencer a módulo em construção:** `listarDesconformidades`
(o módulo está na seção 3.1) e `listarSaldosParaConciliacao`.

**Mantido por decisão de escopo, e é o mais delicado:** as três rotas
`/api/sibh/valor`, `/api/sibh/estacoes` e `/api/sibh/medicoes`. A primeira tem
zero citação e as outras duas só aparecem em documentação; o docblock de `valor`
diz servir o "ao vivo" dos Diagramas, mas o consumidor real chama
`/api/diagramas/valores`. **Parecem superadas e não foram removidas**, porque
`viabilidade-dados-prodesp.md` as lista como superfície entregue e a migração
para o servidor do órgão está em curso: remover rota é mudança de contrato
externo, e esta é a pior hora.

**ACHADO que vale mais que a remoção: o domínio e a fronteira mantêm listas
LITERAIS PARALELAS dos mesmos valores.** `domain/estoque/material.ts` tem
`NATUREZAS` congelado e `ehNatureza`; `app/api/estoque/_schemas.ts` escreve
`z.enum(['serializado', 'quantificavel'])` à mão. O mesmo vale para
`TIPOS_MOVIMENTACAO` contra `tipoMovEnum`, com os cinco tipos repetidos.

Os type guards do domínio (`ehNatureza`, `ehTipoMovimentacao`) não têm chamador
justamente porque a fronteira validou por conta própria. **Valor escrito duas
vezes é divergência agendada:** acrescentar uma natureza no domínio sem lembrar
da fronteira faz o valor novo ser recusado com 400 sem explicação, e o contrário
o faz entrar sem o domínio reconhecê-lo. A correção é o esquema derivar do
domínio, e ela **não foi feita aqui de propósito**: mexer em validação de
fronteira exige provar que o comportamento não mudou, e isso é trabalho de outra
ordem que não se mistura com remoção de código morto.

Também mantidos, pela mesma razão de superfície convencional: `SITUACOES_ITEM`,
`ehUuidV4`, `TIPOS_DOCUMENTO_FIXTURES` e `TIPOS_DADO_FIXTURES`.

**Três falsos positivos que a varredura produziu**, registrados porque a próxima
vai produzi-los de novo:

- `eslint-plugin-jsx-a11y` parecia órfão porque o config o cita como
  `plugin:jsx-a11y/recommended`, e não pelo nome do pacote.
- `public/logo-spaguas.png` tem zero referência em código **e está no precache do
  `public/sw.js`**: removê-lo quebraria a instalação do service worker, ou seja a
  PWA inteira.
- **`.next/types/` faz TODA rota parecer referenciada.** O Next gera
  `routes.d.ts` e `validator.ts` a partir do sistema de arquivos, então eles
  listam as 68 rotas por construção, chamadas ou não. São SAÍDA, e não
  consumidor. Quem auditar rota morta com `grep` sem escopo recebe falso negativo
  em todas elas.

E o dado que muda como se faz a próxima varredura: o projeto tem **17 guardas que
leem o código-fonte como texto**, não quatro. Um identificador pode estar sem uso
no grafo de imports e ser exatamente o que uma guarda procura por expressão
regular.

### 3.3 Acabamento medido e não afirmado

8. **Navegação por setas entre séries não foi exercitada:** foram sondados 86
   prefixos e nenhum posto alcançável tem duas séries com dado ao mesmo tempo. O
   comportamento é o nativo do componente e não está afirmado.
9. **Contraste medido num tema só.** O tema escuro está comentado no
   `globals.css` com "não habilitar agora"; as quatro cores do gráfico precisam
   virar variável de CSS no dia em que ele ligar.

### 3.4 Operação

10. **Certificado: NÃO é pendência.** O proprietário informou em 04/09/2026 que a
    renovação é automática no ambiente do órgão. Isso supera a análise da seção
    10.2 do runbook `entrega-imagem-sem-internet.md`, que projetava falha em
    23/10 e queda em 22/11: aquela leitura foi feita de fora, sem conhecer a
    operação da PRODESP. O runbook já traz a correção anotada.
11. **Backup do volume ainda não tem restore testado**, e backup sem restore
    testado não conta como backup.
12. **As senhas que trafegaram por WhatsApp precisam ser trocadas** (servidor e
    Portainer).
13. **O CI passou a rodar nesta branch em 08/09/2026, e achou defeito na
    primeira execução.** O gatilho cobria só a `main`, então cerca de trinta e
    cinco commits desde 19/08 nunca tinham passado por lint, typecheck, testes
    nem pela etapa de integração. Minutos depois de ligar, a etapa "Reaplicar
    tudo (as migrations têm que ser idempotentes)" reprovou: a `0045` indexa
    `posto_id` e a `0068` remove essa coluna, então reaplicar sobre base já
    migrada morria em `column "posto_id" does not exist`. Do zero nunca falhava,
    que é por isso que ninguém tinha visto.

    Corrigido e provado nos dois sentidos contra Postgres com PostGIS local, na
    mesma imagem do CI. Run verde nos três jobs (`34246814039`).

    **A linha do gatilho sai quando esta branch for fundida na `main`**, e é
    branch nomeada e não curinga porque cada execução gasta minuto de Actions.

---

## 4. O que depende do órgão

Estas cinco perguntas destravam trabalho que hoje está parado, e todas nasceram
de medição, não de suposição.

1. **A série manual ainda é alimentada?** As cinco séries param em agosto de 2025,
   e a chuva manual vinha caindo antes: 369 postos em fevereiro, 59 em agosto. Se
   parou, essa é uma informação de valor por si, porque o banco oficial está treze
   meses atrás do telemétrico.

2. **Existe tabela de correspondência entre estação do SIBH e posto?**
   **REBAIXADA de bloqueio para melhoria em 04/09/2026.** Esta pergunta dizia
   "zero casam por `Prefixo`, 2% de cobertura, e não há como contornar do nosso
   lado". Medido contra a fonte dos dois lados: **2.706 de 5.050 prefixos do
   SIBH casam direto com `Postos.Prefixo`, 53,6%.**

   O comparativo funciona sem a tabela. Ela continua útil para os 46,4% que não
   casam, e aí é ganho, não desbloqueio. **Não segura mais entrega nenhuma**, e
   pedi-la como bloqueio seria cobrar do órgão a solução de um problema nosso.

3. **O que significa a coluna `Validacao`**, presente na chuva manual e na cota,
   e se dado não validado pode ser publicado. Filtrar por um significado suposto
   descartaria 99,9% da cota.

4. **Qual a unidade de `CotaEscalaFluviometricas.Valor` e das leituras de
   piezômetro?** A distribuição medida lê como centímetro (cota mediana de 423,
   que dá 4,2 m de régua; como metro daria 423 metros de coluna d'água). Nada é
   convertido enquanto isso não for confirmado, e a tela diz que a unidade é
   inferida.

5. **Qual a régua vigente de cadastro irregular?** A antiga classificaria 54% da
   rede como irregular, e publicar isso sem confirmação seria acusar o próprio
   órgão com um critério que ele não reconhece.

---

## 5. Aviso de processo

O projeto **não tem cartão no quadro de acompanhamento** (conferidos os 49 em
04/09/2026: 30 com etapas, 19 resquícios do formato antigo, nenhum do SP Águas).
Enquanto ele não existir, o cliente não tem o que ler em `/acompanhar`, e o
progresso registrado é apenas este documento.
