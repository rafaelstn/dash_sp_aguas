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

### 2.2 A identidade CASA em mais da metade, e a medição anterior estava invertida

> **CORREÇÃO DE 04/09/2026.** Esta seção afirmava "não há sobreposição de
> identidade", com zero casamentos por `Postos.Prefixo` e cobertura de 2%. **O
> resultado estava invertido, e não apenas impreciso.**
>
> A medição foi feita contra a tabela `estacoes_pluviometricas` do nosso
> PostgreSQL, e naquele momento essa tabela continha **apenas as estações que
> NÃO casavam com posto**: as que casavam recebiam o `Postos.Id` do órgão numa
> coluna com chave estrangeira para a tabela `postos` local, que está vazia por
> desenho, e eram recusadas pelo banco sem nunca ser gravadas (ver a migration
> 0067 e o incidente registrado no runbook de entrega).
>
> **A amostra era exatamente o complemento do que se queria medir.** Medir
> cobertura de casamento numa tabela cujo critério de entrada era "não casou"
> não podia dar outro resultado.

Medido em 04/09/2026 contra a **FONTE dos dois lados** (a API do SIBH e o
`Dbfch`), que é onde isto deveria ter sido medido desde o começo: 5.415 estações
hidrológicas do SIBH, com 5.050 prefixos distintos, contra 5.790 postos ativos.

| Casamento | Estações | Cobertura |
|---|---|---|
| `prefix` x `Postos.Prefixo` | **2.706** | **53,6%** |
| `prefix` x `Postos.PrefixoDNAEE` (código ANA) | 93 | 1,8% |
| `alt_prefix` x `Postos.PrefixoDNAEE` | 54 de 665 | 8,1% |
| `alt_prefix` x `Postos.Prefixo` | 13 de 665 | 2,0% |

**O prefixo do próprio órgão é a chave, e o código ANA é o caso minoritário.**
Os vocabulários se encontram: o SIBH publica `C4-019` e `1D-008` ao lado de
`1000010` e `353180302A`.

A hipótese do zero à esquerda (normalizar prefixo numérico para oito dígitos e
comparar com o código ANA) foi medida junto e rende pouco: **164 de 1.235**
(13,3%) dos prefixos numéricos, contra os 53,6% que o casamento direto já
entrega. Não vale complexidade.

Existe ainda um campo `alt_prefix` na resposta do SIBH, hoje **não consumido**
pelo sistema. Cobre 665 estações e casa mal com as duas chaves, então não é
prioridade, mas está registrado porque é a única chave publicada que ninguém
tentou.

---

## 3. O que dá para construir hoje

1. **Histórico do posto** (chuva, rio, piezômetro) lido do `Dbfch`, com resumo
   barato ao abrir e carregamento por período sob demanda.
2. **Comparativo com o SIBH nas 2.706 estações que casam por prefixo** (53,6% da
   rede), quando houver período em comum. O caso de uso tenta o prefixo primeiro
   e o código ANA depois.
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
2. **Existe tabela de correspondência entre estação do SIBH e posto?**
   **Rebaixada em 04/09/2026, de bloqueio para melhoria.** A pergunta nasceu de
   uma medição enviesada que dizia 2% de cobertura; a real é 53,6% por prefixo
   direto, então o comparativo funciona sem essa tabela. Ela continua valendo
   para os 46,4% que não casam, e aí é ganho, não desbloqueio. **Não é mais
   motivo para segurar a entrega do comparativo.**
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
| `cobertura_casamento.py` | a cobertura de 2%, MEDIDA COM VIES (ver 2.2) |
| `cobertura_real.py` | a cobertura real, contra a fonte dos dois lados |

Duas notas de dado sujo, pequenas mas reais: `MedicaoPluviometricas` tem **30
linhas com data futura** e `MedicaoLoggerPluviograficas` tem **12**, uma delas em
2052. São pontuais diante de 27 milhões, e não sistêmicas, mas quebram qualquer
consulta que use `MAX(Data)` como "hoje".
