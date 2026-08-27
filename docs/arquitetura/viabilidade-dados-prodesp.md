# Viabilidade de dados: o que o sistema consegue exibir lendo o SQL Server do órgão

| Campo | Valor |
|-------|-------|
| Status | Análise concluída, com pendências de confirmação junto ao órgão |
| Data | 2026-08-27 |
| Solicitante | Rafael Damasceno (proprietário) |
| Autoria técnica | Lucas (Backend), sob orquestração de Matheus (CTO) |
| Cliente | GOVERNO. SP Águas / DAEE. Rules `governo`, `padrao`, `padrao-ui` |
| Escopo | Para cada tela e cada rota de API do sistema, dizer se o dado passa a vir do órgão, continua nosso, ou deixa de ter origem |
| Insumos | `docs/arquitetura/schema-dbfch-prodesp.md` (catálogo de 157 tabelas), ADR 0023, código da aplicação, e medição direta em `Dbfch` |
| Natureza do acesso | Somente leitura. Nenhuma escrita foi executada em `Dbfch` |

---

## 1. Sumário executivo

A pergunta era se os dados exibidos pelo sistema podem ser lidos do banco `Dbfch`,
do SQL Server do órgão, agora que a base atual será descontinuada.

**A resposta curta: o cadastro de postos, sim, e com ganho de qualidade. As séries
de medição, não, porque o banco a que temos acesso está congelado desde outubro de
2025.**

O achado que precede todos os outros, e que muda a natureza da conversa com o
órgão, está na seção 2: **a instância `10.20.40.62` não hospeda a base viva de
`Dbfch`, e sim uma cópia restaurada.** Isso está registrado no próprio servidor,
com data e origem, e não depende de interpretação.

Para o conjunto das 24 telas e 30 rotas analisadas, a distribuição é a seguinte:

| Classificação | Telas | Observação |
|---|---|---|
| **VEM DO ÓRGÃO** | 9 telas dependem, no todo ou em parte, do cadastro de posto | Mapeamento resolvido, com conversão conhecida |
| **CONTINUA NOSSO** | 13 telas não têm equivalente em `Dbfch`, nem devem ter | Fichas, triagem, estoque, diagramas, favoritos, inventário ANA, desconformidades |
| **NÃO EXISTE EM LUGAR NENHUM** | 2 telas perdem a função principal, e 9 campos de outras telas ficam vazios | Monitor e administração de usuários. Detalhe nas seções 6.1 e 6.5 |

Os três pontos que exigem decisão do proprietário ou do órgão, em ordem de peso:

1. **O Monitor não sobrevive à leitura de `Dbfch`.** Ele mostra chuva e nível
   recentes, e a base não recebe medição há onze meses. Detalhe em 6.1.
2. **A tela de administração de usuários deixa de existir como tela de
   administração.** Com leitura apenas, ela vira uma listagem. Detalhe em 6.5.
3. **A instância a que temos acesso é uma cópia.** Enquanto isso não for
   esclarecido, qualquer número deste documento e do ADR 0023 descreve o estado
   de 3 de outubro de 2025, e não o estado de hoje.

---

## 2. O achado que precede todo o resto: a base é uma cópia restaurada

Esta seção vem antes do mapeamento porque ela condiciona a leitura de tudo que
vem depois.

### 2.1 O que foi medido

Consultas de catálogo e de histórico do próprio SQL Server, sem tocar em dado de
aplicação. Todas **MEDIDAS** em 27/08/2026, com o relógio do servidor em
`2026-08-27 11:52:14`:

| Fato | Valor | Origem da medição |
|---|---|---|
| Data de criação de `Dbfch` na instância | **2025-10-22 09:15:51** | `sys.databases.create_date` |
| Restauração registrada | **em 2025-10-22 09:15:51, a partir de backup de 2025-10-03 10:41:25** | `msdb.dbo.restorehistory` cruzado com `msdb.dbo.backupset` |
| Servidor de origem do backup | **`ARANDU`** | `msdb.dbo.backupset.server_name` e `.machine_name` |
| Quantidade de backups de `Dbfch` nesta instância | **1**, do tipo FULL | `msdb.dbo.backupset` |
| Quantidade de restaurações de `Dbfch` | **1** | `msdb.dbo.restorehistory` |
| Última requisição registrada pela aplicação do órgão | **2025-10-03 10:38:16** | `Dbfch.dbo.Logs.Data`, máximo sobre 260.116 linhas |

O último registro de uso da aplicação e o encerramento do backup estão a **três
minutos de distância** um do outro. A leitura natural é que a base foi copiada
logo depois de o sistema parar de ser usado, e restaurada aqui dezenove dias
depois.

Para contraste, e a comparação é o que fecha o argumento: a base `Dbdaeeweb`, na
mesma instância, tem **61 backups entre 2025-08-26 e 2026-08-03** (**MEDIDO**).
Ou seja, esta instância mantém rotina de backup para base viva. `Dbfch` não tem
essa rotina, porque nada escreve nela.

### 2.2 A varredura que confirma o congelamento

Foram varridas **as 62 colunas de tipo data das 157 tabelas**, tomando o valor
máximo de cada uma que não seja futuro (**MEDIDO**). As dez mais recentes:

| Valor máximo | Coluna |
|---|---|
| 2025-12-31 | `MedicaoPluviometricas.Data` |
| 2025-10-03 10:38:16 | `Logs.Data` |
| 2025-09-18 08:45:02 | `LogFormatadores.DataInicio` e `.DataFim` |
| 2025-09-15 08:29:46 | `ConferenciaLoteDigitacaoPluviometricas.DataHoraFinalConferencia` |
| 2025-09-15 08:07:24 | `LoteDigitacaoMedicaoPluviometricas.DataHoraFinalPreenchimento` |
| 2025-09-04 13:27:00 | `ResumoMedicaoVazoes.DataFinal` |
| 2025-09-02 07:46:58 | `ProcessamentoFormatadoresHangFire.DataProcessamento` |
| 2025-09-01 08:00:00 | `LeituraManualPiezometricas.Data` |
| 2025-08-31 18:00:00 | `CotaEscalaFluviometricas.Data` |
| 2025-08-28 13:00:00 | `LeituraEletronicaPiezometricas.Data` |

A única data acima de outubro de 2025 é a de `MedicaoPluviometricas`, e ela não
contradiz o congelamento: são **31 linhas de um único posto** em dezembro de 2025
(**MEDIDO**), num universo de 27,3 milhões, o que caracteriza data digitada com
ano incorreto e não série ativa. A mesma tabela tem **30 linhas com data futura**
em relação ao relógio do servidor, e a `MedicaoLoggerPluviograficas` tem linha
datada de **2052** (**MEDIDO**), o que confirma que a coluna aceita valor
inválido e não serve, sozinha, como prova de atualidade.

### 2.3 O que isto significa na prática

- **MEDIDO:** nenhuma das oito tabelas de medição tem uma única linha nos últimos
  noventa dias. A contagem é literalmente zero em todas. Detalhe em 6.1.
- **MEDIDO:** todos os números deste documento e do ADR 0023, inclusive os 5.790
  postos ativos, descrevem o estado do cadastro em 3 de outubro de 2025.
- **HIPÓTESE, e é a pergunta a fazer ao órgão:** ou o sistema FCH foi
  descontinuado naquela data, ou ele continua vivo no servidor `ARANDU` e o que
  nos foi disponibilizado é uma cópia para consulta. As duas leituras levam a
  arquiteturas diferentes, e nenhuma delas se decide daqui.

**Consequência para a arquitetura decidida no ADR 0023.** O ADR decidiu leitura ao
vivo, e registra em 10.7 que a ausência de coluna de atualização é irrelevante
"porque não copiamos nada, lemos ao vivo". Essa afirmação continua correta como
desenho, e deixa de ser verdadeira como efeito enquanto a origem for esta
instância: lê-se ao vivo uma fotografia. Isso **não invalida** a decisão, porque
para o cadastro de posto uma fotografia de outubro de 2025 ainda é melhor que a
nossa base atual, pelas razões medidas no próprio ADR. Invalida, sim, qualquer
funcionalidade que dependa de dado recente.

---

## 3. Método e limites

**O que foi feito.** Leitura integral do ADR 0023 e do catálogo
`schema-dbfch-prodesp.md`; leitura do código das telas, rotas, portas,
adaptadores e das 65 migrations do nosso PostgreSQL; e consulta direta a `Dbfch`
para medir o que o catálogo não responde, a saber recência, cobertura, índices,
unidade de valor e desempenho.

**O que não foi feito, e por quê.** Não foi executada nenhuma escrita. Não foram
lidos dados pessoais: a tabela `UsuariosIdentity` foi tratada apenas pelo
catálogo de colunas, sem leitura de linha, em observância à rule `governo` e ao
princípio de minimização do art. 6º, III, da Lei nº 13.709/2018. As amostras
exibidas neste documento são exclusivamente técnicas, a saber prefixo, código,
coordenada e valor de medição.

**Convenção de marcação.** Cada afirmação relevante está marcada como **MEDIDO**,
com a tabela e a coluna de onde saiu, ou como **HIPÓTESE**, quando depende de
confirmação do órgão ou de medição ainda não feita.

**Limite conhecido.** Todas as medições foram feitas contra a instância
`10.20.40.62`, que é a cópia descrita na seção 2. Se existir base viva em
`ARANDU`, os números de recência mudam e os de estrutura provavelmente não.

---

## 4. Classificação por tela

Legenda: **ÓRGÃO** o dado passa a vir de `Dbfch`; **NOSSO** o dado é da nossa
aplicação e permanece no nosso PostgreSQL; **SEM ORIGEM** o dado é exibido hoje e
não terá de onde vir.

### 4.1 Quadro geral

| Tela | Classificação | Resumo |
|---|---|---|
| `/painel` | **MISTA** | Agregações sobre `postos` passam ao órgão; pendências e tendências são nossas. Ver 4.2 |
| `/` (busca) | **MISTA** | Catálogo e facetas do órgão; favoritos e recentes nossos. Ver 4.3 |
| `/postos/[prefixo]` | **MISTA** | Sete seções: cinco do órgão, uma nossa, uma sem origem. Ver 4.4 |
| `/postos/[prefixo]/editar` | **BLOQUEADA** | Escrita em `Postos` é negada. Ver 4.5 |
| `/postos/[prefixo]/fichas/*` (4 telas) | **NOSSO** | `fichas_visita`. Ver 6.2 |
| `/triagem` e `/triagem/[id]` | **NOSSO** | `fichas_triagem`, `triagem_eventos`, `triagem_locks` |
| `/desconformidades/*` (4 telas) | **NOSSO** | `v_postos_desconformes`, `arquivos_orfaos`, `revisoes_desconformidade`, calculadas sobre o catálogo do órgão |
| `/inventario-ana` e `/inventario-ana/[codigo]` | **NOSSO**, com ganho | `ana_revisao_*`. O `PrefixoDNAEE` melhora o cruzamento. Ver 6.4 |
| `/diagramas` e `/diagramas/[id]` | **NOSSO**, com perda parcial | `diagramas`. O modo ao vivo depende do SIBH. Ver 4.7 |
| `/estoque/*` (5 telas) | **NOSSO** | Oito tabelas `estoque_*`, sem contato com o órgão |
| `/favoritos` | **NOSSO** | `postos_favoritos`, hidratado com o catálogo do órgão |
| `/perfil` | **NOSSO** | Não consulta banco. Lê a sessão |
| `/admin/usuarios` | **SEM ORIGEM** para 3 das 5 operações | Ver 6.5 |
| `/monitor` | **SEM ORIGEM** na função principal | Ver 6.1 |
| `/app`, `/app/postos`, `/app/postos/[prefixo]` | **MISTA** | Catálogo do órgão; fichas e recentes nossos |
| `/app/minhas-fichas` e `/app/postos/[prefixo]/fichas/*` | **NOSSO** | `fichas_triagem` |

### 4.2 Painel

| Bloco da tela | Classificação | Origem e junção |
|---|---|---|
| Panorama da rede: total de postos | **ÓRGÃO** | `COUNT(*) FROM Postos WHERE Excluido = 0`. **MEDIDO:** 5.790 |
| Panorama: postos com coordenada | **ÓRGÃO** | `CoordenadaGrausLatitudade IS NOT NULL AND CoordenadaGrausLongitude IS NOT NULL`. **MEDIDO:** 5.784, contra 6 sem coordenada |
| Panorama: postos com telemetria | **ÓRGÃO**, por derivação | `AparelhoPostos` com `Excluido = 0 AND DataDesativacao IS NULL`, junto de `Aparelhos.Designacao IN ('PLUVIOMETRO TELEMETRICO','LIMNIGRAFO TELEMETRICO')`. **MEDIDO:** 67 mais 82, igual a **149 postos** |
| Distribuição por tipo de posto | **ÓRGÃO** | `Postos.TipoMedicoesID` para `TipoMedicoes.Descricao`. Coluna NOT NULL, cobertura de 100% |
| Status operacional | **ÓRGÃO** | `YEAR(Postos.DataExtincao)` comparado ao ano corrente. **MEDIDO:** `DataExtincao` preenchida em 1.376 postos (24%) |
| Ranking de mantenedores e batalhões | **PARCIAL** | O mantenedor vem de `OperadoraEntidadeId` para `Entidades.Nome`, cobertura **MEDIDA** de 1.581 postos (27%). **O campo `btl`, que a tela une ao mantenedor, não existe em `Dbfch`.** A tela perde a metade "batalhões" |
| Ranking de UGRHIs com maior percentual irregular | **MISTA** | UGRHI do órgão, irregularidade nossa (`v_postos_desconformes`) |
| Ações necessárias: postos sem arquivo, órfãos, desconformes | **NOSSO** | `arquivos_indexados`, `arquivos_orfaos`, `v_postos_desconformes` |
| Ações necessárias: postos sem coordenada | **ÓRGÃO** | **MEDIDO:** 6 postos. O indicador praticamente zera |
| Tendências e minigráficos | **SEM ORIGEM** para postos | O cálculo usa `postos.created_at` por dia, e **`Dbfch.dbo.Postos` não tem coluna de criação nem de atualização** (**MEDIDO:** as únicas colunas de data são `DataInstalacao` e `DataExtincao`). A série de tendência do total de postos deixa de existir. As séries de arquivos indexados e órfãos continuam, porque são nossas |
| Tipos de inconsistência | **NOSSO** | `v_postos_desconformes` |
| Chamada para ação do inventário ANA | **NOSSO** | `ana_revisao_lote` e `ana_revisao_estacao` |

### 4.3 Busca de postos e facetas

| Elemento | Classificação | Origem |
|---|---|---|
| Resultado da busca | **ÓRGÃO** | `Postos` com `Excluido = 0` |
| Faceta UGRHI | **ÓRGÃO** | `UGRHIId` para `UGRHIs`, com desdobramento pelo código conforme 10.4 do ADR. **MEDIDO:** 4.070 postos (70,3%) com caminho |
| Faceta município | **ÓRGÃO** | `MunicipioDistritoId` para `MunicipioDistritos.Nome`. **MEDIDO:** 4.157 (72%) |
| Faceta bacia | **ÓRGÃO** | `CursoAguaId` para `CursoAguas.Nome`. **MEDIDO:** 3.547 (61,3%) |
| Faceta tipo | **ÓRGÃO** | `TipoMedicoes.Descricao`. Cobertura de 100% |
| Faceta mantenedor | **PARCIAL** | Ver 4.2. A parte `btl` da união some |
| Distintivos de ficha descritiva e de inspeção no cartão | **NOSSO**, e hoje **SEM ORIGEM** | Ver 4.4 e 6.2 |
| Distintivo de telemetria no cartão | **ÓRGÃO**, por derivação | Passa de texto livre para vínculo com data |
| Estrela de favorito | **NOSSO** | `postos_favoritos` |
| Busca textual | **ÓRGÃO**, com mudança de mecanismo | A coluna gerada `busca_tsv` não pode ser criada em `Dbfch`, porque não temos permissão de DDL (**MEDIDO** no ADR 0023, seção 1.2). A seção 8 do ADR já decidiu o substituto |

### 4.4 Ficha do posto, seção a seção

A tela `postos/[prefixo]/page.tsx` renderiza sete seções e 33 campos.

| Seção | Campo | Classificação | Origem exata |
|---|---|---|---|
| Identificação | `prefixo` | **ÓRGÃO** | `Postos.Prefixo varchar(8)` |
| | `prefixoAna` | **ÓRGÃO**, com ressalva | `Postos.PrefixoDNAEE varchar(8)`. Ver 6.4 |
| | `nomeEstacao` | **ÓRGÃO** | `Postos.Nome varchar(50)` |
| | `tipoPosto` | **ÓRGÃO** | `TipoMedicoesID` para `TipoMedicoes.Descricao` |
| | `rede` | **SEM ORIGEM** | `Grupos` avaliada e rejeitada no ADR 0023, seção 10.6 |
| | `proprietario` | **ÓRGÃO** | `ProprietariaEntidadeId` para `Entidades.Nome`. **MEDIDO:** 99,5% |
| | `mantenedor` | **ÓRGÃO**, cobertura baixa | `OperadoraEntidadeId` para `Entidades.Nome`. **MEDIDO:** 27% |
| Localização | `municipio` | **ÓRGÃO** | `MunicipioDistritoId` para `MunicipioDistritos.Nome`. **MEDIDO:** 72% |
| | `municipioAlt` | **SEM ORIGEM** | Grafia alternativa exclusiva do nosso CSV |
| | `latitude`, `longitude` | **ÓRGÃO**, com conversão | `CoordenadaGrausLatitudade` e `CoordenadaGrausLongitude`, inteiros sexagesimais. Regra em 10.2 do ADR. Sinal negativo obrigatório nos dois |
| | `altimetria` | **ÓRGÃO** | `Postos.Altitude decimal(7,3)`. **MEDIDO:** 73% |
| Bacia e UGRHI | `baciaHidrografica` | **ÓRGÃO** | `CursoAguaId` para `CursoAguas.Nome` |
| | `cobacia` | **SEM ORIGEM** | Código Otto Pfafstetter, inexistente em `Dbfch` |
| | `ugrhiNome`, `ugrhiNumero`, `subUgrhiNome`, `subUgrhiNumero` | **ÓRGÃO**, com conversão | `UGRHIId` para `UGRHIs`. Código menor ou igual a 22 é UGRHI, maior ou igual a 100 é sub UGRHI. O formato do número exige `FLOOR(Codigo/100) || '_' || (Codigo % 100)`, senão os dois lados parecem discordar sendo idênticos |
| | `aquifero` | **ÓRGÃO**, quase vazio | `Postos.UnidadeAquifera`. **MEDIDO:** 101 postos (1,7%) |
| | `areaKm2` | **ÓRGÃO** | `Postos.AreaDrenagem decimal(9,2)`. **MEDIDO:** 18%. Perde uma casa decimal |
| Operação | `operacaoInicioAno` | **ÓRGÃO** | `YEAR(Postos.DataInstalacao)`. **MEDIDO:** 97% |
| | `operacaoFimAno` | **ÓRGÃO** | `YEAR(Postos.DataExtincao)`. **MEDIDO:** 24% |
| | `statusPcd`, `tempoTransmissao`, `ultimaTransmissao` | **SEM ORIGEM** | `Dbfch` guarda o equipamento, não o estado da transmissão. Ver 6.1.4 |
| Equipamentos | `convencional` | **ÓRGÃO**, por derivação | `PLUVIOMETRO` 2.331 e `PLUVIOGRAFO` 129 (**MEDIDO**, só aparelho ativo) |
| | `loggerEqp` | **ÓRGÃO**, por derivação | Três designações "COM GRAVACAO LOCAL". **MEDIDO:** 188 mais 106 mais 86 |
| | `telemetrico` | **ÓRGÃO**, por derivação | **MEDIDO:** 67 mais 82, igual a 149 |
| | `nivel` | **ÓRGÃO**, por derivação | `ESCALA LIMNIMETRICA` 577 e `LIMNIGRAFO` 148 (**MEDIDO**) |
| | `vazao` | **ÓRGÃO**, por derivação, e é ganho | `MEDICAO DE VAZAO- MOLINETE HIDRAULICO` 267 e `CURVA-CHAVE` 264 (**MEDIDO**). A nossa coluna está vazia em 100% dos 2.483 postos |
| | `btl`, `ciaAmbiental` | **SEM ORIGEM** | Nenhuma coluna correspondente nas 157 tabelas |
| Fichas associadas | `fichaInspecao`, `ultimaDataFi`, `fichaDescritiva`, `ultimaAtualizacaoFd` | **NOSSO** | São indicadores de acervo documental, e a indexação é nossa. Hoje vêm do CSV; passam a poder ser derivados de `arquivos_indexados` e `fichas_visita`. Ver 6.2 |
| Observações | `observacoes` | **SEM ORIGEM** | `Historicos` avaliada e rejeitada no ADR 0023, seção 10.6, por ser histórico datado e não atributo de cadastro |
| Blocos auxiliares | Fotos do posto | **NOSSO** | `postos_fotos` mais armazenamento de objeto |
| | Histórico de visitas | **NOSSO** | `fichas_visita` |
| | Acervo histórico de arquivos | **NOSSO** | `arquivos_indexados` |
| | Distintivo de indexação | **NOSSO** | `indexacao_log` |

**Resolução da pendência 12.4 do ADR 0023.** O ADR pedia medir quanto a exigência
de `DataDesativacao IS NULL` derruba a cobertura de instrumentação, e registrava
os números anteriores como teto, não como cobertura. **MEDIDO agora:** 5.478
postos têm algum vínculo em `AparelhoPostos`, e **3.389 têm ao menos um aparelho
ativo**, ou seja, a exigência derruba 38%. A tabela de designações ativas acima já
é a cobertura real, e substitui o teto.

### 4.5 Editar posto

**Classificação: BLOQUEADA.**

**MEDIDO** no ADR 0023, seção 1.2:
`HAS_PERMS_BY_NAME('Dbfch.dbo.Postos','OBJECT','INSERT') = 0`, e o login não
pertence a nenhum papel de banco em `Dbfch`.

A tela oferece hoje 47 campos editáveis. Com o cadastro passando a residir no
órgão, os campos que vêm de `Postos` deixam de ser graváveis. Três caminhos, e a
escolha não é técnica:

1. Manter a tela apenas para os campos que continuam nossos, e exibir os do órgão
   como somente leitura, com a origem declarada na própria tela.
2. Aguardar a API de escrita que o proprietário avalia com o órgão (item 11.2 do
   ADR 0023).
3. Manter uma camada de correção nossa, no modelo já usado pelo inventário ANA,
   em que a correção fica isolada até ser promovida. É a única que funciona hoje
   sem depender de terceiro, e reaproveita padrão que já existe no projeto.

A rota `POST /api/postos`, de cadastro de posto novo, fica na mesma condição.

### 4.6 Telas integralmente nossas

Não têm nem devem ter equivalente em `Dbfch`. Nenhuma delas é afetada pela
migração, e nenhum dos 19 adaptadores correspondentes muda uma linha, o que
confirma a medição de escopo da seção 2.1 do ADR 0023.

| Tela | Tabelas nossas |
|---|---|
| Fichas, 4 telas | `fichas_visita`, `tipos_documento` |
| Triagem, 2 telas | `fichas_triagem`, `triagem_eventos`, `triagem_locks` |
| Desconformidades, 4 telas | `v_postos_desconformes`, `arquivos_orfaos`, `revisoes_desconformidade` |
| Inventário ANA, 2 telas | `ana_revisao_lote`, `ana_revisao_estacao`, `ana_revisao_evento`, `v_ana_revisao_pendencias`, `ibge_municipios_sp` |
| Estoque, 5 telas | `estoque_locais`, `estoque_categorias`, `estoque_materiais`, `estoque_unidades`, `estoque_saldos`, `estoque_movimentacoes`, `estoque_conferencias`, `estoque_conferencia_itens` |
| Favoritos | `postos_favoritos` |
| Diagramas, 2 telas | `diagramas` |
| Aplicativo de campo, 4 telas | `fichas_triagem`, `postos_fotos`, `acesso_ficha` |
| Perfil | Nenhuma. Lê a sessão |

### 4.7 Diagramas, e a perda parcial

O desenho e os elementos são nossos, na tabela `diagramas`, e não mudam. O que
muda é o **modo ao vivo**, que consulta `sibhGateway.valorAtualPorPrefixo` para
mostrar a leitura mais recente de cada elemento vinculado a uma estação.

**Classificação: o desenho é NOSSO; o modo ao vivo fica SEM ORIGEM**, pela mesma
razão do Monitor, tratada em 6.1. O vínculo entre elemento e posto continua
funcionando, porque usa `postosRepository.autocompletar`, que passa a ler
`Dbfch`.

---

## 5. Classificação por rota de API

### 5.1 Quadro

| Rota | Classificação | Origem após a mudança |
|---|---|---|
| `GET /api/postos`, `/api/postos/buscar`, `/api/postos/search` | **ÓRGÃO** | `Postos` com `Excluido = 0`, mais as junções de 4.4 |
| `POST /api/postos` | **BLOQUEADA** | Escrita negada. Ver 4.5 |
| `GET /api/postos/[prefixo]` | **MISTA** | Cadastro do órgão; a indexação preguiçosa e a trilha `acesso_ficha` continuam nossas |
| `PATCH /api/postos/[prefixo]` | **BLOQUEADA** | Ver 4.5 |
| `GET /api/postos/facetas` | **ÓRGÃO** | Cinco agregações sobre `Postos` e as tabelas de vocabulário |
| `GET /api/postos/[prefixo]/arquivos` | **NOSSO** | `arquivos_indexados` |
| `GET` e `POST /api/postos/[prefixo]/fichas` | **NOSSO** | `fichas_visita` |
| `POST /api/postos/[prefixo]/reindexar` | **NOSSO** | `arquivos_indexados`, `indexacao_log` |
| `GET /api/postos/[prefixo]/relatorio` | **MISTA** | Cadastro do órgão, acervo nosso |
| `GET /api/monitor/estacoes` | **SEM ORIGEM** na forma atual | Ver 6.1 |
| `GET /api/monitor/estacoes/[id]/leituras` | **SEM ORIGEM** para dado recente | Ver 6.1 |
| `GET /api/monitor/estacoes/[id]/nivel` | **SEM ORIGEM** | Ver 6.1 e 6.1.5 |
| `POST /api/monitor/sync` | **DEIXA DE FUNCIONAR** | Depende de `apps.spaguas.sp.gov.br`, inalcançável do servidor de aplicação |
| `GET /api/sibh/estacoes`, `/medicoes`, `/valor` | **DEIXA DE FUNCIONAR** | Mesma razão |
| `POST /api/cron/sincronizar-monitor` | **DEIXA DE FUNCIONAR** | Mesma razão |
| `POST /api/cron/anonimizar-trilha` | **NOSSO** | `acesso_ficha`. Obrigação de LGPD, permanece integralmente |
| `POST /api/cron/liberar-locks-expirados` | **NOSSO** | `triagem_locks` |
| `POST /api/desconformidades/revisoes` | **NOSSO** | `revisoes_desconformidade` |
| `GET` e `POST /api/favoritos`, `/api/favoritos/[prefixo]` | **NOSSO** | `postos_favoritos` |
| `GET /api/inventario-ana` e derivadas | **NOSSO** | `ana_revisao_*`. Ver 6.4 |
| `POST /api/inventario-ana/[codigo]/aceitar-match` | **BLOQUEADA pela metade** | A operação grava em `postos.prefixo_ana`, o que passa a ser escrita em base de terceiro. Ver 6.4 |
| `GET /api/admin/usuarios` | **PARCIAL** | Ver 6.5 |
| `POST`, `PATCH` de senha, `DELETE /api/admin/usuarios` | **SEM ORIGEM** | Ver 6.5 |
| `PATCH /api/admin/usuarios/[id]` para papel | **NOSSO** | `usuarios_papeis`. Ver 6.5 |
| `POST /api/app/fichas` | **NOSSO** | `fichas_triagem` |
| Rotas de `/api/triagem/*`, `/api/estoque/*`, `/api/diagramas/*`, `/api/fichas/[id]` | **NOSSO** | Sem contato com o órgão |
| `GET /api/health` | **NOSSO**, com acréscimo recomendado | Passa a precisar checar também a disponibilidade do SQL Server, senão a indisponibilidade do órgão aparece como erro genérico de tela |

### 5.2 Uma regra de código que a migração torna obrigatória

**MEDIDO:** `Dbfch.dbo.Postos` tem 13 registros com `Excluido = 1`. Toda leitura
precisa filtrar `Excluido = 0`. A omissão não produz erro: produz 13 postos
inexistentes na tela. O mesmo vale para todas as tabelas de apoio, que também têm
a coluna. Recomenda-se guarda automatizada sobre os adaptadores, como já apontado
em 10.5 do ADR 0023.

---

## 6. Os cinco pontos de atenção, medidos

### 6.1 O Monitor. Pode passar a ler do banco em vez do SIBH?

**Resposta: não, e a razão não é de estrutura, é de conteúdo.**

Esta era a pergunta mais valiosa do trabalho, porque uma resposta positiva
eliminaria a dependência de `apps.spaguas.sp.gov.br`, que o servidor de aplicação
não alcança. A estrutura das tabelas serve. O conteúdo não existe.

#### 6.1.1 O que a tela precisa

Do código das rotas e das migrations 0045, 0046, 0051, 0052 e 0053:

| Necessidade | Campos |
|---|---|
| Lista de estações para o mapa | `id`, `prefixo`, `nome`, `lat`, `lng`, `tipo` (manual ou automático), `tipo_estacao` (pluviométrico, fluviométrico, piezométrico), `bacia`, `owner`, `posto_id`, `sibh_id`, `online`, `ultima_transmissao` |
| Série de chuva por estação e período | Por dia: `manual_mm` e `automatico_mm` |
| Série de nível por estação e período | Por dia: média, mínimo e máximo, em metros |

#### 6.1.2 O que `Dbfch` oferece, campo a campo

| Campo da tela | Origem candidata em `Dbfch` | Viável? |
|---|---|---|
| `prefixo`, `nome`, `lat`, `lng` | `Postos`, com a conversão sexagesimal de 10.2 do ADR | **Sim** |
| `tipo_estacao` | `TipoMedicoes.Descricao` | **Sim.** Cobertura de 100% |
| `bacia` | `UGRHIId` para `UGRHIs.Descricao` | **Sim**, 70,3% |
| `owner` | `OperadoraEntidadeId` para `Entidades.Sigla` | **Sim**, 27% |
| `tipo` manual ou automático | Derivável de `AparelhoPostos`: designação com gravação local ou telemétrica implica automático | **Sim**, por derivação. **HIPÓTESE** a validar com o órgão |
| `sibh_id` | Não existe | **Não.** É identificador de outro sistema. A chave passaria a ser `Postos.Id` |
| `ultima_transmissao` | `MAX(Data)` das tabelas de logger por posto | **Estruturalmente sim.** Ver 6.1.4 |
| `online` | Derivável de `ultima_transmissao` dentro de uma janela | **Estruturalmente sim**, e melhor que hoje, porque mediria o dado em vez de confiar numa marcação recebida |
| `manual_mm` | `MedicaoPluviometricas.Medicao decimal(6,1)`, granularidade diária | **Estruturalmente sim.** Casa direto |
| `automatico_mm` | `MedicaoLoggerPluviograficas.Medicao decimal(6,1)`, subdiária, exige soma por dia | **Estruturalmente sim** |
| Série de nível | `CotaEscalaFluviometricas.Valor int` e `MedicaoLoggerFluviograficas.Valor int` | **Com ressalva grave de unidade.** Ver 6.1.5 |

**A granularidade confere.** **MEDIDO** numa amostra de
`MedicaoLoggerPluviograficas`: pontos em `2025-08-20 13:10`, `13:20`, `13:30`,
`13:40`, `14:20` e `14:30`, com valores de 0,2 a 1,4 mm. É registro por báscula, e
a soma por dia produz o acumulado que a tela espera. `MedicaoPluviometricas` traz
um ponto por dia às 00:00, que é a leitura convencional do observador. Ou seja,
os dois canais que hoje ocupam a mesma linha em `leituras_pluviometricas` têm, no
banco do órgão, origens separadas e auditáveis, o que é melhor do que temos.

#### 6.1.3 O conteúdo, e é aqui que a resposta vira não

**MEDIDO** em 27/08/2026, com `GETDATE()` do servidor em `2026-08-27 11:52`:

| Tabela | Linhas ativas | Data máxima não futura | Últimos 30 dias | Últimos 90 dias | Últimos 365 dias |
|---|---|---|---|---|---|
| `MedicaoPluviometricas` | 27.279.281 | 2025-12-31 | **0** | **0** | 267 |
| `MedicaoPluviograficas` | 7.231.428 | **2014-01-25** | **0** | **0** | **0** |
| `MedicaoLoggerPluviograficas` | 1.947.839 | 2025-08-21 | **0** | **0** | **0** |
| `CotaEscalaFluviometricas` | 10.986.575 | 2025-08-31 | **0** | **0** | 288 |
| `MedicaoLoggerFluviograficas` | 17.492.068 | 2025-08-08 | **0** | **0** | **0** |
| `CotaLimnigramaFluviograficas` | 328.126 | **2020-12-31** | **0** | **0** | **0** |
| `LeituraEletronicaPiezometricas` | 2.202.054 | 2025-08-28 | **0** | **0** | 80 |
| `LeituraManualPiezometricas` | 130.998 | 2025-09-01 | **0** | **0** | 6 |

**Nenhuma das oito tabelas tem uma única linha nos últimos noventa dias.** O
Monitor mostra, por padrão, os últimos trinta dias. Apontá-lo para `Dbfch`
produziria oito gráficos vazios.

**A rede também estava encolhendo antes de parar. MEDIDO**, postos distintos com
medição pluviométrica por mês:

| Mês | Linhas | Postos |
|---|---|---|
| 2024-08 | 13.299 | 429 |
| 2024-12 | 12.493 | 403 |
| 2025-03 | 9.703 | 313 |
| 2025-06 | 5.460 | 182 |
| 2025-07 | 4.495 | 145 |
| 2025-08 | 1.829 | **59** |

O canal automático é ainda menor: **MEDIDO**, 3 postos com registro em agosto de
2025, 21 em abril de 2025, e **140 postos em toda a série histórica**. Para
comparação, a base atual do Monitor tem **3.690 estações** vindas do SIBH
(registrado no cabeçalho da migration 0052). A diferença de universo é de mais de
uma ordem de grandeza, e ela existiria mesmo que a base estivesse atualizada,
porque o SIBH agrega estações de várias entidades e `Dbfch` guarda a rede do
próprio DAEE.

#### 6.1.4 O que seria possível se a base estivesse viva

Registro isto porque a estrutura é boa e o achado deve sobreviver ao problema de
conteúdo. Se a origem passar a ser a base viva de `ARANDU`, ou outra que o órgão
indique:

- `ultima_transmissao` deixaria de ser uma marcação recebida de terceiro e
  passaria a ser `MAX(Data)` da tabela de logger, ou seja, **medida a partir do
  próprio dado**. Isso corrige um defeito conceitual do desenho atual, em que uma
  estação pode ser marcada como transmitindo sem ter dado nenhum.
- `manual_mm` e `automatico_mm` ganham origens distintas, conforme 6.1.2.
- A dependência de rede externa desapareceria, que é exatamente o problema que
  hoje impede o Monitor de funcionar no servidor de aplicação.

**Ressalva de desempenho, MEDIDA.** Todos os índices dessas tabelas são sobre
`PostoId` sozinho, nunca sobre `(PostoId, Data)`. A consulta de trinta dias de um
posto em `MedicaoPluviometricas` levou **0,913 s**, incluindo ida e volta de rede,
porque o servidor precisa ler todas as linhas daquele posto e filtrar depois. Com
5.790 postos e 27,3 milhões de linhas isso é tolerável para uma tela de detalhe e
**não é tolerável** para uma tela que carregue várias séries de uma vez. Como não
temos permissão de criar índice (**MEDIDO**), a mitigação teria de ser da nossa
camada: limitar a janela, buscar em lote e cachear. Pedir ao órgão a criação de
índice composto por `(PostoId, Data)` é a solução correta, e depende deles.

#### 6.1.5 A conversão de cota que não tem referência

**MEDIDO:** `CotaEscalaFluviometricas.Valor` é `int`, com mínimo -155, máximo
19.620 e média 3.569,7. `MedicaoLoggerFluviograficas.Valor` é `int`, com mínimo
-5, máximo 98.500 e média 95,4. As cinco leituras mais recentes da escala são 36,
29, 47, 154 e 186.

A leitura provável é centímetro (**HIPÓTESE**), mas as duas tabelas têm ordens de
grandeza incompatíveis entre si, o que impede afirmar sem confirmação do órgão. E
há um obstáculo estrutural além da unidade: converter cota lida em nível exige o
zero da régua, que mora em `ZeroEscalas`, e **`ZeroEscalas` tem 0 linhas**
(**MEDIDO**). Ou seja, mesmo com dado recente, a série de nível em metros que a
tela exibe hoje não poderia ser reproduzida sem que o órgão informe o zero de
escala de cada posto.

#### 6.1.6 Recomendação sobre o Monitor

1. **Não apontar o Monitor para `Dbfch` como está.** O resultado seria uma tela
   correta exibindo o vazio, o que é pior que uma tela indisponível, porque
   parece informação.
2. **Levar a pergunta ao órgão nestes termos:** existe base viva do FCH, e ela é
   alcançável a partir de `10.199.43.27`? Se sim, o Monitor tem caminho, e ele é
   melhor que o atual.
3. **Enquanto isso não se resolve, decidir o destino da tela.** As opções são
   desligá-la, ou mantê-la exibindo série histórica com a data de corte declarada
   em tela. A segunda só é aceitável se a tela disser, de forma inequívoca, que os
   dados vão até outubro de 2025. Gráfico de chuva sem data de corte visível num
   painel de órgão público é risco de decisão errada.
4. **A questão do SIBH continua de pé e é independente disto.** O item 11.9 do
   ADR 0023 pergunta se `apps.spaguas.sp.gov.br` é alcançável do servidor de
   aplicação. Se for, o Monitor não precisa de `Dbfch` para nada.

### 6.2 Fichas descritivas e de inspeção. Há sobreposição real?

**Resposta: não. Os nomes se parecem e as coisas são diferentes.**

O nosso sistema tem sete tipos de ficha, todos na tabela `fichas_visita`, com o
conteúdo específico em `dados JSONB`: Ficha Descritiva, PCD, Inspeção,
Nivelamento, Levantamento de Seção, Troca de Observador e Vazão. São **registros
de visita de campo**, com técnico, data, hora, coordenada capturada e fluxo de
aprovação (rascunho, enviada, aprovada).

O que existe em `Dbfch` com nome parecido:

| Tabela do órgão | O que é, MEDIDO | Sobrepõe? |
|---|---|---|
| `CabecalhoLoteDigitacaoMedicaoPluviometricas` | 5.298 linhas ativas, 449 postos, `MesAno` de 2023-10 a 2025-07. Cabeçalho de **lote de digitação** de boletins pluviométricos: posto, mês, sequência, conferido | **Não.** É controle de digitação de medição, não visita a campo |
| `LoteDigitacaoMedicaoPluviometricas` | 434 lotes, com `UsuarioDigitador`, `QuantidadeDocumentos`, `Rascunho` e `Liberado` | **Não.** É gestão de trabalho de escritório |
| `ValoresLoteDigitacaoMedicaoPluviometricas` | 181.758 valores diários digitados | **Não.** É o dado digitado, que alimenta `MedicaoPluviometricas` |
| `ConferenciaLoteDigitacaoPluviometricas` | 301 conferências, com usuário, início, fim e contagens | **Não.** É dupla digitação, controle de qualidade de transcrição |
| `Relatorios` | 141 linhas. **MEDIDO**, amostra: `CONSIST.HIDROLOGICA - FL. DE CAMPO`, `CONSIST.HIDROLOGICA - FL. COMPL. I`, `BOLETIM PROVISORIO MENSAL`, com `NomeRotina varchar(8)` e `CodigoProcAssociada` | **Não.** É o **catálogo de rotinas de relatório do mainframe**, com nome de procedimento e item de faturamento. Não guarda conteúdo de ficha nenhuma |
| `Historicos` | 230 linhas, 99 postos, `Data` e `Descricao varchar(2000)`, máximo em 2024-05-28 | **Não**, e já havia sido rejeitada no ADR 0023, seção 10.6. É histórico datado de evento por posto |

**Conclusão.** Nenhuma ficha do nosso sistema tem correspondente em `Dbfch`. As
fichas **continuam nossas**, integralmente, e o fluxo de triagem também. A
semelhança de nome em `CONSIST.HIDROLOGICA - FL. DE CAMPO` é o caso clássico de
coisa diferente com nome parecido, e mapear uma na outra seria erro.

**Consequência sobre os quatro campos de ficha da ficha do posto.** Os campos
`fichaInspecao`, `ultimaDataFi`, `fichaDescritiva` e `ultimaAtualizacaoFd` vêm
hoje do CSV como texto livre. Como o órgão não os tem, e como nós temos
`fichas_visita` e `arquivos_indexados`, a recomendação é **derivá-los do nosso
próprio acervo**, o que os torna verdadeiros pela primeira vez em vez de
importados de uma planilha que envelhece. É trabalho novo, e é pequeno.

### 6.3 Curva-chave, seções transversais e vazão. Oportunidade, não lacuna

**MEDIDO:** nenhuma dessas tabelas tem correspondente no nosso schema, e uma
varredura no nosso código não encontra referência a curva-chave, seção
transversal ou resumo de medição de vazão em lugar nenhum. **O sistema não usa
nada disso hoje.**

Portanto isto é **dado novo disponível**, e vale listar separado do resto:

| Tabela | Linhas ativas | Postos distintos | O que é |
|---|---|---|---|
| `CurvaChaveFluviometricas` | 2.737 | **375** | Curva-chave por posto, com `DataInicio`, `DataFinal`, `IndiceQualidade` e `Consistencia` |
| `EquacoesCurvaChaveFluviometricas` | 6.667 | por curva | Coeficientes K, H, N e I. Converte cota em vazão |
| `SecoesTransversais` | 1.170 | **234** | Levantamento batimétrico, com `DataLevantamento` e `ValorNivelAgua` |
| `SecoesTransversaisValores` | 117.000 | por seção | Pontos da seção: cota de batimetria, distância simples, distância acumulada e posição ordinal |
| `ResumoMedicaoVazoes` | 70.157 | **519** | Medição de vazão: cota inicial e final, vazão líquida, área, largura, profundidade média, velocidade média, raio hidráulico, molinete e hélice |
| `ZeroEscalas` | **0** | 0 | Zero de régua. **Vazia** |

**Valor para o produto.** Isto é exatamente o insumo que faltava para a observação
registrada durante o desenho do painel municipal, de que **vazão não se exibe sem
curva-chave**. Com `EquacoesCurvaChaveFluviometricas` e
`CotaEscalaFluviometricas` o sistema passa a poder calcular vazão a partir de
cota para 375 postos, coisa hoje impossível.

**Ressalvas, e são duas.** Primeira, **MEDIDO: zero postos têm curva-chave
vigente hoje**, porque a `DataFinal` máxima é 2025-08-31, coerente com o
congelamento da seção 2. Segunda, `ZeroEscalas` está vazia, como já apontado em
6.1.5.

**Recomendação:** tratar como oportunidade de escopo futuro, a ser proposta ao
órgão, e não como parte da migração. Não entra agora.

### 6.4 Inventário ANA. `prefixo_ana` e `PrefixoDNAEE` são o mesmo código?

**Resposta: parcialmente, e o dado do órgão melhora o nosso cruzamento sem
substituir o módulo.**

**Contexto do nosso lado.** `postos.prefixo_ana VARCHAR(64)` é o código ANA de
oito dígitos. A regra de conformidade está na view `v_postos_desconformes`: casar
`^[0-9]{8}$` é conforme, casar `^[0-9]{7}$` é `faltando_zero_esquerda`. O
cruzamento do lote ANA é feito por `p.prefixo_ana = e.codigo_ana`, com recurso
secundário a `p.prefixo = e.codigo_adicional`.

**O que `Postos.PrefixoDNAEE` traz, MEDIDO** sobre os 5.790 postos ativos:

| Fato | Valor |
|---|---|
| Postos com `PrefixoDNAEE` preenchido | **4.697 (81,1%)** |
| Deles, no formato ANA exato, oito dígitos numéricos | **4.498 (77,7% do total)** |
| Com sete dígitos numéricos, ou seja o defeito que a nossa tela corrige | **0** |
| Com caractere não numérico | **199** |
| `PrefixoDNAEE` idêntico ao `Prefixo` do posto | **2.001** |
| `PrefixoDNAEE` diferente do `Prefixo` | **2.696** |

**Amostra técnica dos casos que divergem, MEDIDA:** `D4-030` para `02247005`,
`83725` para `02248035`, `TISR001F` para `62550000`, `3D-004` para `61884002`.
**Amostra dos não numéricos:** `C8-L036` para `130-036`, `D6-N005` para
`267-005`, `B5-J021` para `058-021`.

**Interpretação.** O DNAEE é o antecessor institucional da ANA, e o formato de
oito dígitos dos 4.498 casos é o formato do código ANA. A equivalência é
**HIPÓTESE forte**, e ela se prova de forma barata e definitiva: cruzar os 4.498
valores contra os códigos ANA que já temos em `ana_revisao_estacao`. Se a taxa de
casamento for alta, está provado. **Essa medição não foi feita porque exige acesso
simultâneo aos dois bancos, e fica registrada como pendência em 8.2.**

Os 199 valores não numéricos, no formato `130-036`, **não são código ANA** e
parecem codificação antiga por folha cartográfica (**HIPÓTESE**). Não devem
alimentar `prefixo_ana`.

**Ganho concreto.** A nossa base tem `prefixo_ana` para uma fração dos 2.483
postos; o órgão oferece **4.498 códigos no formato correto sobre um universo de
5.790**. Isso aumenta a taxa de cruzamento automático do lote ANA e reduz o
trabalho manual de revisão, que é justamente o que a tela `/inventario-ana` existe
para gerenciar.

**Ponto de bloqueio, e ele é importante.** A ação "aceitar o match sugerido"
executa hoje, numa única transação, `UPDATE postos SET prefixo_ana = ...` mais o
registro do evento. **Com o cadastro no órgão, essa escrita é negada.** O
inventário ANA passa a ser um trabalho de revisão que **não tem onde gravar o
resultado**. As opções são as mesmas de 4.5, e a terceira delas, a camada de
correção nossa, é particularmente adequada aqui, porque `ana_revisao_estacao` já
nasceu com esse princípio declarado na própria migration 0029: estações ANA nunca
alteram `postos` direto.

### 6.5 Administração de usuários. O que a tela consegue e o que ela perde

**Classificação: PERDA MAJORITÁRIA. Das cinco operações, duas sobrevivem, e uma
delas sobrevive porque nunca dependeu do órgão.**

**O que a tela faz hoje**, medido no código:

| Operação | Efeito atual |
|---|---|
| Listar | `SELECT` na base de identidade atual, com junção em `usuarios_papeis` |
| Criar usuário | Criação de conta com e-mail já confirmado, mais inserção do papel, com compensação que apaga a conta se a inserção do papel falhar |
| Alterar papel | Apenas no nosso PostgreSQL, em `usuarios_papeis` |
| Redefinir senha | Troca direta da senha na base de identidade |
| Remover usuário | Exclusão definitiva, com o papel caindo por cascata |

Não existe desativação. A remoção é definitiva, e a tela avisa que não é possível
desfazer.

**O que `UsuariosIdentity` oferece, e o que ela impede.** É a tabela de identidade
do ASP.NET Identity do órgão, com 29 usuários e 23 colunas, entre elas
`SenhaHash`, `SecurityStamp`, `CPF`, `Email`, `NomeCompleto`,
`AutenticacaoEmDoisFatores`, `LockoutEnabled` e `QuantidadeFalhasLogin`. Há ainda
`PerfisIdentity` com 2 perfis e `UsuariosPermissoesIdentity` com 1.007 permissões.
**MEDIDO:** `PerfisPermissoesIdentity`, `UsuariosLoginIdentity` e
`UsuarioTokensIdentity` estão vazias.

Resultado operação a operação:

| Operação | Após a mudança | Razão |
|---|---|---|
| **Listar** | **FUNCIONA**, lendo `UsuariosIdentity` com `Excluido = 0` | Única leitura que muda de origem e sobrevive |
| **Criar usuário** | **SEM ORIGEM** | Escrita negada. Um usuário novo do órgão passa a ser criado pelo sistema do órgão, não pelo nosso |
| **Alterar papel** | **FUNCIONA, e continua nosso** | O papel do nosso sistema (`super_admin`, `admin`, `user`) é conceito nosso, mora em `usuarios_papeis` e não tem equivalente nos dois perfis deles. **Recomenda-se manter** |
| **Redefinir senha** | **SEM ORIGEM** | `SenhaHash` é deles e é somente leitura |
| **Remover usuário** | **SEM ORIGEM** | `Excluido` é deles |

**Um detalhe de segurança que precisa ser dito com todas as letras.** `Dbfch`
guarda `QuantidadeFalhasLogin`, `LockoutEnd` e `LockoutEnabled`, que são o
mecanismo de bloqueio por tentativa. Como não escrevemos, **um ataque de força
bruta conduzido pela nossa tela de entrada não incrementaria o contador do órgão
e não dispararia o bloqueio dele**. Se a autenticação passar a validar contra
`SenhaHash`, a proteção contra tentativa repetida tem de ser inteiramente nossa,
por limite de requisição combinando endereço e conta, porque limite só por
endereço não protege a conta atacada. Isto reforça o que a seção 4.3 do ADR 0023
já registrava, e deve ser tratado pelo PO de Segurança antes de qualquer
implementação de autenticação, e não depois dela.

**LGPD.** `UsuariosIdentity.CPF` é dado pessoal. Ler CPF exige finalidade
declarada, e a finalidade "exibir a lista de usuários numa tela administrativa"
não a justifica. **Recomendação: não selecionar a coluna `CPF` em consulta
nenhuma**, e restringir a projeção a `Id`, `NomeCompleto`, `Email` e o vínculo de
perfil. É o princípio da minimização do art. 6º, III, da Lei nº 13.709/2018, e
vale registrar a decisão no documento de entrega, conforme a rule `governo`.

**Recomendação sobre a tela.** Renomear a função de "gestão de usuários" para
"usuários e papéis": ela deixa de administrar contas e passa a administrar o que é
nosso, que é o papel de cada pessoa dentro deste sistema. As três ações que somem
devem sair da interface, e não ficar visíveis retornando erro.

---

## 7. O que quebra na tela: a lista consolidada

Esta é a lista que a seção 1 aponta como o achado mais importante para o
planejamento. São os campos e funções que o sistema exibe hoje e que, sem a base
atual e sem o SIBH, não terão de onde vir.

### 7.1 Campos de posto sem origem, nove campos

| Campo | Onde aparece | Avaliação |
|---|---|---|
| `rede` | Ficha do posto, Identificação | `Grupos` avaliada e rejeitada (ADR 0023, 10.6): são grupos de trabalho ad hoc, não taxonomia de domínio |
| `municipio_alt` | Ficha do posto, Localização | Grafia alternativa exclusiva do nosso CSV |
| `cobacia` | Ficha do posto, Bacia | Código Otto Pfafstetter, ausente nas 157 tabelas |
| `btl` | Ficha do posto, e **ranking do painel** | Ausente. O painel perde a metade "batalhões" da união |
| `cia_ambiental` | Ficha do posto, Equipamentos | Ausente |
| `observacoes` | Ficha do posto, Observações | `Historicos` avaliada e rejeitada (ADR 0023, 10.6) |
| `status_pcd` | Ficha do posto, Operação | O estado da transmissão não existe. Só o equipamento |
| `tempo_transmissao` | Ficha do posto, Operação | Idem |
| `ultima_transmissao` | Ficha do posto e Monitor | Idem. Ver 6.1.4 para o substituto possível |

### 7.2 Funções que perdem a origem

| Função | Consequência |
|---|---|
| **Monitor, série recente** | Sem SIBH e com `Dbfch` congelado, a tela mostra vazio. Ver 6.1 |
| **Diagramas, modo ao vivo** | Mesma razão. O desenho continua funcionando |
| **Sincronização do Monitor e rotas `/api/sibh/*`** | O servidor de aplicação não alcança `apps.spaguas.sp.gov.br` |
| **Criar usuário, remover usuário e redefinir senha** | Ver 6.5 |
| **Editar e cadastrar posto** | Ver 4.5 |
| **Aceitar match do inventário ANA** | Ver 6.4 |
| **Tendência do total de postos no painel** | `Postos` não tem coluna de criação. Ver 4.2 |
| **Busca textual por coluna gerada** | Sem permissão de DDL. Substituto já decidido na seção 8 do ADR 0023 |

### 7.3 Uma observação de produto

Sete dos nove campos de 7.1 são texto livre vindo de planilha, e dois deles nunca
tiveram valor em posto nenhum. A leitura fácil é que a migração empobrece a ficha.
A leitura correta é outra: **a ficha perde nove campos de qualidade duvidosa e
ganha cinco campos de instrumentação com vínculo datado, mais o universo de postos
dobrado**, de 2.483 para 5.790, mais a coordenada correta, que hoje está deslocada
10 km na mediana. O saldo é positivo, e ele deve ser apresentado ao órgão com os
dois lados, e não apenas com o lado bom.

---

## 8. Pendências

### 8.1 Perguntas ao órgão, em ordem de urgência

1. **A instância `10.20.40.62` hospeda uma cópia restaurada de `Dbfch`, tomada em
   03/10/2025 do servidor `ARANDU`. Existe base viva, e ela é alcançável a partir
   de `10.199.43.27`?** Sem essa resposta, o sistema opera sobre uma fotografia, e
   o Monitor não tem caminho.
2. **O sistema FCH foi descontinuado em outubro de 2025, ou apenas a cópia que
   recebemos parou ali?** A resposta muda o desenho da camada de leitura.
3. **Haverá API de escrita?** Já registrada em 11.2 do ADR 0023. Sem ela, quatro
   funções do sistema passam a somente leitura.
4. **É possível criar índice composto por `(PostoId, Data)` nas tabelas de
   medição?** Hoje todos os índices são só por `PostoId` (**MEDIDO**), o que torna
   a consulta por período mais cara do que precisaria ser.
5. **Qual é a unidade de `CotaEscalaFluviometricas.Valor` e de
   `MedicaoLoggerFluviograficas.Valor`, e onde está o zero de escala, já que
   `ZeroEscalas` está vazia?**
6. **A regra de derivação de instrumentação a partir de `Aparelhos.Designacao`
   está correta?** Já registrada em 11.8 do ADR 0023, e agora com os números de
   aparelho ativo medidos, o que torna a validação mais fácil de conduzir.
7. **`PrefixoDNAEE` é o código ANA?** Ver 6.4 e a pendência correspondente em 8.2.

### 8.2 Medições que faltaram, e por quê

| Pendência | Como medir | Por que não foi feita |
|---|---|---|
| Casamento de `PrefixoDNAEE` contra os códigos ANA do lote | Cruzar os 4.498 valores de oito dígitos contra `ana_revisao_estacao.codigo_ana` | Exige leitura simultânea dos dois bancos. O nosso PostgreSQL não estava disponível nesta sessão |
| Perda individual de instrumentação, posto a posto | Comparar os 2.413 postos que cruzam, campo a campo | Mesma razão. É a ressalva B de 10.6 do ADR 0023, e continua aberta |
| Confirmação de que a ausência de dado recente não decorre de filtro nosso | Repetir as contagens sem `Excluido = 0` | Considerada dispensável: a varredura das 62 colunas de data em 2.2 não filtra por `Excluido` e chega ao mesmo resultado |
| Verificação em base viva | Repetir toda a seção 6.1 contra `ARANDU` | Depende da resposta da pergunta 1 de 8.1 |

### 8.3 O que este documento não decide

Não decide o destino do Monitor, não decide se a edição de posto vira somente
leitura ou ganha camada de correção, e não decide se a tela de usuários é
renomeada. As três são decisões do proprietário, com insumo do órgão, e as opções
estão descritas em 6.1.6, 4.5 e 6.5, respectivamente.

---

## 9. Referências

- `docs/adr/0023-camada-de-leitura-sobre-o-sql-server-do-orgao.md`
- `docs/arquitetura/schema-dbfch-prodesp.md`
- `supabase/migrations/0002_postos.sql`, `0022`, `0024`, `0029`, `0038`, `0045`,
  `0046`, `0051`, `0052` e `0053`
- `src/application/ports/`, 28 portas
- Lei nº 13.709/2018 (LGPD), art. 6º, III, princípio da minimização
