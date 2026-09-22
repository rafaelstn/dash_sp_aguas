# API da tela Postos com o Monitor: mapa, vazão e curva-chave

Criado em 17/09/2026, na fusão do Monitor com a tela Postos. Todas as rotas
leem o `Dbfch` do órgão ao vivo, somente leitura, e seguem o padrão das rotas
de série do Monitor.

## Regras comuns

- **Autenticação:** `exigirUsuario()`. Sem sessão, a resposta é a do helper (401).
- **Limite de requisições:** política `leituraMonitor`, por usuário. Estourou:
  `429 { "erro": "rate_limit", "mensagem": "Muitas requisições. Tente em instantes." }`.
- **Origem indisponível:** fora do modo demo e sem `SQLSERVER_*`, as portas são
  `null` e as rotas respondem
  `501 { "erro": "origem_indisponivel", "mensagem": "..." }`.
- **Erro inesperado:** `respostaDeErro`, com `500` e identificador de correlação.
- **Falha do banco (`falha_repositorio`):** `500` com mensagem de CONSULTA nas
  rotas GET e HEAD ("Não foi possível consultar agora...") e a de gravação nas
  outras ("...Os dados preenchidos continuam nesta tela..."). O verbo sai do
  rótulo passado a `respostaDeErro`; um teste varre `src/` e reprova rótulo sem
  verbo HTTP.
- **Modo demo:** adaptadores em `src/infrastructure/mock/`, derivados das
  fixtures de posto e determinísticos.

As rotas de `/api/monitor/*` continuam como estavam. Nada do Monitor foi removido.

## GET /api/postos/mapa

Todos os postos que casam com o filtro, **sem paginação**, com as facetas em
contagem cruzada.

### Parâmetros (todos opcionais)

| Parâmetro | Valores | Regra |
|---|---|---|
| `q` | texto, até 60 caracteres | mesma regra da busca: um caractere responde 400; código de posto vira início de prefixo |
| `municipio`, `bacia`, `mantenedor` | texto | igualdade, como na busca |
| `favoritos` | `1` ou `true` | só os favoritos do usuário da sessão |
| `tipo` | `plu`, `flu`, `piezo`, `meteo` | múltipla escolha |
| `situacao` | `em_operacao`, `extinto` | múltipla escolha |
| `transmissao` | `telemetrico`, `gravacao_local`, `convencional` | múltipla escolha |
| `vazao` | `aparelho_ativo`, `medicao`, `curva`, `qualquer` | múltipla escolha |
| `ugrhi` | 1 a 22, ou `sem` | múltipla escolha; `sem` seleciona os postos sem UGRHI |
| `uf` | sigla de duas letras (qualquer caixa), ou `sem` | múltipla escolha; `sem` seleciona os postos sem UF declarada |

Múltipla escolha aceita a chave repetida (`?tipo=plu&tipo=flu`) ou lista por
vírgula (`?tipo=plu,flu`). Dentro de uma dimensão vale OU; entre dimensões vale
E. Valor desconhecido responde
`400 { "erro": "query_invalida", "motivos": ["tipo.1: ..."] }`.

### Resposta 200

```json
{
  "total": 5790,
  "semCoordenada": 6,
  "pontos": [
    {
      "prefixo": "2D-008",
      "nome": "FAZENDA SANTANA",
      "lat": -22.94694,
      "lon": -45.91889,
      "tipo": "flu",
      "situacao": "em_operacao",
      "transmissao": ["gravacao_local", "convencional"],
      "vazao": ["aparelho_ativo", "medicao", "curva"],
      "ugrhi": 2,
      "municipio": "SAO JOSE DOS CAMPOS",
      "uf": "SP",
      "coordenadaSuspeita": false
    }
  ],
  "facetas": {
    "tipo": { "plu": 3943, "flu": 1588, "piezo": 103, "meteo": 156 },
    "situacao": { "em_operacao": 4414, "extinto": 1376 },
    "transmissao": { "telemetrico": 149, "gravacao_local": 380, "convencional": 3091 },
    "vazao": { "aparelho_ativo": 326, "medicao": 519, "curva": 375, "qualquer": 595 },
    "ugrhi": [{ "numero": 1, "total": 30 }, { "numero": null, "total": 1748 }],
    "uf": [{ "uf": "SP", "total": 4022 }, { "uf": "MG", "total": 381 }, { "uf": null, "total": 297 }]
  }
}
```

Campos do ponto:

- `lat` e `lon`: graus decimais com 5 casas; os dois nulos quando falta um deles.
- `tipo`: `null` quando a descrição do tipo não é reconhecida.
- `transmissao` e `vazao`: listas, possivelmente vazias.
- `ugrhi`: `null` quando o posto não tem UGRHI (1.748 postos; ver `UGRHI_NUMERO`
  em `postos-dbfch-sql.ts`).
- `municipio`: nome do município como o cadastro grava (caixa alta, sem acento), ou `null`.
- `uf`: `Postos.CodigoEstadoMainframe` e, na falta, a UF do município. Só duas
  letras viram sigla; o resto é `null`.
- `coordenadaSuspeita`: `true` quando latitude e longitude são graus inteiros
  (minutos e segundos zerados no cadastro). O posto continua na lista e no
  mapa; a marca é para a tela avisar.

Facetas:

- Cada dimensão é contada com os filtros das outras aplicados e o dela ignorado.
- Em `transmissao` e `vazao` um posto conta em cada valor que tem, então as
  contagens não somam o total.
- `vazao.qualquer` conta postos.
- A UGRHI marcada aparece na lista mesmo com zero.
- `uf`: SP primeiro, depois as siglas em ordem, `null` por último. A UF marcada
  aparece mesmo com zero.

### Definições

A fonte é `src/domain/mapa-postos.ts`, que traz as listas completas.

- **Situação.** `extinto` quando `Postos.DataExtincao` está preenchida e não é
  futura. Essa régua não é a mesma do parâmetro antigo `status` de
  `/api/postos/search`. "Paralisado" e gerência ainda não existem: entram como
  novo valor em `SITUACOES_POSTO` quando o órgão passar a regra.
- **Transmissão.** Derivada dos aparelhos ativos (`AparelhoPostos.DataDesativacao IS NULL`).
  - `telemetrico`: designações telemétricas.
  - `gravacao_local`: designações com gravação local.
  - `convencional`: designações lidas por observador ou registradas em papel,
    incluindo `PIEZOMETRO`.

  Um posto com mais de uma aparece em cada uma. Os 1.130 postos em operação
  sem aparelho ativo dessas designações ficam com a lista vazia.
- **Vazão.**
  - `aparelho_ativo`: aparelho ativo `CURVA-CHAVE*` ou `MEDICAO DE VAZAO*`.
  - `medicao`: existe linha em `ResumoMedicaoVazoes`.
  - `curva`: existe linha em `CurvaChaveFluviometricas`.
  - `qualquer`: a união das três.

### Medido em 17/09/2026 (VPN, base inteira, sem filtro)

| Medida | Valor |
|---|---|
| Tempo do caso de uso, três chamadas seguidas | 316 a 429 ms |
| Corpo cru | 952.634 bytes |
| Corpo gzip | 102.060 bytes |
| Corpo cru se cada ponto levasse o GUID | 1.207.394 bytes |
| Corpo gzip se cada ponto levasse o GUID | 243.142 bytes |

O GUID ficou fora: o prefixo já identifica o posto nas outras rotas, e o GUID
mais que dobraria o corpo comprimido. A compressão do Next vale no `next start`.
Se o proxy da PRODESP também comprime, ainda não foi verificado.

### Postos fora de São Paulo

A captura da tela mostrou centenas de pontos fora do Estado. Medido no `Dbfch`
em 17/09/2026: **a conversão está correta e os postos são de outros estados**.

- A coordenada vem de `Postos.CoordenadaGrausLatitudade` e
  `CoordenadaGrausLongitude` (inteiro GGMMSS em 5.430 postos, GGMMSSCC em 354,
  nulo em 6), sempre negativa. Prova: 02650009 PAULA FREITAS (PR), bruto
  261300/505600, vira -26,21667/-50,93333, que é a cidade.
- Fora da união das 22 UGRHIs (`public/geo/ugrhis-sp.json`): **1.810 de 5.784**
  com coordenada. Por UF: PR 996, MG 378, RJ 51, MS 33, sem UF 285, SP 67.
- Os 285 sem UF têm prefixo numérico (código ANA) e nenhuma UGRHI.
- Dos 67 que declaram SP, 42 estão a até 1 km da divisa e 15 entre 1 e 5 km
  (posto na margem do rio de divisa). Os casos longe da divisa são dado do
  cadastro: 83704 (bruto 240000/550000, 246 km fora), 4G-002, F10REG e P10REG
  (bruto 250000/470000, 53 km fora) e PPPP009L (26 km fora).
- 30 postos têm graus inteiros nos dois eixos, dentro e fora do Estado; são os
  marcados com `coordenadaSuspeita`. PPPP009L não é pego pela marca.
- A planilha do protótipo tem 2.484 postos, só 18 dos que caem fora, e as
  longitudes dela estão deslocadas cerca de 0,2 grau (1D-008 CRUZEIRO: `Dbfch`
  -44,966, a cidade -44,963, a planilha -45,14).

Tela que quer só a rede paulista pede `uf=SP`.

### Custo dos campos `municipio`, `uf` e `coordenadaSuspeita`

Medido pelo teste de integração, antes e depois na mesma execução, base inteira
sem filtro (17/09/2026):

| Corpo | Sem os três campos | Com os três campos |
|---|---|---|
| Cru | 952.785 bytes | 1.300.892 bytes |
| gzip | 102.116 bytes | 116.909 bytes |

O que a rede cobra é o gzip: mais 14,8 KB (14,5%). O `antes` já inclui a faceta
`uf`, por isso passa 151 bytes da medição anterior.

## GET /api/postos/[prefixo]/medicoes-vazao

Medições de vazão em campo (`ResumoMedicaoVazoes`), da mais recente para a mais
antiga.

Parâmetros: `pagina` (a partir de 1, padrão 1) e `porPagina` (1 a 200, padrão 50).
Fora disso:
`400 { "erro": "paginacao_invalida", "mensagem": "...", "motivos": [...] }`.

- Prefixo inexistente: `404 { "erro": "posto_nao_encontrado", "mensagem": "Posto não encontrado." }`.
- Posto sem medição: `200` com `total: 0` e `itens: []`.

```json
{
  "prefixo": "6B-009",
  "pagina": 1,
  "porPagina": 50,
  "total": 762,
  "itens": [
    {
      "dataInicial": "2024-02-02T12:26:00.000Z",
      "dataFinal": "2024-02-02T12:32:00.000Z",
      "cotaInicial": 1.12,
      "cotaFinal": 1.12,
      "vazaoLiquida": 23.815,
      "areaSeccao": 48.37,
      "larguraSeccao": 34.78,
      "profundidadeMedia": 1.39,
      "velocidadeMedia": 0.5,
      "qualidade": "0",
      "entidadeMedidora": "DAEE"
    }
  ]
}
```

- `areaSeccao`, `larguraSeccao`, `profundidadeMedia`, `velocidadeMedia`,
  `qualidade` e `entidadeMedidora` podem ser nulos.
- A tabela não tem coluna de pessoa. A entidade medidora é órgão ou empresa.
- Os códigos internos do mainframe ficam de fora.
- No exemplo, área vezes velocidade (48,37 x 0,5 = 24,2) bate com a vazão
  líquida, o que é coerente com m³/s. É uma conferência de uma linha, e não
  confirmação do órgão.

Medido: 141 ms no posto com mais medições.

## GET /api/postos/[prefixo]/curvas-chave

Curvas-chave do posto, **somente exibição**, da vigência mais recente para a
mais antiga, sem paginação (o maior posto tem 60 curvas).

- Prefixo inexistente: 404.
- Posto sem curva: `200` com `curvas: []`.

```json
{
  "prefixo": "7D-010",
  "total": 60,
  "curvas": [
    {
      "dataInicio": "2023-03-16T00:00:00.000Z",
      "dataFinal": "2023-06-29T00:00:00.000Z",
      "vigente": false,
      "indiceQualidade": "REG",
      "consistencia": "C",
      "trechos": [{ "k": 6.8, "h": 0.6, "n": 1.71, "i": 10 }]
    }
  ]
}
```

- `vigente` é `true` quando hoje está dentro de `dataInicio` e `dataFinal`.
  Em 17/09/2026 nenhuma curva da base está vigente.
- `trechos` sai como gravado, ordenado por `i`, e pode vir vazio (135 curvas não
  têm equação). `h` pode ser negativo.
- A forma da equação e o significado de `i` não foram confirmados pelo órgão.
  Nada é calculado a partir da curva.

Medido: 83 ms e 14.655 bytes no posto com 60 curvas.

## Série `vazao_rio` nas rotas do Monitor

As rotas de série já existentes passam a aceitar `vazao_rio`, pelo mesmo
mecanismo das outras cinco:

- `/api/monitor/postos/[prefixo]/series`
- `.../series/vazao_rio/leituras`
- `.../series/vazao_rio/diario`

Definição da série:

- **Fonte:** `CotaEscalaFluviometricas.VazaoMainframe`.
- **Sentinela:** 99999.999, que vira valor nulo.
- **Dia:** média das leituras com valor.
- **Unidade:** `m3/s`.

O resumo traz `ultimaDataComValor`, que ignora a sentinela. É dele que a tela
tira "sem vazão gravada após 12/2023": a última vazão gravada é de 31/12/2023,
e a base segue com linhas de sentinela depois disso.

O comparativo com o SIBH responde
`sem_correspondencia` com motivo `serie_sem_equivalente_no_sibh` para a vazão,
sem chamar o SIBH.

## Testes

- Unitários:
  - `tests/unit/domain/mapa-postos.test.ts`
  - `tests/unit/use-cases/listar-pontos-mapa.test.ts`
  - `tests/unit/infrastructure/mock/mapa-vazao-mocks.test.ts`
  - `tests/unit/infrastructure/db/mapa-vazao-mssql-adaptadores.test.ts`: o SQL
    gerado passa pela guarda real.
  - `tests/unit/api/postos-mapa-vazao-rotas.test.ts`
- Integração com o `Dbfch`: `tests/integration/mapa-vazao-mssql.test.ts`, rodado
  com `node --env-file=.env.local node_modules/vitest/vitest.mjs run <arquivo>`.
