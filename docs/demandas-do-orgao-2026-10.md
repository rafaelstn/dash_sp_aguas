# Demandas do órgão: o que já está no ar e o que falta

Levantamento feito em 05/10/2026 contra o código da `main` (`a5a92f2`), que é o
que está em produção mais documentação. Cada linha de "já existe" foi medida no
arquivo citado, não lembrada.

As demandas vêm de dois e-mails depois da reunião de 16/09/2026: o da Nicole, com
sete itens, e o complemento que pede a tela de **Projetos**. Os dois prints
anexados mostram como a curva-chave é cadastrada hoje no sistema legado, e são a
especificação do formulário que falta.

---

## Resumo

| # | Demanda | Estado |
|---|---|---|
| 1 | Tela única com mapa e filtros | **No ar**, faltam 3 filtros |
| 2 | Inserir curva-chave na ficha do posto | **Só leitura**; escrita esbarra em decisão |
| 3 | API nível para vazão por vigência | **Não existe** |
| 4 | PIEZO: cadastro do poço e perfil geológico | **Não existe** |
| 5 | Upload e validação de arquivo `.lvl` | **Não existe** |
| 6 | Controle de estoque | **No ar**, faltam 2 campos do pedido |
| 7 | Projetos (ícone, cadastro, vínculo com postos) | **Não existe** |

Nada do que falta está parado por falta de braço: três itens dependem de decisão
da PRODESP ou do órgão, e é por isso que estão nesta ordem.

---

## 1. Tela única com mapa e filtros

**Está no ar desde 24/09/2026.** O Monitor deixou de existir como rota e virou a
metade de série histórica da tela de Postos; mapa, lista e filtros dividem a
mesma consulta, e cada filtro mostra o próprio contador (faceta), que sai da
mesma resposta.

Dos filtros pedidos, já funcionam:

| Pedido | Como está |
|---|---|
| ativa / inativa | situação por `DataExtincao` |
| convencional / automática / telemétrica | `convencional` (3.091), `gravacao_local` (380), `telemetrico` (149) |
| UGRHI | lista com contagem, mais a opção "sem UGRHI" |
| PLU / FLU / PIEZO | os três tipos no topo dos filtros |
| COM medições de vazão | três fontes independentes: aparelho ativo (326), medição de campo (519), curva-chave (375), e a união (595) |

Faltavam três. Dois estão entregues e o terceiro depende do órgão:

1. **Mantenedor**: **pronto em 05/10/2026**, e entra no ar na próxima entrega
   à Prodesp, como todo o resto (o push não publica nada aqui). A tela tem o
   campo com a lista dos mantenedores e quantos postos cada um tem, nas duas
   larguras, mais a
   opção "Sem mantenedor" para os postos que o cadastro deixou sem operadora.
   A contagem é cruzada, como a das outras dimensões: cada opção mostra quantos
   postos ela traria mantidos os demais filtros. Nomes que o cadastro gravou com
   caixa ou acentuação diferentes somam na mesma linha, e o rótulo exibido é o
   do cadastro. O link `/?mantenedor=<nome>` que o painel já produzia continua
   abrindo a tela filtrada.
2. **COM / SEM curva-chave e COM / SEM medição**: **pronto em 05/10/2026**, e
   a negação entrou nas duas dimensões de vazão com o mesmo comportamento, mais
   a opção "Nenhuma fonte de vazão". No desktop as ausências ficam num grupo
   separado do select ("O posto não tem"), e no celular são radios do mesmo
   grupo das fontes, para a escolha continuar sendo uma só.
3. **Gerência SP-Águas**: **não existe no banco do órgão**. Zero ocorrência no
   `Dbfch`. A hipótese registrada é derivar da UGRHI, e para isso o órgão precisa
   mandar a tabela de correspondência UGRHI para gerência. Enquanto ela não vier,
   o filtro não pode existir sem inventar critério.

Um ponto de vocabulário que vale confirmar antes de mexer: o que chamamos de
`gravacao_local` é o que o órgão chama de **automática**? A classificação saiu
do tipo de aparelho ativo, e rótulo errado em painel de governo vira número que
alguém cita em documento.

---

## 2. Inserir e ver curva-chave na ficha do posto

**Ver já funciona**: `GET /api/postos/[prefixo]/curvas-chave` lê as curvas do
`Dbfch` e a ficha mostra. **Inserir não existe**, e aqui está a decisão mais
importante do pacote.

O acesso ao SQL Server do órgão é **somente leitura por desenho**, com uma
barreira que roda antes de a consulta sair do processo e um teste escrito
tentando escapar dela (`tests/unit/mssql-guarda-somente-leitura.test.ts`).
Gravar curva-chave pela nossa plataforma significa escolher um destes caminhos:

- **a) gravar no nosso banco** e a plataforma passar a ser a fonte da curva-chave,
  com o `Dbfch` lido só como histórico. Resolve rápido, e cria duas verdades até
  o legado ser desligado;
- **b) a PRODESP liberar escrita** em `CurvaChaveFluviometricas`, com usuário
  próprio e as regras de validação do legado replicadas do nosso lado;
- **c) continuar cadastrando no sistema legado** (os prints) e nós só lermos,
  o que mantém o que está no ar e tira a demanda da lista.

Não dá para escolher por conta: é dado oficial de vazão, e o caminho muda quem
responde por ele.

O formulário em si já está especificado pelos prints, e bate com o que lemos do
banco: cabeçalho com posto, data de início, data final, índice de qualidade e o
indicador de consistência, mais **N equações** com os coeficientes `K`, `H0`,
`N` e `I`, onde `I` é o limite superior do trecho. A fórmula é
`Q = K * (H - H0) ^ N`, para `H < I`.

Duas regras precisam vir escritas antes de replicarmos o formulário, e nenhuma
das duas se responde pelos prints: se o período de validade de duas curvas do
mesmo posto pode se sobrepor, e qual é o mínimo de equações para a curva valer.
Não medimos o que o legado aceita, e o comportamento dele não é a regra: se a
conversão automática do item 3 for em frente, sobreposição deixa de ser detalhe
de cadastro e passa a decidir qual vazão sai.

---

## 3. API que converte nível em vazão respeitando a vigência

**Não existe.** É o combinado com a PRODESP: a plataforma gerencial guarda a
curva, e o Portal da Hidrologia pede a conversão.

Depende do item 2 (sem saber onde a curva mora, não há o que servir) e de um
acordo de contrato: formato, autenticação, limite de requisições e o que
responder quando o nível cair fora de toda faixa vigente, que não é erro raro.
O diagnóstico de 17/09 já mostrou que **nenhuma curva está vigente hoje** e que
as antigas reproduzem mal os anos 2020 (31,7%), então a resposta precisa dizer
com qual curva converteu, e não só o número.

---

## 4. PIEZO: dados cadastrais do poço e perfil geológico

**Não existe nada.** O órgão ficou de mandar exemplos, e eles definem o módulo:
quais campos são do poço, como o perfil geológico é representado (camadas com
profundidade? desenho? documento?) e se isso é ficha nova ou aba da ficha atual.

---

## 5. Upload e validação dos arquivos `.lvl`

**Não existe**, e tem um pré-requisito que vale para o item 7 também: **o sistema
hoje não recebe arquivo nenhum pela tela**. Os PDFs que ele mostra são indexados
de uma pasta, não enviados pelo navegador. Então a primeira entrega aqui é a
infraestrutura de upload (onde o arquivo fica no servidor do órgão, limite de
tamanho, tipo aceito, antivírus se exigido), e só depois o `.lvl`.

A validação pedida é a parte fácil de descrever e a cara de fazer certo: precisa
recusar arquivo malformado **antes** de encostar no banco, dizer qual linha
reprovou, e nunca gravar metade. E "inserção no banco da PRODESP" esbarra na
mesma decisão de escrita do item 2.

---

## 6. Controle de estoque

**Está no ar desde 05/10/2026.** Já atende: carga da planilha do inventário,
material e unidade serializada, **código de barras** com etiqueta para impressão,
**local de armazenamento**, **quantidade** por saldo, **status** (ativo, defeito,
descarte) e **estado** (novo, bom, usado, defeito, sucata), movimentação de
entrada, saída, transferência, baixa e ajuste, conferência de inventário com
divergências, e exportação.

Faltam dois campos, os dois do trecho "no caso de retirada":

1. **quem solicitou** a retirada;
2. **autorização do responsável SP-Águas**.

Hoje a saída grava quem registrou (pela trilha), o local, a quantidade e uma
observação livre. O pedido é que solicitante e autorização sejam campos próprios,
e isso muda o formulário e a trilha. Vale perguntar junto: a **autorização** é um
nome digitado, uma lista de responsáveis cadastrados, ou um aceite que a pessoa
autorizada dá no sistema? São três produtos diferentes, e o terceiro é bem maior.

Continua valendo a pergunta já aberta: no modo de acesso sem identificação,
abrir conferência exige papel de administrador, e no ensaio de 16/09 a operação
respondeu 403. Enquanto não houver decisão, o estoque está no ar e inoperável
nesse modo.

---

## 7. Projetos

**Não existe nada**: nem rota, nem tela, nem tabela. É o maior item novo do
pacote, e o que está mais bem descrito pelo próprio cliente:

- ícone "Projetos" na barra lateral, ao lado de Monitor e Favoritos. O e-mail
  cita o Monitor como item do menu, e ele **deixou de existir** na fusão de
  setembro: as rotas de hoje são `postos`, `favoritos`, `estoque`,
  `inventario-ana`, `triagem`, `desconformidades`, `diagramas`, `painel`,
  `perfil` e `admin`. Vale alinhar isso na resposta, porque o menu que ele
  descreve não é o que está no ar;
- lista de projetos, com cadastro de dados básicos, número SEI e **upload de
  PDFs** (mesma infraestrutura de upload do item 5, que não existe);
- vínculo de um conjunto de estações a cada projeto, com filtro, status e ações;
- na tabela principal, uma coluna **Projetos** com a contagem de projetos de que
  cada estação participa, para priorizar manutenção.

A contagem na tabela principal é barata depois que o vínculo existir, e é ela que
dá o retorno que o cliente descreveu ("saber em quantos projetos a estação
participa"). O que precisa ser decidido antes de desenhar: quem pode criar
projeto, quem pode vincular estação, e se "status" e "ações" são campos livres ou
uma lista fechada de etapas.

---

## O que precisa de resposta antes de começarmos

1. Onde a curva-chave passa a ser gravada (item 2): nosso banco, `Dbfch` com
   escrita liberada, ou segue no legado.
2. Tabela de correspondência UGRHI para gerência (item 1).
3. Os exemplos do poço e do perfil geológico (item 4).
4. O que é a "autorização do responsável" na retirada: texto, lista ou aceite no
   sistema (item 6).
5. Confirmação do vocabulário de transmissão: "automática" é o nosso
   `gravacao_local` (item 1).

Com 1 e 5 respondidos, a tela de filtros e o cadastro de curva-chave andam na
mesma semana. Os itens 3, 4, 5 e 7 são módulos novos e se planejam um a um.
