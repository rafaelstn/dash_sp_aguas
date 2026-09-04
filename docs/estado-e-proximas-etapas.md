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
3. **Substituto medível enquanto a régua não vem:** 1.093 postos sem código ANA é
   um número que o órgão reconhece e que não depende de régua nova.
4. **Relatório em PDF mostra 2 de 5 campos de instrumentação.** Os outros três
   existem na origem e não chegam ao documento.
5. **Migração de remoção dos 12 campos órfãos**, só depois que o adaptador
   PostgreSQL de posto sair de cena. Antes disso a remoção é irreversível sem
   ganho.

### 3.2 Monitor: a sincronização precisa de chão

6. **2.714 erros de chave estrangeira** na sincronização do SIBH, porque
   `estacoes_pluviometricas` aponta para `postos`, que nasce vazia por desenho
   (posto vem do órgão ao vivo). Enquanto isso não for resolvido, a
   sincronização grava com erro e produz duplicata. **Já derrubou produção uma
   vez, em 03/09/2026:** a criação de um índice único foi recusada porque havia
   prefixo repetido, e a aplicação respondeu 502 até as duplicatas serem
   removidas em transação (2.701 linhas para 2.345). Nenhum dado do cliente foi
   perdido, porque a tabela tinha sido populada pela própria sincronização.
7. **Só depois disso** faz sentido ampliar o comparativo, que hoje cobre 2% das
   estações.

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
