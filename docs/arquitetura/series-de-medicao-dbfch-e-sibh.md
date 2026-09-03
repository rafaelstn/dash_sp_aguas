# Séries de medição: o que existe no `Dbfch` e o que existe no SIBH

**Medido em 03/09/2026**, com a VPN do órgão, somente leitura. Este documento
existe para o módulo Monitor: ele localiza os dados **antes** da implementação,
que foi a instrução do proprietário ("localiza primeiro os dados, depois a gente
implementa").

Os scripts de medição estão no anexo do fim.

---

## 1. As cinco séries do banco do órgão

Todas moram em `Dbfch`, ligam ao posto por `PostoId` (`uniqueidentifier`), têm
coluna `Data` (`datetime`) e coluna `Excluido` (`bit`).

| Série | Tabela | Linhas | Postos | Granularidade | Valor |
|---|---|---|---|---|---|
| **Chuva manual** | `MedicaoPluviometricas` | 27.280.208 | 2.096 | **1 por dia**, hora sempre `00:00:00` | `Medicao` (decimal) |
| Chuva automática | `MedicaoLoggerPluviograficas` | 1.965.398 | 140 | com hora | `Medicao`, `Acumulado` |
| **Rio (cota de régua)** | `CotaEscalaFluviometricas` | 10.987.980 | 745 | 2 por dia, com hora | `Valor` (int), `VazaoMainframe` |
| **Piezômetro manual** | `LeituraManualPiezometricas` | 131.938 | 102 | 1 por dia | `Valor` (int) |
| Piezômetro eletrônico | `LeituraEletronicaPiezometricas` | 2.207.919 | 81 | até 33 por dia | `Valor` |

`MedicaoPluviometricas` e `CotaEscalaFluviometricas` têm ainda `Validacao`
(`tinyint`), que distingue leitura conferida de leitura crua. **Ignorar essa
coluna é publicar dado não validado como se fosse oficial.**

A granularidade foi medida, não suposta: das 500 leituras mais recentes da chuva
manual, **zero** têm hora preenchida, e o máximo de leituras de um posto num
mesmo dia é **1**. É a série diária manual descrita pelo proprietário.

### 1.1 O volume por posto decide o desenho da tela

Um único posto chega a **41.002 leituras** (`E3-036`, LUZ, de 1888 a 2004).
`C5-018` tem 32.691, de 1936 a 2025. Abrir a ficha carregando a série inteira é
inviável, e foi por isso que o proprietário pediu carregamento sob demanda.

---

## 2. As duas fontes não se encontram, e isso governa o comparativo

### 2.1 Não há sobreposição no TEMPO

**Todas as cinco séries do órgão param em agosto de 2025**, e o SIBH entrega
dado desta semana. Medido mês a mês, a chuva manual vinha caindo antes de parar:

| Mês | Leituras | Postos |
|---|---|---|
| 2025-02 | 10.332 | 369 |
| 2025-04 | 7.410 | 247 |
| 2025-06 | 5.460 | 182 |
| 2025-08 | 1.829 | **59** |
| depois | 31 leituras de 1 posto | — |

O SIBH, na mesma medição: **9.525 leituras entre 26/08 e 02/09/2026**.

Uma fonte está viva e a outra parada há treze meses. **Comparar as duas hoje
produziria divergência em praticamente 100% dos casos, e a divergência seria do
método, não do dado.**

### 2.2 Não há sobreposição de IDENTIDADE

Medidas as 2.701 estações que o SIBH entregou contra os 5.790 postos ativos:

| Casamento | Estações |
|---|---|
| por `Postos.Prefixo` | **0** |
| por `Postos.PrefixoDNAEE` (código ANA) | **46** |
| não casam | **2.655** |
| **cobertura** | **2%** |

São vocabulários diferentes. O órgão usa `C5-018`, `5C-003`, `V-06-391`,
`C4-A112`; o SIBH usa `1000010`, `353180302A`, `IAC-Caconde - SP`. Dos postos
ativos, 4.697 de 5.790 têm código ANA, então a chave existe — ela é que não é a
que o SIBH publica.

---

## 3. O que dá para construir hoje

1. **Histórico do posto** (chuva, rio, piezômetro) lido do `Dbfch`, com resumo
   barato ao abrir e carregamento por período sob demanda.
2. **Comparativo com o SIBH nas 46 estações que casam**, quando houver período em
   comum.
3. **Três estados explícitos**, que não podem virar o mesmo vazio:
   `sem correspondência no SIBH`, `correspondência existe mas sem dado no
   período`, e `dado dos dois lados`. Só o terceiro compara. Confundi-los é o
   mesmo defeito que o painel tinha antes de distinguir "medimos e deu zero" de
   "não temos como medir".

---

## 4. O que precisa do órgão

1. **A série manual ainda é alimentada?** Se parou em agosto de 2025, essa é uma
   informação de valor por si: o banco oficial está treze meses atrás do
   telemétrico.
2. **Existe tabela de correspondência entre estação do SIBH e posto?** Sem ela,
   98% das estações ficam órfãs e o comparativo cobre quase nada.
3. **O que significa `Validacao`** nas duas tabelas que a têm, e se dado não
   validado pode ser publicado.

---

## Anexo: como reproduzir

Scripts em `scratchpad` da sessão de 03/09/2026, todos somente leitura, com a
credencial lida do cofre sem passar por argv:

| Script | Responde |
|---|---|
| `mapear_medicoes.py` | estrutura das nove tabelas de medição |
| `granularidade_medicoes.py` | período, granularidade e postos por série |
| `detalhe_series.py` | colunas completas, datas futuras, volume por posto |
| `atualidade_series.py` | leituras mês a mês nos últimos meses |
| `sobreposicao.py` | se os prefixos do SIBH existem no cadastro |
| `casamento_ana.py` | casamento pelo código ANA |
| `cobertura_casamento.py` | a cobertura de 2% |

Duas notas de dado sujo, pequenas mas reais: `MedicaoPluviometricas` tem **30
linhas com data futura** e `MedicaoLoggerPluviograficas` tem **12**, uma delas em
2052. São pontuais diante de 27 milhões, e não sistêmicas, mas quebram qualquer
consulta que use `MAX(Data)` como "hoje".
