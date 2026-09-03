/**
 * Entidade Posto Hidrológico — o cadastro como o `Dbfch` do órgão o descreve.
 *
 * Todos os campos (exceto `prefixo`) são opcionais por invariante do domínio
 * (ver docs/spec.md §3.3 INV-02). Campos originalmente datados na planilha vêm
 * como string por tolerância a formatos heterogêneos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OS 12 CAMPOS QUE SAÍRAM EM 03/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * A entidade nasceu como espelho de uma PLANILHA (migration `0002_postos.sql`,
 * que descreve vários deles como "texto livre na planilha original"). Desde o
 * ADR-0023 a origem é o banco do órgão, e doze daqueles campos não têm origem
 * nenhuma lá: `rede`, `btl`, `ciaAmbiental`, `cobacia`, `observacoes`,
 * `tempoTransmissao`, `statusPcd`, `ultimaTransmissao`, `fichaInspecao`,
 * `ultimaDataFi`, `fichaDescritiva` e `ultimaAtualizacaoFd`.
 *
 * Não é ausência por amostra pequena: as 157 tabelas do `Dbfch` foram varridas
 * por nome, e três dos candidatos foram avaliados e REJEITADOS com motivo
 * escrito (`Grupos` para `rede`, `Historicos` para `observacoes`, e os três de
 * ESTADO da telemetria, que equipamento cadastrado não responde). Campo que a
 * API declara e nunca preenche é pior que campo ausente: quem lê a ficha não
 * distingue "o órgão não informou" de "o sistema não busca".
 *
 * O que NÃO saiu, e a distinção é a que mais importa aqui: `telemetrico` é
 * DERIVADO do vínculo `AparelhoPostos` x `Aparelhos` e responde por 149 postos
 * (medido em 02/09/2026, e exercitado em `tests/integration/postos-mssql`). Ele
 * não aparece em `sys.columns` porque não é coluna, e vem vazio em amostra
 * pequena porque preenche 2,6% da base. É a mesma armadilha de `aquifero`.
 */
export interface Posto {
  id: string;
  prefixo: string;
  mantenedor: string | null;
  prefixoAna: string | null;
  nomeEstacao: string | null;
  operacaoInicioAno: number | null;
  operacaoFimAno: number | null;
  latitude: number | null;
  longitude: number | null;
  municipio: string | null;
  municipioAlt: string | null;
  baciaHidrografica: string | null;
  ugrhiNome: string | null;
  ugrhiNumero: string | null;
  subUgrhiNome: string | null;
  subUgrhiNumero: string | null;
  proprietario: string | null;
  tipoPosto: string | null;
  areaKm2: number | null;

  // ──────────── Instrumentação derivada de AparelhoPostos x Aparelhos ────────────
  // Os cinco respondem "o que o posto TEM hoje" (só aparelho com
  // `DataDesativacao IS NULL`), e não "o que ele já teve".
  convencional: string | null;
  loggerEqp: string | null;
  telemetrico: string | null;
  nivel: string | null;
  vazao: string | null;

  aquifero: string | null;
  altimetria: number | null;

  // ──────────── Datas de medição ANA (Meta I.6 PROGESTÃO) ────────────
  // Adicionadas pela migration 0031. Espelham os 6 pares início/fim por
  // tipo de medição que a ANA exige no inventário oficial.
  anaEscalaInicio: string | null;
  anaEscalaFim: string | null;
  anaDescargaLiquidaInicio: string | null;
  anaDescargaLiquidaFim: string | null;
  anaSedimentosInicio: string | null;
  anaSedimentosFim: string | null;
  anaQualidadeInicio: string | null;
  anaQualidadeFim: string | null;
  anaPluviometroInicio: string | null;
  anaPluviometroFim: string | null;
  anaTelemetriaInicio: string | null;
  anaTelemetriaFim: string | null;

  // ──────────── Gestão de ciclo de vida ────────────
  /** Soft delete. NULL = ativo. */
  deletedAt: Date | null;
  /** Origem do cadastro (importacao_csv | ana_promocao_* | edicao_manual). */
  origem: string | null;

  createdAt: Date;
  updatedAt: Date;

  // ──────────── Metadados de indexação sob demanda ────────────
  // Populados pelo use-case obter-ficha a partir do repositório de indexação.
  // Permanecem opcionais para compatibilidade com fontes (mock/v1) que ainda
  // não preenchem esses campos.
  /** Momento da última indexação bem-sucedida do acervo do posto. */
  indexadoEm?: Date | null;
  /** Quando a entrada de cache expira (TTL 24h). */
  indexExpiraEm?: Date | null;
  /** Estado atual da indexação — usado pelo BadgeIndexacao. */
  statusIndexacao?: 'ok' | 'stale' | 'ausente' | 'indexando';
}
