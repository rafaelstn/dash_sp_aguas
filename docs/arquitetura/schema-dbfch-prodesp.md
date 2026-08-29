# Schema do banco `Dbfch` (SQL Server da PRODESP)

Extraido do catalogo em 27/08/2026, somente leitura, do servidor
`10.20.40.62`. Referencia para o mapeamento da camada de leitura
descrita no ADR-0023. Documento de ESTADO: envelhece por construcao,
e se confere na fonte antes de decidir.

Total de tabelas: 157. Nenhuma view, nenhuma procedure.

## Indice por volume

| Tabela | Linhas | Colunas |
|---|---:|---:|
| `MedicaoPluviometricas` | 27,280,208 | 8 |
| `MedicaoLoggerFluviograficas` | 17,719,008 | 9 |
| `CotaEscalaFluviometricas` | 10,987,980 | 9 |
| `MedicaoPluviograficas` | 7,231,428 | 6 |
| `LeituraEletronicaPiezometricas` | 2,207,919 | 7 |
| `MedicaoLoggerPluviograficas` | 1,965,398 | 8 |
| `MedicaoMainframePluviometricas` | 888,577 | 10 |
| `ChuvasIntensasSeriesParciais` | 398,698 | 5 |
| `CotaLimnigramaFluviograficas` | 328,126 | 6 |
| `Logs` | 260,116 | 7 |
| `ValoresLoteDigitacaoMedicaoPluviometricas` | 181,758 | 5 |
| `MedicaoMainframeFluviometricas` | 179,059 | 16 |
| `LeituraManualPiezometricas` | 131,938 | 6 |
| `SecoesTransversaisValores` | 117,000 | 7 |
| `ResumoMedicaoVazoes` | 70,184 | 21 |
| `CursoAguaPercursoLimiteMunicipioDistritos` | 60,500 | 7 |
| `SeriesParciais` | 57,409 | 7 |
| `UGRHIsCursoAguas` | 31,987 | 6 |
| `CursoAguasFozMunicipioDistritos` | 29,968 | 6 |
| `GrupoUsoPreponderantesCursoAguas` | 29,765 | 14 |
| `CursoAguaNascimentoMunicipioDistritos` | 29,566 | 6 |
| `CursoAguas` | 29,283 | 34 |
| `GruposPostos` | 23,257 | 6 |
| `AparelhoPostos` | 9,109 | 8 |
| `EquacoesCurvaChaveFluviometricas` | 6,667 | 7 |
| `CabecalhoLoteDigitacaoMedicaoPluviometricas` | 5,994 | 8 |
| `Postos` | 5,803 | 37 |
| `LeituraManualRedeAntigaPiezometricas` | 5,660 | 6 |
| `CursoAguasSubZonasHidrograficas` | 3,336 | 6 |
| `CurvaChaveFluviometricas` | 2,872 | 8 |
| `MunicipioDistritos` | 1,889 | 13 |
| `PercursoMunicipioDistritoUgrhis` | 1,650 | 6 |
| `LogFormatadores` | 1,646 | 8 |
| `SecoesTransversais` | 1,170 | 6 |
| `UsuariosPermissoesIdentity` | 1,007 | 4 |
| `NumeroFolhaCartograficas` | 821 | 4 |
| `Grupos` | 671 | 4 |
| `NomeQuadriculas` | 469 | 4 |
| `Quadriculas` | 469 | 4 |
| `LoteDigitacaoMedicaoPluviometricas` | 434 | 13 |
| `CodigoAtividadesUsuarios` | 412 | 4 |
| `IdentificadorRemotos` | 302 | 10 |
| `ConferenciaLoteDigitacaoPluviometricas` | 301 | 13 |
| `Historicos` | 230 | 7 |
| `ProcessamentoFormatadoresHangFire` | 210 | 5 |
| `CodigoCiaPerfuradoras` | 189 | 4 |
| `CodigoFormacaoEstratigraficas` | 180 | 4 |
| `Relatorios` | 141 | 14 |
| `UGRHIs` | 126 | 4 |
| `CorrecoesPiezometricas` | 119 | 10 |
| `UGHRIsMainframeFCHT` | 104 | 4 |
| `OffsetOrtometricaPiezometricas` | 91 | 7 |
| `ProdutoIrrigados` | 90 | 4 |
| `CodigoAquiferoExplorados` | 82 | 4 |
| `CodigoLaboratorios` | 82 | 4 |
| `EquacoesHelice` | 69 | 3 |
| `CodigoFinalidadeUsoAguas` | 54 | 4 |
| `CodigoSituacoes` | 54 | 4 |
| `CodigoExames` | 49 | 4 |
| `Entidades` | 47 | 5 |
| `Aparelhos` | 45 | 4 |
| `CodigoUsoRecursoHidricos` | 45 | 4 |
| `DescricaoUsoHidricos` | 45 | 4 |
| `CodigoSituacaoAdministrativas` | 42 | 4 |
| `TipoUsoRecursosHidricos` | 36 | 4 |
| `ConcessionarioEnergias` | 30 | 4 |
| `SubZonaHidrograficas` | 30 | 5 |
| `UsuariosIdentity` | 29 | 23 |
| `CodigoUsuarioPrivados` | 26 | 4 |
| `ParametroExameAguas` | 25 | 4 |
| `State` | 24 | 6 |
| `schema_version` | 22 | 10 |
| `FonteCartograficas` | 20 | 4 |
| `JobParameter` | 16 | 3 |
| `RegiaoAdministrativas` | 12 | 4 |
| `MetodoIrrigacoes` | 11 | 4 |
| `TipoFontes` | 11 | 4 |
| `TipoUsoAguaPocos` | 11 | 4 |
| `TipoEspecificacaoFiltros` | 10 | 4 |
| `BaciaHidrograficas` | 9 | 4 |
| `ClasseUsoRios` | 9 | 4 |
| `FonteEnergeticas` | 9 | 4 |
| `FormaDerivacoes` | 9 | 4 |
| `ZonaHidrograficas` | 9 | 4 |
| `Dominios` | 8 | 4 |
| `Instrucoes` | 8 | 4 |
| `Job` | 8 | 7 |
| `TipoMaterialFiltros` | 8 | 4 |
| `TipoPerfilagemEletricas` | 8 | 4 |
| `TipoTratamentoAguas` | 8 | 4 |
| `CodigoEstadoPocos` | 7 | 4 |
| `InteresseCadastros` | 7 | 4 |
| `Ocupacoes` | 7 | 4 |
| `Unidades` | 7 | 4 |
| `CodigoEtapaUsoRecursoHidricos` | 6 | 4 |
| `TipoMaterialTuboLisos` | 6 | 4 |
| `UnidadeFederacoes` | 6 | 4 |
| `AmbitoIrrigacoes` | 5 | 4 |
| `CodigoFinalidadePerfuracoes` | 5 | 4 |
| `CodigoMetodoPerfuracoes` | 5 | 4 |
| `SituacaoCetesb` | 5 | 4 |
| `TipoCoordenadas` | 5 | 4 |
| `TipoMetodoAcabamentos` | 5 | 4 |
| `TipoPocos` | 5 | 4 |
| `CodigoFluidoPerfuracoes` | 4 | 4 |
| `DescricaoMetodoMedicaoVazoes` | 4 | 4 |
| `PerfisUsuariosIdentity` | 4 | 2 |
| `TipoEquipamentoBombeamentos` | 4 | 4 |
| `TipoEquipamentoTesteBombeamentos` | 4 | 4 |
| `TipoMedicoes` | 4 | 2 |
| `TipoPreFiltros` | 4 | 4 |
| `TipoProdutoQuimicoAcabamentos` | 4 | 4 |
| `CodigoAgentePoluentes` | 3 | 4 |
| `Escalas` | 3 | 4 |
| `NivelTecnologicos` | 3 | 4 |
| `TipoEquipamentoInstalado` | 3 | 4 |
| `TipoTesteBombeamentos` | 3 | 4 |
| `ZonaImoveis` | 3 | 4 |
| `AggregatedCounter` | 2 | 3 |
| `CodigoTracoCimentacoes` | 2 | 4 |
| `IndicePoluicoes` | 2 | 4 |
| `PerfisIdentity` | 2 | 4 |
| `Qualificacoes` | 2 | 4 |
| `TipoMaterialTuboRecargas` | 2 | 4 |
| `TipoUniaoFiltros` | 2 | 4 |
| `TipoUniaoTuboLisos` | 2 | 4 |
| `TipoUniaoTuboRecargas` | 2 | 4 |
| `Execucoes` | 1 | 36 |
| `Schema` | 1 | 1 |
| `Server` | 1 | 3 |
| `CodigoCiaPerfilagemEletricas` | 0 | 4 |
| `CodigoMargens` | 0 | 4 |
| `Counter` | 0 | 4 |
| `Estados` | 0 | 2 |
| `Funcionamentos` | 0 | 4 |
| `GrupoAparelhosAnemografoMedicoesMeteorologicas` | 0 | 6 |
| `GrupoAparelhosMedicoesMensaisMeteorologicas` | 0 | 18 |
| `GrupoFlagMedicoesMensaisMeteorologicas` | 0 | 6 |
| `GrupoResumoMedicaoVazao` | 0 | 8 |
| `GruposAparelhosHoraMedicoesMeteorologicas` | 0 | 23 |
| `GruposFlagsSituacaoMedicoesMeteorologicas` | 0 | 6 |
| `Hash` | 0 | 4 |
| `JobQueue` | 0 | 4 |
| `List` | 0 | 4 |
| `MedicoesMensaisMeteorologicas` | 0 | 11 |
| `MedicoesMeteorologicas` | 0 | 10 |
| `Municipios` | 0 | 3 |
| `NumerosAutosExecucoes` | 0 | 4 |
| `PerfisPermissoesIdentity` | 0 | 4 |
| `Rios` | 0 | 3 |
| `Set` | 0 | 4 |
| `TESTE` | 0 | 2 |
| `Usuarios` | 0 | 6 |
| `UsuariosLoginIdentity` | 0 | 4 |
| `UsuarioTokensIdentity` | 0 | 4 |
| `ValoresEquacoesHelice` | 0 | 6 |
| `ZeroEscalas` | 0 | 7 |

## Detalhe de cada tabela

### `AggregatedCounter`

Linhas: 2. Chave primaria: `Key`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Key` | nvarchar(100) | nao |
| `Value` | bigint | nao |
| `ExpireAt` | datetime | sim |

### `AmbitoIrrigacoes`

Linhas: 5. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `AparelhoPostos`

Linhas: 9,109. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `AparelhoId` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | nao |
| `DataInicioMedicao` | datetime | nao |
| `DataDesativacao` | datetime | sim |
| `Excluido` | bit | nao |
| `CodigoAparelhoMainframe` | int | sim |
| `CodigoPostoMainframe` | varchar(8) | sim |

Liga-se a:

- `AparelhoId` para `Aparelhos.Id`
- `PostoId` para `Postos.Id`

### `Aparelhos`

Linhas: 45. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Designacao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `BaciaHidrograficas`

Linhas: 9. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CabecalhoLoteDigitacaoMedicaoPluviometricas`

Linhas: 5,994. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `IdLoteDigitacaoMedicaoPluviometrica` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `PrefixoPosto` | varchar(8) | nao |
| `Sequencia` | int | nao |
| `MesAno` | date | nao |
| `Excluido` | bit | nao |
| `Conferido` | bit | sim |

Liga-se a:

- `IdLoteDigitacaoMedicaoPluviometrica` para `LoteDigitacaoMedicaoPluviometricas.Id`
- `PostoId` para `Postos.Id`

### `ChuvasIntensasSeriesParciais`

Linhas: 398,698. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `SerieParcialId` | uniqueidentifier | nao |
| `IntensidadeMaxima` | decimal(6,3) | nao |
| `Excluido` | bit | nao |
| `Minutos` | int | sim |

Liga-se a:

- `SerieParcialId` para `SeriesParciais.Id`

### `ClasseUsoRios`

Linhas: 9. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoAgentePoluentes`

Linhas: 3. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoAquiferoExplorados`

Linhas: 82. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoAtividadesUsuarios`

Linhas: 412. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoCiaPerfilagemEletricas`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoCiaPerfuradoras`

Linhas: 189. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoEstadoPocos`

Linhas: 7. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoEtapaUsoRecursoHidricos`

Linhas: 6. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoExames`

Linhas: 49. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoFinalidadePerfuracoes`

Linhas: 5. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoFinalidadeUsoAguas`

Linhas: 54. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoFluidoPerfuracoes`

Linhas: 4. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoFormacaoEstratigraficas`

Linhas: 180. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoLaboratorios`

Linhas: 82. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoMargens`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoMetodoPerfuracoes`

Linhas: 5. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoSituacaoAdministrativas`

Linhas: 42. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoSituacoes`

Linhas: 54. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoTracoCimentacoes`

Linhas: 2. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoUsoRecursoHidricos`

Linhas: 45. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `CodigoUsuarioPrivados`

Linhas: 26. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `ConcessionarioEnergias`

Linhas: 30. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `ConferenciaLoteDigitacaoPluviometricas`

Linhas: 301. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `LoteDigitacaoMedicaoPluviometricaId` | uniqueidentifier | nao |
| `UsuarioId` | uniqueidentifier | sim |
| `Numero` | int | nao |
| `MesAno` | date | nao |
| `DataHoraInicialConferencia` | datetime | nao |
| `QuantidadeDocumentos` | int | sim |
| `DataHoraFinalConferencia` | datetime | sim |
| `Excluido` | bit | nao |
| `QuantidadeDocumentosDigitacao` | int | sim |
| `QuantidadeRegistros` | int | sim |
| `QuantidadeRegistrosDigitacao` | int | sim |
| `MesAnoDigitacao` | date | sim |

Liga-se a:

- `LoteDigitacaoMedicaoPluviometricaId` para `LoteDigitacaoMedicaoPluviometricas.Id`
- `UsuarioId` para `UsuariosIdentity.Id`

### `CorrecoesPiezometricas`

Linhas: 119. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `Medidor` | varchar(8) | nao |
| `BocaPoco` | decimal(7,3) | nao |
| `Coeficiente1` | decimal(5,4) | nao |
| `Coeficiente2` | decimal(5,4) | nao |
| `DataInicio` | datetime | nao |
| `DataFinal` | datetime | sim |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |

Liga-se a:

- `PostoId` para `Postos.Id`

### `CotaEscalaFluviometricas`

Linhas: 10,987,980. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | nao |
| `Data` | datetime | nao |
| `Valor` | int | nao |
| `Validacao` | tinyint | sim |
| `Excluido` | bit | nao |
| `MedicaoMainframeFluviometricaId` | uniqueidentifier | sim |
| `VazaoMainframe` | decimal(11,3) | sim |
| `SequenciaPostoMainframe` | int | sim |

Liga-se a:

- `MedicaoMainframeFluviometricaId` para `MedicaoMainframeFluviometricas.Id`
- `PostoId` para `Postos.Id`

### `CotaLimnigramaFluviograficas`

Linhas: 328,126. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `Data` | datetime | nao |
| `Valor` | int | nao |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |

Liga-se a:

- `PostoId` para `Postos.Id`

### `Counter`

Linhas: 0. Chave primaria: `Key`, `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Key` | nvarchar(100) | nao |
| `Value` | int | nao |
| `ExpireAt` | datetime | sim |
| `Id` | bigint | nao |

### `CursoAguaNascimentoMunicipioDistritos`

Linhas: 29,566. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `CursoAguaId` | uniqueidentifier | sim |
| `MunicipioDistritoId` | uniqueidentifier | sim |
| `CodigoCursoAguaMainframe` | varchar(18) | sim |
| `CodigoMunicipioDistrito` | varchar(9) | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `CursoAguaId` para `CursoAguas.Id`
- `MunicipioDistritoId` para `MunicipioDistritos.Id`

### `CursoAguaPercursoLimiteMunicipioDistritos`

Linhas: 60,500. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `CursoAguaId` | uniqueidentifier | sim |
| `MunicipioDistritoId` | uniqueidentifier | sim |
| `CodigoCursoAguaMainframe` | varchar(18) | sim |
| `CodigoMunicipioDistrito` | varchar(9) | sim |
| `IndicadorPercursoLimite` | varchar(1) | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `CursoAguaId` para `CursoAguas.Id`
- `MunicipioDistritoId` para `MunicipioDistritos.Id`

### `CursoAguas`

Linhas: 29,283. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Nome` | varchar(56) | sim |
| `FonteCartograficaId` | uniqueidentifier | sim |
| `CodigoIdentidadeFonteCartograficaMainframe` | int | sim |
| `CoordenadaNorteFoz` | decimal(9,3) | sim |
| `CoordenadaLesteFoz` | decimal(7,3) | sim |
| `CoordenadaMeridianoCentralFoz` | decimal(3,1) | sim |
| `TipoCoordenadaFozId` | uniqueidentifier | sim |
| `CodigoTipoCoordenadaFozMainframe` | int | sim |
| `QuadriculaFozId` | uniqueidentifier | sim |
| `CodigoQuadriculaFozMainframe` | varchar(3) | sim |
| `CoordenadaNorteNascimento` | decimal(9,3) | sim |
| `CoordenadaLesteNascimento` | decimal(7,3) | sim |
| `CoordenadaMeridianoCentralNascimento` | decimal(3,1) | sim |
| `TipoCoordenadaNascimentoId` | uniqueidentifier | sim |
| `CodigoTipoCoordenadaNascimentoMainframe` | int | sim |
| `QuadriculaNascimentoId` | uniqueidentifier | sim |
| `CodigoQuadriculaNascimentoMainframe` | varchar(3) | sim |
| `QuantidadeOutroMunicipio` | int | sim |
| `ComprimentoCursoAgua` | decimal(7,2) | sim |
| `Margem` | varchar(1) | sim |
| `CodigoReceptorAntigo` | int | sim |
| `CodigoReceptor` | varchar(18) | sim |
| `DistanciaFozReceptor` | decimal(7,2) | sim |
| `NumeroDecretoUsoPreponderante` | varchar(6) | sim |
| `DataDecretoUsoPreponderante` | varchar(6) | sim |
| `TipoDominioId` | uniqueidentifier | sim |
| `CodigoTipoDominioMainframe` | int | sim |
| `DataCadastro` | varchar(6) | sim |
| `DataAtualizacao` | varchar(6) | sim |
| `CodigoCursoAguaAnteriorSequencialMainframe` | int | sim |
| `CodigoCursoAguaMainframe` | varchar(18) | sim |
| `CodigoIdentificadorComplementarMainframe` | varchar(25) | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `TipoDominioId` para `Dominios.Id`
- `FonteCartograficaId` para `FonteCartograficas.Id`
- `QuadriculaFozId` para `Quadriculas.Id`
- `QuadriculaNascimentoId` para `Quadriculas.Id`
- `TipoCoordenadaNascimentoId` para `TipoCoordenadas.Id`
- `TipoCoordenadaFozId` para `TipoCoordenadas.Id`

### `CursoAguasFozMunicipioDistritos`

Linhas: 29,968. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `CursoAguaId` | uniqueidentifier | sim |
| `MunicipioDistritoId` | uniqueidentifier | sim |
| `CodigoCursoAguaMainframe` | varchar(18) | sim |
| `CodigoMunicipioDistrito` | varchar(9) | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `CursoAguaId` para `CursoAguas.Id`
- `MunicipioDistritoId` para `MunicipioDistritos.Id`

### `CursoAguasSubZonasHidrograficas`

Linhas: 3,336. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `CursoAguaId` | uniqueidentifier | sim |
| `SubZonaHidrograficaId` | uniqueidentifier | sim |
| `CodigoCursoAguaMainframe` | varchar(18) | sim |
| `CodigoSubZonaHidrograficaMainframe` | int | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `CursoAguaId` para `CursoAguas.Id`
- `SubZonaHidrograficaId` para `SubZonaHidrograficas.Id`

### `CurvaChaveFluviometricas`

Linhas: 2,872. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `DataInicio` | datetime | nao |
| `DataFinal` | datetime | nao |
| `IndiceQualidade` | varchar(3) | nao |
| `Consistencia` | varchar(1) | nao |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |

### `DescricaoMetodoMedicaoVazoes`

Linhas: 4. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `DescricaoUsoHidricos`

Linhas: 45. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `Dominios`

Linhas: 8. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | nvarchar(max) | nao |
| `Excluido` | bit | nao |

### `Entidades`

Linhas: 47. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `CodigoDNAEE` | int | nao |
| `Nome` | varchar(50) | nao |
| `Excluido` | bit | nao |
| `Sigla` | varchar(11) | nao |

### `EquacoesCurvaChaveFluviometricas`

Linhas: 6,667. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `CurvaChaveId` | uniqueidentifier | nao |
| `CoeficienteK` | decimal(5,2) | nao |
| `CoeficienteH` | decimal(5,2) | nao |
| `CoeficienteN` | decimal(5,2) | nao |
| `CoeficienteI` | decimal(5,2) | nao |
| `Excluido` | bit | nao |

Liga-se a:

- `CurvaChaveId` para `CurvaChaveFluviometricas.Id`

### `EquacoesHelice`

Linhas: 69. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Numero` | varchar(9) | nao |
| `Excluido` | bit | nao |

### `Escalas`

Linhas: 3. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `Estados`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Descricao` | varchar(50) | nao |

### `Execucoes`

Linhas: 1. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `MunicipioDistritoId` | uniqueidentifier | sim |
| `MunicipioDistritoFimId` | uniqueidentifier | sim |
| `UgrhiId` | uniqueidentifier | sim |
| `UgrhiFimId` | uniqueidentifier | sim |
| `BaciaHidrograficaId` | uniqueidentifier | sim |
| `BaciaHidrograficaFimId` | uniqueidentifier | sim |
| `TipoUsoAguaId` | uniqueidentifier | sim |
| `AquiferoExploradoId` | uniqueidentifier | sim |
| `CursoAguaId` | uniqueidentifier | sim |
| `DataSolicitacao` | datetime | sim |
| `SituacaoRelatorio` | varchar(1) | sim |
| `CodigoRelatorio` | int | sim |
| `NumeroSolicitacoes` | int | sim |
| `SequenciaPostoMainframe` | int | sim |
| `DataParametroMeteorologicoInicial` | datetime | sim |
| `DataParametroMeteorologicoFinal` | datetime | sim |
| `CodigoMunicipioDistritoMainframe` | varchar(9) | sim |
| `CodigoMunicipioDistritoFimMainframe` | varchar(9) | sim |
| `IdentificadorUnidadeGerenciamentoMainframe` | int | sim |
| `IdentificadorUnidadeGerenciamentoFimMainframe` | int | sim |
| `CodigoBaciaHidrograficaMainframe` | int | sim |
| `CodigoBaciaHidrograficaFimMainframe` | int | sim |
| `DataTerminoPerfuracaoPoco` | datetime | sim |
| `CodigoTipoUsoAguaMainframe` | int | sim |
| `CodigoAquiferoExploradoMainframe` | varchar(2) | sim |
| `CoordenadaNortePocoInicio` | decimal(8,3) | sim |
| `CoordenadaNortePocoFim` | decimal(8,3) | sim |
| `CoordenadaLestePocoInicio` | decimal(7,3) | sim |
| `CoordenadaLestePocoFim` | decimal(7,3) | sim |
| `CoordenadaMeridianoCentral` | decimal(4,1) | sim |
| `CodigoCursoAguaMainframe` | varchar(18) | sim |
| `NumeroCgc` | varchar(17) | sim |
| `CodigoUsuarioPrivado` | int | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `BaciaHidrograficaId` para `BaciaHidrograficas.Id`
- `BaciaHidrograficaFimId` para `BaciaHidrograficas.Id`
- `AquiferoExploradoId` para `CodigoAquiferoExplorados.Id`
- `CursoAguaId` para `CursoAguas.Id`
- `MunicipioDistritoId` para `MunicipioDistritos.Id`
- `MunicipioDistritoFimId` para `MunicipioDistritos.Id`
- `PostoId` para `Postos.Id`
- `TipoUsoAguaId` para `TipoUsoAguaPocos.Id`
- `UgrhiId` para `UGRHIs.Id`
- `UgrhiFimId` para `UGRHIs.Id`

### `FonteCartograficas`

Linhas: 20. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `FonteEnergeticas`

Linhas: 9. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `FormaDerivacoes`

Linhas: 9. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `Funcionamentos`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `GrupoAparelhosAnemografoMedicoesMeteorologicas`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `MedicaoMeteorologicaId` | uniqueidentifier | nao |
| `Posicao` | int | sim |
| `VentoAcumuladoKm` | int | sim |
| `VentoAcumuladoHora` | decimal(8,1) | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `MedicaoMeteorologicaId` para `MedicoesMeteorologicas.Id`

### `GrupoAparelhosMedicoesMensaisMeteorologicas`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `MedicaoMensalMeteoroligaId` | uniqueidentifier | nao |
| `Posicao` | int | nao |
| `PsicrometroBulboSeco` | decimal(8,1) | sim |
| `PsicrometroBulboUmido` | decimal(8,1) | sim |
| `PsicronmetroUmidadeRelativa` | int | sim |
| `Barometro` | decimal(12,1) | sim |
| `Termometro` | decimal(8,1) | sim |
| `Termografo` | decimal(8,1) | sim |
| `Higrografo` | int | sim |
| `PluviometroTotalMaximo` | decimal(8,1) | sim |
| `PluviografoTotalMaximo` | decimal(8,1) | sim |
| `Micrometro` | decimal(8,1) | sim |
| `Balanca` | decimal(8,1) | sim |
| `Anemografo` | int | sim |
| `Anenometro` | decimal(12,1) | sim |
| `Barografo` | decimal(12,1) | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `MedicaoMensalMeteoroligaId` para `MedicoesMensaisMeteorologicas.Id`

### `GrupoFlagMedicoesMensaisMeteorologicas`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `MedicaoMensalMeteoroligaId` | uniqueidentifier | nao |
| `Posicao` | int | nao |
| `Disponivel` | int | sim |
| `Consistido` | int | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `MedicaoMensalMeteoroligaId` para `MedicoesMensaisMeteorologicas.Id`

### `GrupoResumoMedicaoVazao`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `ResumoMedicaoId` | uniqueidentifier | nao |
| `NumeroVertical` | int | sim |
| `Distancia` | decimal(6,2) | sim |
| `Profundidade` | decimal(6,2) | sim |
| `Rotacao206` | int | sim |
| `Rotacao8` | int | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `ResumoMedicaoId` para `ResumoMedicaoVazoes.Id`

### `GrupoUsoPreponderantesCursoAguas`

Linhas: 29,765. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `CursoAguaId` | uniqueidentifier | sim |
| `CodigoCursoAguaMainframe` | varchar(18) | sim |
| `IndiceClasseUsoPreponderante` | int | sim |
| `CoordenadaNorteMontante` | decimal(11,3) | sim |
| `CoordenadaLesteMontante` | decimal(8,3) | sim |
| `CoordenadaMeridianoCentralMontante` | decimal(3,1) | sim |
| `DistanciaMontante` | decimal(7,2) | sim |
| `CoordenadaNorteJunsante` | decimal(11,3) | sim |
| `CoordenadaLesteJunsante` | decimal(8,3) | sim |
| `CoordenadaMeridianoCentralJunsante` | decimal(3,1) | sim |
| `DistanciaJunsante` | decimal(7,2) | sim |
| `IdentificadorItemDecretoUsoPreponderante` | varchar(5) | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `CursoAguaId` para `CursoAguas.Id`

### `Grupos`

Linhas: 671. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |
| `Codigo` | int | sim |

### `GruposAparelhosHoraMedicoesMeteorologicas`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `MedicaoMeteorologicaId` | uniqueidentifier | nao |
| `Posicao` | int | sim |
| `IdentificadorObservador` | varchar(2) | sim |
| `PsicrometroBulboSeco` | decimal(8,1) | sim |
| `PsicrometroBulboUmido` | decimal(8,1) | sim |
| `PsicrometroUmidoRelatotivo` | decimal(6,1) | sim |
| `TermometroMaximo` | decimal(8,1) | sim |
| `TermometroMinimo` | decimal(8,1) | sim |
| `Barometro` | decimal(12,1) | sim |
| `Pluviometro` | decimal(8,1) | sim |
| `Pluviografo` | decimal(8,1) | sim |
| `Anemografo` | int | sim |
| `Anemometro` | decimal(12,1) | sim |
| `Termometro` | decimal(8,1) | sim |
| `Micrometro` | decimal(8,1) | sim |
| `MicrometroNovoNivel` | decimal(8,1) | sim |
| `Balanca` | decimal(8,1) | sim |
| `BalancaTroca` | decimal(4,1) | sim |
| `Heliografo` | decimal(4,1) | sim |
| `Termografo` | decimal(8,1) | sim |
| `Higrografo` | int | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `MedicaoMeteorologicaId` para `MedicoesMeteorologicas.Id`

### `GruposFlagsSituacaoMedicoesMeteorologicas`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `MedicaoMeteorologicaId` | uniqueidentifier | nao |
| `Posicao` | int | sim |
| `Disponivel` | int | sim |
| `Consistido` | int | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `MedicaoMeteorologicaId` para `MedicoesMeteorologicas.Id`

### `GruposPostos`

Linhas: 23,257. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `GrupoId` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | nao |
| `Excluido` | bit | nao |
| `CodigoGrupoMainframe` | int | sim |
| `CodigoPostoMainframe` | varchar(8) | sim |

Liga-se a:

- `GrupoId` para `Grupos.Id`
- `PostoId` para `Postos.Id`

### `Hash`

Linhas: 0. Chave primaria: `Key`, `Field`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Key` | nvarchar(100) | nao |
| `Field` | nvarchar(100) | nao |
| `Value` | nvarchar(max) | sim |
| `ExpireAt` | datetime2 | sim |

### `Historicos`

Linhas: 230. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `Data` | datetime | nao |
| `Descricao` | varchar(2000) | nao |
| `Sequencia` | int | nao |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |

Liga-se a:

- `PostoId` para `Postos.Id`

### `IdentificadorRemotos`

Linhas: 302. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | nao |
| `TipoMedicaoId` | uniqueidentifier | nao |
| `Offset` | decimal(9,4) | sim |
| `Inicio` | datetime | nao |
| `Final` | datetime | sim |
| `Excluido` | bit | nao |
| `IdentificadorDecimal` | int | sim |
| `IdentificadorHexaDecimal` | varchar(8) | sim |
| `Sequencia` | int | sim |

Liga-se a:

- `PostoId` para `Postos.Id`
- `TipoMedicaoId` para `TipoMedicoes.Id`

### `IndicePoluicoes`

Linhas: 2. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `Instrucoes`

Linhas: 8. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `InteresseCadastros`

Linhas: 7. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `Job`

Linhas: 8. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | bigint | nao |
| `StateId` | bigint | sim |
| `StateName` | nvarchar(20) | sim |
| `InvocationData` | nvarchar(max) | nao |
| `Arguments` | nvarchar(max) | nao |
| `CreatedAt` | datetime | nao |
| `ExpireAt` | datetime | sim |

### `JobParameter`

Linhas: 16. Chave primaria: `JobId`, `Name`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `JobId` | bigint | nao |
| `Name` | nvarchar(40) | nao |
| `Value` | nvarchar(max) | sim |

Liga-se a:

- `JobId` para `Job.Id`

### `JobQueue`

Linhas: 0. Chave primaria: `Queue`, `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | bigint | nao |
| `JobId` | bigint | nao |
| `Queue` | nvarchar(50) | nao |
| `FetchedAt` | datetime | sim |

### `LeituraEletronicaPiezometricas`

Linhas: 2,207,919. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `Data` | datetime | nao |
| `Valor` | decimal(7,1) | nao |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |
| `LogFormatadorId` | uniqueidentifier | sim |

Liga-se a:

- `LogFormatadorId` para `LogFormatadores.Id`
- `PostoId` para `Postos.Id`

### `LeituraManualPiezometricas`

Linhas: 131,938. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `Data` | datetime | nao |
| `Valor` | int | nao |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |

Liga-se a:

- `PostoId` para `Postos.Id`

### `LeituraManualRedeAntigaPiezometricas`

Linhas: 5,660. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `Data` | datetime | nao |
| `Valor` | decimal(8,1) | nao |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |

Liga-se a:

- `PostoId` para `Postos.Id`

### `List`

Linhas: 0. Chave primaria: `Key`, `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | bigint | nao |
| `Key` | nvarchar(100) | nao |
| `Value` | nvarchar(max) | sim |
| `ExpireAt` | datetime | sim |

### `LogFormatadores`

Linhas: 1,646. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `UsuarioId` | uniqueidentifier | nao |
| `TipoMedicaoId` | uniqueidentifier | nao |
| `DataInicio` | datetime | nao |
| `DataFim` | datetime | nao |
| `TipoFormatador` | varchar(60) | nao |
| `Excluido` | bit | nao |
| `ProcessamentoId` | uniqueidentifier | sim |

Liga-se a:

- `ProcessamentoId` para `ProcessamentoFormatadoresHangFire.Id`
- `TipoMedicaoId` para `TipoMedicoes.Id`
- `UsuarioId` para `UsuariosIdentity.Id`

### `Logs`

Linhas: 260,116. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `UsuarioId` | uniqueidentifier | nao |
| `Controller` | nvarchar(256) | nao |
| `Data` | datetime | nao |
| `Metodo` | nvarchar(10) | nao |
| `Action` | nvarchar(256) | nao |
| `Parametros` | nvarchar(max) | sim |

Liga-se a:

- `UsuarioId` para `UsuariosIdentity.Id`

### `LoteDigitacaoMedicaoPluviometricas`

Linhas: 434. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Numero` | int | nao |
| `MesAno` | date | nao |
| `QuantidadeDocumentos` | int | nao |
| `Conferido` | bit | sim |
| `Transferido` | bit | sim |
| `Rascunho` | bit | sim |
| `Excluido` | bit | nao |
| `DataHoraInicialPreenchimento` | datetime | nao |
| `DataHoraFinalPreenchimento` | datetime | sim |
| `UsuarioDigitador` | varchar(70) | nao |
| `Liberado` | bit | nao |
| `QuantidadeRegistros` | int | sim |

### `MedicaoLoggerFluviograficas`

Linhas: 17,719,008. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `Valor` | int | nao |
| `Data` | datetime | nao |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |
| `LogFormatadorId` | uniqueidentifier | sim |
| `CotaSuspeita` | bit | nao |
| `DataBloqueio` | datetime | sim |

Liga-se a:

- `LogFormatadorId` para `LogFormatadores.Id`
- `PostoId` para `Postos.Id`

### `MedicaoLoggerPluviograficas`

Linhas: 1,965,398. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `Data` | datetime | nao |
| `Medicao` | decimal(6,1) | nao |
| `Acumulado` | decimal(6,1) | sim |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |
| `LogFormatadorId` | uniqueidentifier | sim |

Liga-se a:

- `LogFormatadorId` para `LogFormatadores.Id`
- `PostoId` para `Postos.Id`

### `MedicaoMainframeFluviometricas`

Linhas: 179,059. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `MesAno` | date | sim |
| `VazaoTotal` | decimal(14,3) | sim |
| `VazaoMaxima` | decimal(11,3) | sim |
| `VazaoMinima` | decimal(11,3) | sim |
| `Cota07Total` | int | sim |
| `Cota18Total` | int | sim |
| `Cota07Maxima` | int | sim |
| `Cota18Maxima` | int | sim |
| `Cota07Minima` | int | sim |
| `Cota18Minima` | int | sim |
| `Disponivel` | bit | sim |
| `Consistente` | bit | sim |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |

Liga-se a:

- `PostoId` para `Postos.Id`

### `MedicaoMainframePluviometricas`

Linhas: 888,577. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `SequenciaPostoMainframe` | int | sim |
| `MesAno` | date | sim |
| `Total` | decimal(6,1) | sim |
| `Maxima` | decimal(6,1) | sim |
| `NumeroDias` | int | sim |
| `Disponivel` | bit | sim |
| `Consistente` | bit | sim |
| `Excluido` | bit | nao |

### `MedicaoPluviograficas`

Linhas: 7,231,428. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `Data` | datetime | nao |
| `Medicao` | decimal(3,1) | nao |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |

Liga-se a:

- `PostoId` para `Postos.Id`

### `MedicaoPluviometricas`

Linhas: 27,280,208. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `Data` | datetime | nao |
| `Medicao` | decimal(6,1) | sim |
| `Validacao` | tinyint | sim |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |
| `MedicaoMainframePluviometricaId` | uniqueidentifier | sim |

Liga-se a:

- `MedicaoMainframePluviometricaId` para `MedicaoMainframePluviometricas.Id`
- `PostoId` para `Postos.Id`

### `MedicoesMensaisMeteorologicas`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `SequenciaPostoMainframe` | int | sim |
| `AnoMes` | varchar(8) | sim |
| `MaximaTermometro` | decimal(8,1) | sim |
| `MinimaTermometro` | decimal(8,1) | sim |
| `SiglaVentoMaximoInstantaneo` | varchar(3) | sim |
| `VentoMaximoInstantaneo` | decimal(8,1) | sim |
| `HoraVentoMaximoInstantaneo` | decimal(9,1) | sim |
| `HeliografoTotal` | decimal(8,1) | sim |
| `Excluido` | bit | nao |

### `MedicoesMeteorologicas`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `SequenciaPostoMainframe` | int | sim |
| `Data` | datetime | sim |
| `PressaoMaxima` | decimal(11,1) | sim |
| `PressaoMinima` | decimal(11,1) | sim |
| `SiglaVentoMaximoInstantaneo` | varchar(2) | sim |
| `VentoMaximoInstantaneo` | decimal(7,1) | sim |
| `HoraVentoMaximoInstantaneo` | int | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `PostoId` para `Postos.Id`

### `MetodoIrrigacoes`

Linhas: 11. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `MunicipioDistritos`

Linhas: 1,889. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `QuadriculaId` | uniqueidentifier | sim |
| `BaciaHidrograficaId` | uniqueidentifier | sim |
| `UgrhiId` | uniqueidentifier | sim |
| `Codigo` | varchar(9) | sim |
| `Nome` | varchar(50) | sim |
| `CodigoUsuarioMainframe` | varchar(3) | sim |
| `CodigoQuadriculaMainFrame` | varchar(3) | sim |
| `CodigoBaciaHidrograficaMainFrame` | int | sim |
| `CodigoUGRHIMainframe` | int | sim |
| `Excluido` | bit | nao |
| `UnidadeFederacaoId` | uniqueidentifier | sim |
| `CodigoUnidadeFederacaoMainframe` | varchar(2) | sim |

Liga-se a:

- `BaciaHidrograficaId` para `BaciaHidrograficas.Id`
- `QuadriculaId` para `Quadriculas.Id`
- `UgrhiId` para `UGRHIs.Id`
- `UnidadeFederacaoId` para `UnidadeFederacoes.Id`

### `Municipios`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Descricao` | varchar(50) | nao |
| `Codigo` | varchar(6) | sim |

### `NivelTecnologicos`

Linhas: 3. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `NomeQuadriculas`

Linhas: 469. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `NumeroFolhaCartograficas`

Linhas: 821. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `NumerosAutosExecucoes`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `ExecucaoId` | uniqueidentifier | nao |
| `Numero` | int | nao |
| `Excluido` | bit | nao |

Liga-se a:

- `ExecucaoId` para `Execucoes.Id`

### `Ocupacoes`

Linhas: 7. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `OffsetOrtometricaPiezometricas`

Linhas: 91. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `DataInicio` | datetime | nao |
| `DataFinal` | datetime | sim |
| `Valor` | decimal(7,2) | nao |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |

Liga-se a:

- `PostoId` para `Postos.Id`

### `ParametroExameAguas`

Linhas: 25. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `PercursoMunicipioDistritoUgrhis`

Linhas: 1,650. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `MunicipioDistritoId` | uniqueidentifier | nao |
| `UgrhiId` | uniqueidentifier | sim |
| `CodigoMunicipioDistritoMainframe` | varchar(9) | sim |
| `CodigoUGRHIMainframe` | int | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `MunicipioDistritoId` para `MunicipioDistritos.Id`
- `UgrhiId` para `UGRHIs.Id`

### `PerfisIdentity`

Linhas: 2. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Descricao` | nvarchar(max) | sim |
| `NomeNormalizado` | nvarchar(450) | sim |
| `ConcurrencyStamp` | nvarchar(max) | sim |

### `PerfisPermissoesIdentity`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | int | nao |
| `PerfilId` | uniqueidentifier | nao |
| `Tipo` | nvarchar(max) | sim |
| `Valor` | nvarchar(max) | sim |

Liga-se a:

- `PerfilId` para `PerfisIdentity.Id`

### `PerfisUsuariosIdentity`

Linhas: 4. Chave primaria: `UsuarioId`, `PerfilId`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `UsuarioId` | uniqueidentifier | nao |
| `PerfilId` | uniqueidentifier | nao |

Liga-se a:

- `PerfilId` para `PerfisIdentity.Id`
- `UsuarioId` para `UsuariosIdentity.Id`

### `Postos`

Linhas: 5,803. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `ZonaHidrograficaId` | uniqueidentifier | sim |
| `SubZonaHidrograficaId` | uniqueidentifier | sim |
| `TipoMedicoesID` | uniqueidentifier | nao |
| `ProprietariaEntidadeId` | uniqueidentifier | sim |
| `OperadoraEntidadeId` | uniqueidentifier | sim |
| `RioId` | uniqueidentifier | sim |
| `UGRHIId` | uniqueidentifier | sim |
| `MunicipioId` | uniqueidentifier | sim |
| `Prefixo` | varchar(8) | nao |
| `Nome` | varchar(50) | sim |
| `PrefixoDNAEE` | varchar(8) | sim |
| `DataInstalacao` | datetime | sim |
| `DataExtincao` | datetime | sim |
| `CoordenadaUTMLatitude` | decimal(7,2) | sim |
| `CoordenadaUTMLongitude` | decimal(7,2) | sim |
| `CoordenadaUTMMeridiano` | int | sim |
| `CoordenadaGrausLatitudade` | int | sim |
| `CoordenadaGrausLongitude` | int | sim |
| `Altitude` | decimal(7,3) | sim |
| `AreaDrenagem` | decimal(9,2) | sim |
| `Excluido` | bit | nao |
| `Sequencia` | int | sim |
| `CodigoZonaHidrograficaMainframe` | int | sim |
| `CodigoSubZonaHidrograficaMainframe` | int | sim |
| `CodigoOperadoraMainframe` | varchar(11) | sim |
| `CodigoProprietariaMainframe` | varchar(11) | sim |
| `CodigoEstadoMainframe` | varchar(2) | sim |
| `CodigoMunicipioMainframe` | varchar(6) | sim |
| `CodigoRioMainframe` | varchar(12) | sim |
| `CodigoMunicipioDistritoMainframe` | varchar(9) | sim |
| `CodigoCursoAguaMainframe` | varchar(18) | sim |
| `CodigoUgrhiMainframe` | int | sim |
| `MunicipioDistritoId` | uniqueidentifier | sim |
| `UnidadeFederacaoId` | uniqueidentifier | sim |
| `CursoAguaId` | uniqueidentifier | sim |
| `UnidadeAquifera` | varchar(100) | sim |

Liga-se a:

- `CursoAguaId` para `CursoAguas.Id`
- `ProprietariaEntidadeId` para `Entidades.Id`
- `OperadoraEntidadeId` para `Entidades.Id`
- `MunicipioDistritoId` para `MunicipioDistritos.Id`
- `SubZonaHidrograficaId` para `SubZonaHidrograficas.Id`
- `TipoMedicoesID` para `TipoMedicoes.Id`
- `UGRHIId` para `UGRHIs.Id`
- `UnidadeFederacaoId` para `UnidadeFederacoes.Id`
- `ZonaHidrograficaId` para `ZonaHidrograficas.Id`

### `ProcessamentoFormatadoresHangFire`

Linhas: 210. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `UsuarioId` | uniqueidentifier | nao |
| `DataProcessamento` | datetime | nao |
| `Formatador` | nvarchar(256) | nao |
| `Status` | nvarchar(20) | nao |

Liga-se a:

- `UsuarioId` para `UsuariosIdentity.Id`

### `ProdutoIrrigados`

Linhas: 90. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `Quadriculas`

Linhas: 469. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `Qualificacoes`

Linhas: 2. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `RegiaoAdministrativas`

Linhas: 12. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `Relatorios`

Linhas: 141. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `TipoPosto` | int | sim |
| `Descricao` | varchar(50) | sim |
| `NumeroItemFaturamento` | int | sim |
| `QuantidadeExecucaoMensal` | int | sim |
| `NumeroSolicitacoes` | int | sim |
| `NomeRotina` | varchar(8) | sim |
| `TipoPeriodo` | int | sim |
| `IndiceQuantidadeSolicitacoes` | int | sim |
| `TipoParamentro` | int | sim |
| `CodigoProcAssociada` | varchar(8) | sim |
| `DescricaoProcAssociada` | varchar(50) | sim |
| `Excluido` | bit | nao |
| `Codigo` | int | sim |

### `ResumoMedicaoVazoes`

Linhas: 70,184. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `EntidadeId` | uniqueidentifier | sim |
| `DataInicial` | datetime | nao |
| `DataFinal` | datetime | nao |
| `CotaInicial` | decimal(5,2) | nao |
| `CotaFinal` | decimal(5,2) | nao |
| `VazaoLiquida` | decimal(9,3) | nao |
| `AreaSeccao` | decimal(7,2) | sim |
| `LarguraSeccao` | decimal(7,2) | sim |
| `ProfundidadeMedia` | decimal(5,2) | sim |
| `VelocidadeMedia` | decimal(5,3) | sim |
| `RaioHidraulico` | decimal(5,2) | sim |
| `Qualidade` | char(1) | sim |
| `Excluido` | bit | nao |
| `TempoMolinete` | int | sim |
| `NumeroHelice` | varchar(9) | sim |
| `IndiceMargem` | varchar(1) | sim |
| `SequenciaPostoMainframe` | int | sim |
| `CodigoEntidadeMedidoraMainframe` | varchar(11) | sim |
| `IndicePendente` | varchar(1) | sim |

Liga-se a:

- `EntidadeId` para `Entidades.Id`
- `PostoId` para `Postos.Id`

### `Rios`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Descricao` | varchar(50) | nao |
| `Codigo` | varchar(12) | sim |

### `Schema`

Linhas: 1. Chave primaria: `Version`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Version` | int | nao |

### `SecoesTransversais`

Linhas: 1,170. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `DataLevantamento` | date | nao |
| `ValorNivelAgua` | decimal(5,2) | nao |
| `Excluido` | bit | nao |
| `SequenciaPostoMainframe` | int | sim |

Liga-se a:

- `PostoId` para `Postos.Id`

### `SecoesTransversaisValores`

Linhas: 117,000. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `SecaoId` | uniqueidentifier | nao |
| `ValorCotaBatimetria` | decimal(5,2) | sim |
| `DistanciaSimples` | decimal(5,2) | sim |
| `PosicaoOrdenal` | int | nao |
| `Excluido` | bit | nao |
| `ValorDistanciaAcumulado` | decimal(8,2) | sim |

Liga-se a:

- `SecaoId` para `SecoesTransversais.Id`

### `SeriesParciais`

Linhas: 57,409. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `SequenciaPostoMainframe` | int | sim |
| `DataMedicao` | datetime | sim |
| `DuracaoTotal` | int | sim |
| `TotalChuva` | decimal(6,1) | sim |
| `Excluido` | bit | nao |

### `Server`

Linhas: 1. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | nvarchar(200) | nao |
| `Data` | nvarchar(max) | sim |
| `LastHeartbeat` | datetime | nao |

### `Set`

Linhas: 0. Chave primaria: `Key`, `Value`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Key` | nvarchar(100) | nao |
| `Score` | float | nao |
| `Value` | nvarchar(256) | nao |
| `ExpireAt` | datetime | sim |

### `SituacaoCetesb`

Linhas: 5. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `State`

Linhas: 24. Chave primaria: `JobId`, `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | bigint | nao |
| `JobId` | bigint | nao |
| `Name` | nvarchar(20) | nao |
| `Reason` | nvarchar(100) | sim |
| `CreatedAt` | datetime | nao |
| `Data` | nvarchar(max) | sim |

Liga-se a:

- `JobId` para `Job.Id`

### `SubZonaHidrograficas`

Linhas: 30. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `ZonaHidrograficaId` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

Liga-se a:

- `ZonaHidrograficaId` para `ZonaHidrograficas.Id`

### `TESTE`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Descricao` | varchar(50) | nao |

### `TipoCoordenadas`

Linhas: 5. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoEquipamentoBombeamentos`

Linhas: 4. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoEquipamentoInstalado`

Linhas: 3. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoEquipamentoTesteBombeamentos`

Linhas: 4. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoEspecificacaoFiltros`

Linhas: 10. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoFontes`

Linhas: 11. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoMaterialFiltros`

Linhas: 8. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoMaterialTuboLisos`

Linhas: 6. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoMaterialTuboRecargas`

Linhas: 2. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoMedicoes`

Linhas: 4. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Descricao` | varchar(50) | nao |

### `TipoMetodoAcabamentos`

Linhas: 5. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoPerfilagemEletricas`

Linhas: 8. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoPocos`

Linhas: 5. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoPreFiltros`

Linhas: 4. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoProdutoQuimicoAcabamentos`

Linhas: 4. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoTesteBombeamentos`

Linhas: 3. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoTratamentoAguas`

Linhas: 8. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoUniaoFiltros`

Linhas: 2. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoUniaoTuboLisos`

Linhas: 2. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoUniaoTuboRecargas`

Linhas: 2. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoUsoAguaPocos`

Linhas: 11. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `TipoUsoRecursosHidricos`

Linhas: 36. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `UGHRIsMainframeFCHT`

Linhas: 104. Chave primaria: nenhuma.

| Coluna | Tipo | Nulo |
|---|---|---|
| `id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(60) | sim |
| `Excluido` | bit | nao |

### `UGRHIs`

Linhas: 126. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |
| `Codigo` | int | nao |

### `UGRHIsCursoAguas`

Linhas: 31,987. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `CursoAguaId` | uniqueidentifier | sim |
| `UgrhiId` | uniqueidentifier | sim |
| `CodigoCursoAguaMainframe` | varchar(18) | sim |
| `CodigoUgrhiMainframe` | int | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `CursoAguaId` para `CursoAguas.Id`
- `UgrhiId` para `UGRHIs.Id`

### `UnidadeFederacoes`

Linhas: 6. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | varchar(25) | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `Unidades`

Linhas: 7. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `UsuarioTokensIdentity`

Linhas: 0. Chave primaria: `UsuarioId`, `LoginProvider`, `Nome`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `UsuarioId` | uniqueidentifier | nao |
| `LoginProvider` | nvarchar(450) | nao |
| `Nome` | nvarchar(450) | nao |
| `Valor` | nvarchar(max) | sim |

Liga-se a:

- `UsuarioId` para `UsuariosIdentity.Id`

### `Usuarios`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Email` | varchar(70) | nao |
| `Senha` | varchar(70) | nao |
| `NomeCompleto` | varchar(150) | nao |
| `Cpf` | varchar(15) | nao |
| `Excluido` | bit | sim |

### `UsuariosIdentity`

Linhas: 29. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Nome` | nvarchar(max) | nao |
| `NomeCompleto` | nvarchar(max) | nao |
| `CPF` | nvarchar(max) | nao |
| `SenhaProvisoria` | bit | nao |
| `DataCadastro` | datetime2 | nao |
| `Localidade` | nvarchar(max) | sim |
| `Divisao` | nvarchar(max) | sim |
| `NomeUsuario` | nvarchar(max) | sim |
| `NomeUsuarioNormalizado` | nvarchar(450) | sim |
| `Email` | nvarchar(max) | sim |
| `EmailNormalizado` | nvarchar(450) | sim |
| `EmailConfirmado` | bit | nao |
| `SenhaHash` | nvarchar(max) | sim |
| `SecurityStamp` | nvarchar(max) | sim |
| `ConcurrencyStamp` | nvarchar(max) | sim |
| `NumeroTelefone` | nvarchar(max) | sim |
| `NumeroTelefoneConfirmado` | bit | nao |
| `AutenticacaoEmDoisFatores` | bit | nao |
| `LockoutEnd` | datetimeoffset | sim |
| `LockoutEnabled` | bit | nao |
| `QuantidadeFalhasLogin` | int | nao |
| `Excluido` | bit | nao |

### `UsuariosLoginIdentity`

Linhas: 0. Chave primaria: `LoginProvider`, `ProviderKey`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `LoginProvider` | nvarchar(450) | nao |
| `ProviderKey` | nvarchar(450) | nao |
| `ProviderDisplayName` | nvarchar(max) | sim |
| `UsuarioId` | uniqueidentifier | nao |

Liga-se a:

- `UsuarioId` para `UsuariosIdentity.Id`

### `UsuariosPermissoesIdentity`

Linhas: 1,007. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | int | nao |
| `UsuarioId` | uniqueidentifier | nao |
| `Tipo` | nvarchar(max) | sim |
| `Valor` | nvarchar(max) | sim |

Liga-se a:

- `UsuarioId` para `UsuariosIdentity.Id`

### `ValoresEquacoesHelice`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `EquacaoId` | uniqueidentifier | nao |
| `CoeficienteA` | decimal(8,5) | sim |
| `CoeficienteB` | decimal(8,5) | sim |
| `CoeficienteI` | decimal(6,3) | sim |
| `Excluido` | bit | nao |

Liga-se a:

- `EquacaoId` para `EquacoesHelice.Id`

### `ValoresLoteDigitacaoMedicaoPluviometricas`

Linhas: 181,758. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `IdCabecalhoLoteDigitacaoMedicaoPluviometrica` | uniqueidentifier | nao |
| `Valor` | decimal(6,1) | nao |
| `Excluido` | bit | nao |
| `Data` | date | nao |

Liga-se a:

- `IdCabecalhoLoteDigitacaoMedicaoPluviometrica` para `CabecalhoLoteDigitacaoMedicaoPluviometricas.Id`

### `ZeroEscalas`

Linhas: 0. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `PostoId` | uniqueidentifier | sim |
| `SequenciaPostoMainframe` | int | sim |
| `DataInicio` | datetime | nao |
| `DataFinal` | datetime | sim |
| `Valor` | decimal(8,2) | nao |
| `Excluido` | bit | nao |

Liga-se a:

- `PostoId` para `Postos.Id`

### `ZonaHidrograficas`

Linhas: 9. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | sim |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `ZonaImoveis`

Linhas: 3. Chave primaria: `Id`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `Id` | uniqueidentifier | nao |
| `Codigo` | int | nao |
| `Descricao` | varchar(50) | nao |
| `Excluido` | bit | nao |

### `schema_version`

Linhas: 22. Chave primaria: `installed_rank`.

| Coluna | Tipo | Nulo |
|---|---|---|
| `installed_rank` | int | nao |
| `version` | nvarchar(50) | sim |
| `description` | nvarchar(200) | sim |
| `type` | nvarchar(20) | nao |
| `script` | nvarchar(1000) | nao |
| `checksum` | int | sim |
| `installed_by` | nvarchar(100) | nao |
| `installed_on` | datetime | nao |
| `execution_time` | int | nao |
| `success` | bit | nao |
