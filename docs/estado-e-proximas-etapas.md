# Estado do projeto e próximas etapas

**Atualizado em 04/09/2026.** Este documento é o ponto de retomada: o que está de
pé, o que está medido e o que ainda não foi afirmado. As perguntas ao órgão na
seção 4 estão prontas para virar ofício.

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

## 2. Concluído em 03 e 04/09/2026

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

---

## 3. Próximas etapas, em ordem

### 3.1 Fechar o módulo de postos e o painel

1. **`/desconformidades` responde zerada.** A régua de desconformidade não foi
   portada para a origem do órgão, e a antiga classificaria 54% da rede como
   irregular, o que não se publica sem a régua nova (seção 4).
2. **`ResumoPendencias.desconformidadesPostos` precisa aceitar `number | null`**,
   para a tela distinguir "medimos e deu zero" de "não temos como medir", que é a
   distinção que o painel já faz nos outros blocos.
3. **Substituto medível: DESCARTADO em 04/09/2026, e o motivo importa.** Eu havia
   registrado "1.093 postos sem código ANA" como número que o órgão reconhece e
   não depende de régua nova. Conferido, ele não se sustenta em três frentes:

   - **O rótulo seria falso para 199 postos.** Dos 4.697 com `PrefixoDNAEE`
     preenchido, 4.498 estão no formato ANA de oito dígitos e **199 têm
     caractere não numérico** (`130-036`, `267-005`), que a seção 6.4 de
     `viabilidade-dados-prodesp.md` conclui **não serem código ANA**. Ou seja,
     1.093 mede campo VAZIO e o rótulo prometeria identidade AUSENTE, que são
     1.292. Divergência que qualquer conferência na origem encontra.
   - **A consequência que justificaria o cartão é refutada pela aritmética.** Dos
     4.697 códigos que já existem, apenas 46 casam com as 2.701 estações do
     SIBH, ou seja 0,98%. Preencher os 1.093 restantes ao mesmo aproveitamento
     acrescentaria cerca de onze estações. O cartão mandaria o gestor executar um
     trabalho de cadastro que **não resolve o problema que o próprio cartão
     nomeia**, e o motivo real está medido: são vocabulários diferentes.
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
4. **Relatório em PDF mostra 2 de 5 campos de instrumentação.** Os outros três
   existem na origem e não chegam ao documento.
5. **Migração de remoção dos 12 campos órfãos**, só depois que o adaptador
   PostgreSQL de posto sair de cena. Antes disso a remoção é irreversível sem
   ganho.

### 3.2 Monitor: a sincronização precisa de chão

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
7. **Só depois disso** faz sentido ampliar o comparativo, que hoje cobre 2% das
   estações.

### 3.2.1 Dois achados do painel que ainda estão abertos

Vieram da revisão de produto de 04/09/2026. O terceiro achado dela, o cartão de
arquivos órfãos verde por medição que não aconteceu, já foi corrigido.

- **"Postos sem arquivo" é permanentemente não apurável nesta instalação**, e
  isso é classe diferente de "Cadastro irregular". O ADR-0023 põe arquivos
  indexados fora de escopo e a imagem do órgão não contém o indexador (runbook
  §9.3). O de conformidade será apurado quando a régua chegar; este não será
  apurado nunca ali. Cartão permanentemente inerte é vaga morta, e esconder por
  instalação é decisão de produto que ainda não foi tomada.
- **Hipótese barata que vale mais que preencher cadastro:** os identificadores do
  SIBH incluem valores de sete dígitos (`1000010`) e o projeto já conhece a
  classe `faltando_zero_esquerda`. Cruzar `PrefixoDNAEE` contra o código do SIBH
  normalizado para oito dígitos com zero à esquerda custa uma consulta. **Não
  está medido.** Se casar, eleva a cobertura do comparativo muito acima do que
  qualquer preenchimento de cadastro elevaria, e responde parte da pergunta 2 ao
  órgão sem depender da resposta dele.

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

---

## 4. O que depende do órgão

Estas cinco perguntas destravam trabalho que hoje está parado, e todas nasceram
de medição, não de suposição.

1. **A série manual ainda é alimentada?** As cinco séries param em agosto de 2025,
   e a chuva manual vinha caindo antes: 369 postos em fevereiro, 59 em agosto. Se
   parou, essa é uma informação de valor por si, porque o banco oficial está treze
   meses atrás do telemétrico.

2. **Existe tabela de correspondência entre estação do SIBH e posto?** Das 2.701
   estações do SIBH, ZERO casam por `Prefixo` e 46 por `PrefixoDNAEE`, ou seja 2%
   de cobertura. Sem essa tabela, o comparativo cobre quase nada, e não há como
   contornar do nosso lado: são vocabulários diferentes.

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
