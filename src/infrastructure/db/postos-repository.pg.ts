import 'server-only';
import type {
  CamposEditaveisPosto,
  ContextoAtorPosto,
  DadosCriacaoPosto,
  ParametrosPesquisa,
  PostoSugestao,
  PostosRepository,
  ResultadoPesquisa,
} from '@/application/ports/postos-repository';
import type { Posto } from '@/domain/posto';
import {
  FalhaRepositorio,
  PostoNaoEncontrado,
  PostoRemovido,
  PrefixoDuplicado,
} from '@/domain/errors';
import { sql } from './client';

type LinhaPosto = {
  id: string;
  prefixo: string;
  mantenedor: string | null;
  prefixo_ana: string | null;
  nome_estacao: string | null;
  operacao_inicio_ano: number | null;
  operacao_fim_ano: number | null;
  latitude: string | null;
  longitude: string | null;
  municipio: string | null;
  municipio_alt: string | null;
  bacia_hidrografica: string | null;
  ugrhi_nome: string | null;
  ugrhi_numero: string | null;
  sub_ugrhi_nome: string | null;
  sub_ugrhi_numero: string | null;
  proprietario: string | null;
  tipo_posto: string | null;
  area_km2: string | null;
  convencional: string | null;
  logger_eqp: string | null;
  telemetrico: string | null;
  nivel: string | null;
  vazao: string | null;
  aquifero: string | null;
  altimetria: string | null;
  ana_escala_inicio: Date | null;
  ana_escala_fim: Date | null;
  ana_descarga_liquida_inicio: Date | null;
  ana_descarga_liquida_fim: Date | null;
  ana_sedimentos_inicio: Date | null;
  ana_sedimentos_fim: Date | null;
  ana_qualidade_inicio: Date | null;
  ana_qualidade_fim: Date | null;
  ana_pluviometro_inicio: Date | null;
  ana_pluviometro_fim: Date | null;
  ana_telemetria_inicio: Date | null;
  ana_telemetria_fim: Date | null;
  deleted_at: Date | null;
  origem: string | null;
  created_at: Date;
  updated_at: Date;
};

function isoDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function mapear(linha: LinhaPosto): Posto {
  return {
    id: linha.id,
    prefixo: linha.prefixo,
    mantenedor: linha.mantenedor,
    prefixoAna: linha.prefixo_ana,
    nomeEstacao: linha.nome_estacao,
    operacaoInicioAno: linha.operacao_inicio_ano,
    operacaoFimAno: linha.operacao_fim_ano,
    latitude: linha.latitude !== null ? Number(linha.latitude) : null,
    longitude: linha.longitude !== null ? Number(linha.longitude) : null,
    municipio: linha.municipio,
    municipioAlt: linha.municipio_alt,
    baciaHidrografica: linha.bacia_hidrografica,
    ugrhiNome: linha.ugrhi_nome,
    ugrhiNumero: linha.ugrhi_numero,
    subUgrhiNome: linha.sub_ugrhi_nome,
    subUgrhiNumero: linha.sub_ugrhi_numero,
    proprietario: linha.proprietario,
    tipoPosto: linha.tipo_posto,
    areaKm2: linha.area_km2 !== null ? Number(linha.area_km2) : null,
    convencional: linha.convencional,
    loggerEqp: linha.logger_eqp,
    telemetrico: linha.telemetrico,
    nivel: linha.nivel,
    vazao: linha.vazao,
    aquifero: linha.aquifero,
    altimetria: linha.altimetria !== null ? Number(linha.altimetria) : null,
    anaEscalaInicio: isoDate(linha.ana_escala_inicio),
    anaEscalaFim: isoDate(linha.ana_escala_fim),
    anaDescargaLiquidaInicio: isoDate(linha.ana_descarga_liquida_inicio),
    anaDescargaLiquidaFim: isoDate(linha.ana_descarga_liquida_fim),
    anaSedimentosInicio: isoDate(linha.ana_sedimentos_inicio),
    anaSedimentosFim: isoDate(linha.ana_sedimentos_fim),
    anaQualidadeInicio: isoDate(linha.ana_qualidade_inicio),
    anaQualidadeFim: isoDate(linha.ana_qualidade_fim),
    anaPluviometroInicio: isoDate(linha.ana_pluviometro_inicio),
    anaPluviometroFim: isoDate(linha.ana_pluviometro_fim),
    anaTelemetriaInicio: isoDate(linha.ana_telemetria_inicio),
    anaTelemetriaFim: isoDate(linha.ana_telemetria_fim),
    deletedAt: linha.deleted_at,
    origem: linha.origem,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  };
}

// Criado sob demanda para que o módulo possa ser importado em modo demo
// sem instanciar a conexão PG (ver infrastructure/db/client.ts).
let _colunas: ReturnType<typeof sql> | null = null;
function colunas() {
  if (_colunas) return _colunas;
  _colunas = sql`
    id, prefixo, mantenedor, prefixo_ana, nome_estacao,
    operacao_inicio_ano, operacao_fim_ano, latitude, longitude,
    municipio, municipio_alt, bacia_hidrografica,
    ugrhi_nome, ugrhi_numero, sub_ugrhi_nome, sub_ugrhi_numero,
    proprietario, tipo_posto, area_km2,
    convencional, logger_eqp, telemetrico, nivel, vazao,
    aquifero, altimetria,
    ana_escala_inicio, ana_escala_fim,
    ana_descarga_liquida_inicio, ana_descarga_liquida_fim,
    ana_sedimentos_inicio, ana_sedimentos_fim,
    ana_qualidade_inicio, ana_qualidade_fim,
    ana_pluviometro_inicio, ana_pluviometro_fim,
    ana_telemetria_inicio, ana_telemetria_fim,
    deleted_at, origem,
    created_at, updated_at
  `;
  return _colunas;
}

export const postosRepository: PostosRepository = {
  async buscarPorPrefixo(prefixo) {
    try {
      const linhas = await sql<LinhaPosto[]>`
        SELECT ${colunas()} FROM postos WHERE prefixo = ${prefixo} LIMIT 1
      `;
      return linhas[0] ? mapear(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('buscarPorPrefixo', e);
    }
  },

  async mapaIdsPorPrefixo() {
    try {
      // Apenas as duas colunas necessárias: são milhares de linhas e quem
      // consome quer só o vínculo, não a entidade inteira.
      const linhas = await sql<{ prefixo: string; id: string }[]>`
        SELECT prefixo, id FROM postos WHERE deleted_at IS NULL
      `;
      const mapa = new Map<string, string>();
      for (const l of linhas) mapa.set(l.prefixo, l.id);
      return mapa;
    } catch (e) {
      throw new FalhaRepositorio('mapaIdsPorPrefixo', e);
    }
  },

  async pesquisar(params: ParametrosPesquisa): Promise<ResultadoPesquisa> {
    const offset = (params.pagina - 1) * params.porPagina;

    const termoTsquery = params.termo
      ? params.termo.trim().split(/\s+/).filter(Boolean).join(' & ')
      : null;
    const padraoPrefixo = params.prefixoComecaCom
      ? params.prefixoComecaCom.toUpperCase() + '%'
      : null;

    // Compose WHERE em fragments. postgres.js permite interpolar `sql`frag``
    // dentro de outra query; `sql` vazio é a forma idiomática de "nada".
    const condTermo = termoTsquery
      ? sql`AND busca_tsv @@ to_tsquery('portuguese', f_unaccent(${termoTsquery}))`
      : sql``;
    const condPrefixo = padraoPrefixo
      ? sql`AND prefixo ILIKE ${padraoPrefixo}`
      : sql``;
    const condUgrhi = params.ugrhiNumero
      ? sql`AND ugrhi_numero = ${params.ugrhiNumero}`
      : sql``;
    const condMunicipio = params.municipio
      ? sql`AND f_unaccent(lower(municipio)) = f_unaccent(lower(${params.municipio}))`
      : sql``;
    const condBacia = params.baciaHidrografica
      ? sql`AND f_unaccent(lower(bacia_hidrografica)) = f_unaccent(lower(${params.baciaHidrografica}))`
      : sql``;
    const condTipo = params.tipoPosto
      ? sql`AND tipo_posto = ${params.tipoPosto}`
      : sql``;
    const condTelem = params.temTelemetrico
      ? sql`AND telemetrico IS NOT NULL AND telemetrico <> ''`
      : sql``;
    const condFavoritos =
      params.apenasFavoritos && params.usuarioId
        ? sql`AND EXISTS (
            SELECT 1 FROM postos_favoritos f
             WHERE f.prefixo = postos.prefixo
               AND f.usuario_id = ${params.usuarioId}::uuid
          )`
        : sql``;

    // Mantenedor — match em `mantenedor`. Casava também em `btl` até 03/09/2026,
    // quando o campo saiu do domínio por não ter origem no `Dbfch`. O adaptador
    // do SQL Server nunca casou `btl`, então esta linha era uma divergência
    // silenciosa: a mesma faceta filtrava diferente conforme a origem ligada.
    const condMantenedor = params.mantenedor
      ? sql`AND mantenedor = ${params.mantenedor}`
      : sql``;

    // Status operacional — heurística de recência (ADR pendente, ver
    // knowledge-base 2026-04-28). A coluna `operacao_fim_ano` no SPÁguas
    // não significa só "ano em que parou": pra postos ativos a planilha
    // preenche com o ano da última varredura (2024/2025), pra postos
    // extintos preenche com o ano real de baixa, e usa 0 como sentinela
    // "sem dado". Por isso `IS NULL` sozinho retornava só 20 postos.
    //
    // Regra adotada (revisar com cliente SPÁguas):
    //   ativo      = NULL  OR  ano >= ano_corrente - 1
    //   desativado = ano > 0 AND ano < ano_corrente - 1   (0 cai aqui)
    const condStatus =
      params.status === 'ativo'
        ? sql`AND (operacao_fim_ano IS NULL
                   OR operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1)`
        : params.status === 'desativado'
          ? sql`AND operacao_fim_ano > 0
                AND operacao_fim_ano < EXTRACT(YEAR FROM CURRENT_DATE)::int - 1`
          : sql``;

    // Bounding box geográfica — sem PostGIS. Tolerância ±0.01° (~1 km em SP)
    // cobre arredondamento de coordenadas coladas de Google Maps/GPS sem
    // estourar a query. Pra raio real, faltaria PostGIS + ST_DWithin.
    const TOLERANCIA_GRAUS = 0.01;
    const condCoord =
      typeof params.latitude === 'number' &&
      typeof params.longitude === 'number'
        ? sql`AND latitude  BETWEEN ${params.latitude - TOLERANCIA_GRAUS} AND ${params.latitude + TOLERANCIA_GRAUS}
              AND longitude BETWEEN ${params.longitude - TOLERANCIA_GRAUS} AND ${params.longitude + TOLERANCIA_GRAUS}`
        : sql``;

    try {
      const [linhas, contagem] = await Promise.all([
        sql<LinhaPosto[]>`
          SELECT ${colunas()} FROM postos
           WHERE true
           ${condTermo}
           ${condPrefixo}
           ${condUgrhi}
           ${condMunicipio}
           ${condBacia}
           ${condTipo}
           ${condMantenedor}
           ${condStatus}
           ${condCoord}
           ${condTelem}
           ${condFavoritos}
           ORDER BY prefixo
           LIMIT ${params.porPagina} OFFSET ${offset}
        `,
        sql<{ total: string }[]>`
          SELECT COUNT(*)::text AS total FROM postos
           WHERE true
           ${condTermo}
           ${condPrefixo}
           ${condUgrhi}
           ${condMunicipio}
           ${condBacia}
           ${condTipo}
           ${condMantenedor}
           ${condStatus}
           ${condCoord}
           ${condTelem}
           ${condFavoritos}
        `,
      ]);
      return {
        total: Number(contagem[0]?.total ?? 0),
        itens: linhas.map(mapear),
      };
    } catch (e) {
      throw new FalhaRepositorio('pesquisar', e);
    }
  },

  async autocompletar(termo: string, limite: number): Promise<PostoSugestao[]> {
    const t = termo.trim();
    if (t.length < 2) return [];

    // Prefixo ILIKE casa começo do código (caso típico de digitação de prefixo);
    // nome e prefixo ANA usam contains com unaccent para tolerar acento.
    const prefixoPadrao = t.toUpperCase() + '%';
    const containsPadrao = '%' + t + '%';

    try {
      const linhas = await sql<
        Array<{
          prefixo: string;
          nome_estacao: string | null;
          tipo_posto: string | null;
          prefixo_ana: string | null;
        }>
      >`
        SELECT prefixo, nome_estacao, tipo_posto, prefixo_ana
          FROM postos
         WHERE deleted_at IS NULL
           AND (
             prefixo ILIKE ${prefixoPadrao}
             OR prefixo_ana ILIKE ${prefixoPadrao}
             OR f_unaccent(lower(nome_estacao)) LIKE f_unaccent(lower(${containsPadrao}))
           )
         ORDER BY prefixo
         LIMIT ${limite}
      `;
      return linhas.map((l) => ({
        prefixo: l.prefixo,
        nome: l.nome_estacao,
        tipoPosto: l.tipo_posto,
        prefixoAna: l.prefixo_ana,
      }));
    } catch (e) {
      throw new FalhaRepositorio('autocompletar', e);
    }
  },

  async atualizar(prefixo, campos, ator) {
    try {
      return await sql.begin(async (tx) => {
        const antes = await tx<LinhaPosto[]>`
          SELECT ${colunas()} FROM postos
           WHERE prefixo = ${prefixo}
             FOR UPDATE
        `;
        if (!antes[0]) {
          throw new PostoNaoEncontrado(prefixo);
        }
        if (antes[0].deleted_at !== null) {
          throw new PostoRemovido(prefixo);
        }

        const valoresAntes = mapear(antes[0]);
        const setExprs = construirSetExprs(campos);
        if (setExprs.length === 0) {
          // Nada a atualizar
          return valoresAntes;
        }

        await tx`
          UPDATE postos
             SET ${setExprs.reduce((acc, e, i) =>
                    i === 0 ? e : sql`${acc}, ${e}`,
                    sql``)},
                 updated_at = NOW()
           WHERE prefixo = ${prefixo}
        `;

        await tx`
          INSERT INTO postos_evento
            (posto_id, evento, ator_id, valores_antes, valores_depois,
             origem_evento, referencia_externa_id, observacao, ip, user_agent)
          VALUES (
            ${antes[0].id},
            'atualizado',
            ${ator.usuarioId},
            ${JSON.stringify(extrairCamposAuditados(valoresAntes, campos))}::jsonb,
            ${JSON.stringify(campos)}::jsonb,
            ${ator.origemEvento ?? 'ui_edicao'},
            ${ator.referenciaExternaId ?? null}::uuid,
            ${ator.observacao ?? null},
            ${ator.ip}::inet,
            ${ator.userAgent}
          )
        `;

        const depois = await tx<LinhaPosto[]>`
          SELECT ${colunas()} FROM postos WHERE prefixo = ${prefixo}
        `;
        return mapear(depois[0]!);
      });
    } catch (e) {
      if (
        e instanceof FalhaRepositorio ||
        e instanceof PostoNaoEncontrado ||
        e instanceof PostoRemovido
      ) {
        throw e;
      }
      throw new FalhaRepositorio('atualizar', e);
    }
  },

  async criar(dados, ator) {
    try {
      return await sql.begin(async (tx) => {
        const existente = await tx<{ id: string }[]>`
          SELECT id FROM postos WHERE prefixo = ${dados.prefixo} LIMIT 1
        `;
        if (existente[0]) {
          throw new PrefixoDuplicado(dados.prefixo);
        }

        const inserido = await tx<LinhaPosto[]>`
          INSERT INTO postos (
            prefixo, mantenedor, prefixo_ana, nome_estacao,
            operacao_inicio_ano, operacao_fim_ano, latitude, longitude,
            municipio, municipio_alt, bacia_hidrografica,
            ugrhi_nome, ugrhi_numero, sub_ugrhi_nome, sub_ugrhi_numero,
            proprietario, tipo_posto, area_km2,
            convencional, logger_eqp, telemetrico, nivel, vazao,
            aquifero, altimetria,
            ana_escala_inicio, ana_escala_fim,
            ana_descarga_liquida_inicio, ana_descarga_liquida_fim,
            ana_sedimentos_inicio, ana_sedimentos_fim,
            ana_qualidade_inicio, ana_qualidade_fim,
            ana_pluviometro_inicio, ana_pluviometro_fim,
            ana_telemetria_inicio, ana_telemetria_fim,
            origem
          ) VALUES (
            ${dados.prefixo},
            ${dados.mantenedor ?? null},
            ${dados.prefixoAna ?? null},
            ${dados.nomeEstacao ?? null},
            ${dados.operacaoInicioAno ?? null},
            ${dados.operacaoFimAno ?? null},
            ${dados.latitude ?? null},
            ${dados.longitude ?? null},
            ${dados.municipio ?? null},
            ${dados.municipioAlt ?? null},
            ${dados.baciaHidrografica ?? null},
            ${dados.ugrhiNome ?? null},
            ${dados.ugrhiNumero ?? null},
            ${dados.subUgrhiNome ?? null},
            ${dados.subUgrhiNumero ?? null},
            ${dados.proprietario ?? null},
            ${dados.tipoPosto ?? null},
            ${dados.areaKm2 ?? null},
            ${dados.convencional ?? null},
            ${dados.loggerEqp ?? null},
            ${dados.telemetrico ?? null},
            ${dados.nivel ?? null},
            ${dados.vazao ?? null},
            ${dados.aquifero ?? null},
            ${dados.altimetria ?? null},
            ${dados.anaEscalaInicio ?? null}::date,
            ${dados.anaEscalaFim ?? null}::date,
            ${dados.anaDescargaLiquidaInicio ?? null}::date,
            ${dados.anaDescargaLiquidaFim ?? null}::date,
            ${dados.anaSedimentosInicio ?? null}::date,
            ${dados.anaSedimentosFim ?? null}::date,
            ${dados.anaQualidadeInicio ?? null}::date,
            ${dados.anaQualidadeFim ?? null}::date,
            ${dados.anaPluviometroInicio ?? null}::date,
            ${dados.anaPluviometroFim ?? null}::date,
            ${dados.anaTelemetriaInicio ?? null}::date,
            ${dados.anaTelemetriaFim ?? null}::date,
            ${dados.origem ?? 'edicao_manual'}
          )
          RETURNING ${colunas()}
        `;

        const novo = mapear(inserido[0]!);

        await tx`
          INSERT INTO postos_evento
            (posto_id, evento, ator_id, valores_antes, valores_depois,
             origem_evento, referencia_externa_id, observacao, ip, user_agent)
          VALUES (
            ${novo.id},
            'criado',
            ${ator.usuarioId},
            NULL,
            ${JSON.stringify(dados)}::jsonb,
            ${ator.origemEvento ?? 'ui_edicao'},
            ${ator.referenciaExternaId ?? null}::uuid,
            ${ator.observacao ?? null},
            ${ator.ip}::inet,
            ${ator.userAgent}
          )
        `;

        return novo;
      });
    } catch (e) {
      if (e instanceof FalhaRepositorio || e instanceof PrefixoDuplicado) throw e;
      throw new FalhaRepositorio('criar', e);
    }
  },

  async remover(prefixo, ator) {
    try {
      await sql.begin(async (tx) => {
        const linhas = await tx<LinhaPosto[]>`
          SELECT ${colunas()} FROM postos
           WHERE prefixo = ${prefixo} AND deleted_at IS NULL
             FOR UPDATE
        `;
        if (!linhas[0]) {
          throw new FalhaRepositorio('remover', `posto nao encontrado ou ja removido: ${prefixo}`);
        }
        await tx`
          UPDATE postos SET deleted_at = NOW(), updated_at = NOW()
           WHERE prefixo = ${prefixo}
        `;
        await tx`
          INSERT INTO postos_evento
            (posto_id, evento, ator_id, valores_antes, origem_evento, observacao, ip, user_agent)
          VALUES (
            ${linhas[0].id}, 'removido', ${ator.usuarioId},
            ${JSON.stringify(mapear(linhas[0]))}::jsonb,
            ${ator.origemEvento ?? 'ui_edicao'},
            ${ator.observacao ?? null}, ${ator.ip}::inet, ${ator.userAgent}
          )
        `;
      });
    } catch (e) {
      if (e instanceof FalhaRepositorio) throw e;
      throw new FalhaRepositorio('remover', e);
    }
  },

  async restaurar(prefixo, ator) {
    try {
      return await sql.begin(async (tx) => {
        const linhas = await tx<LinhaPosto[]>`
          SELECT ${colunas()} FROM postos
           WHERE prefixo = ${prefixo} AND deleted_at IS NOT NULL
             FOR UPDATE
        `;
        if (!linhas[0]) {
          throw new FalhaRepositorio('restaurar', `posto nao removido: ${prefixo}`);
        }
        await tx`
          UPDATE postos SET deleted_at = NULL, updated_at = NOW()
           WHERE prefixo = ${prefixo}
        `;
        await tx`
          INSERT INTO postos_evento
            (posto_id, evento, ator_id, origem_evento, observacao, ip, user_agent)
          VALUES (
            ${linhas[0].id}, 'restaurado', ${ator.usuarioId},
            ${ator.origemEvento ?? 'ui_edicao'},
            ${ator.observacao ?? null}, ${ator.ip}::inet, ${ator.userAgent}
          )
        `;
        const depois = await tx<LinhaPosto[]>`
          SELECT ${colunas()} FROM postos WHERE prefixo = ${prefixo}
        `;
        return mapear(depois[0]!);
      });
    } catch (e) {
      if (e instanceof FalhaRepositorio) throw e;
      throw new FalhaRepositorio('restaurar', e);
    }
  },

  async listarEventos(postoId, limite = 20) {
    try {
      const linhas = await sql<
        Array<{
          id: string;
          evento: string;
          ator_email: string | null;
          origem_evento: string | null;
          observacao: string | null;
          valores_antes: unknown;
          valores_depois: unknown;
          ocorreu_em: Date;
        }>
      >`
        SELECT e.id, e.evento,
               (SELECT email FROM auth.users WHERE id = e.ator_id) AS ator_email,
               e.origem_evento, e.observacao,
               e.valores_antes, e.valores_depois,
               e.ocorreu_em
          FROM postos_evento e
         WHERE e.posto_id = ${postoId}
         ORDER BY e.ocorreu_em DESC
         LIMIT ${limite}
      `;
      return linhas.map((l) => ({
        id: l.id,
        evento: l.evento,
        atorEmail: l.ator_email,
        origemEvento: l.origem_evento,
        observacao: l.observacao,
        valoresAntes: l.valores_antes,
        valoresDepois: l.valores_depois,
        ocorreuEm: l.ocorreu_em,
      }));
    } catch (e) {
      throw new FalhaRepositorio('postos.listarEventos', e);
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

const MAP_CAMELCASE_SNAKE: Record<string, string> = {
  mantenedor: 'mantenedor',
  prefixoAna: 'prefixo_ana',
  nomeEstacao: 'nome_estacao',
  operacaoInicioAno: 'operacao_inicio_ano',
  operacaoFimAno: 'operacao_fim_ano',
  latitude: 'latitude',
  longitude: 'longitude',
  municipio: 'municipio',
  municipioAlt: 'municipio_alt',
  baciaHidrografica: 'bacia_hidrografica',
  ugrhiNome: 'ugrhi_nome',
  ugrhiNumero: 'ugrhi_numero',
  subUgrhiNome: 'sub_ugrhi_nome',
  subUgrhiNumero: 'sub_ugrhi_numero',
  proprietario: 'proprietario',
  tipoPosto: 'tipo_posto',
  areaKm2: 'area_km2',
  convencional: 'convencional',
  loggerEqp: 'logger_eqp',
  telemetrico: 'telemetrico',
  nivel: 'nivel',
  vazao: 'vazao',
  aquifero: 'aquifero',
  altimetria: 'altimetria',
  anaEscalaInicio: 'ana_escala_inicio',
  anaEscalaFim: 'ana_escala_fim',
  anaDescargaLiquidaInicio: 'ana_descarga_liquida_inicio',
  anaDescargaLiquidaFim: 'ana_descarga_liquida_fim',
  anaSedimentosInicio: 'ana_sedimentos_inicio',
  anaSedimentosFim: 'ana_sedimentos_fim',
  anaQualidadeInicio: 'ana_qualidade_inicio',
  anaQualidadeFim: 'ana_qualidade_fim',
  anaPluviometroInicio: 'ana_pluviometro_inicio',
  anaPluviometroFim: 'ana_pluviometro_fim',
  anaTelemetriaInicio: 'ana_telemetria_inicio',
  anaTelemetriaFim: 'ana_telemetria_fim',
};

const CAMPOS_DATE = new Set([
  'ana_escala_inicio', 'ana_escala_fim',
  'ana_descarga_liquida_inicio', 'ana_descarga_liquida_fim',
  'ana_sedimentos_inicio', 'ana_sedimentos_fim',
  'ana_qualidade_inicio', 'ana_qualidade_fim',
  'ana_pluviometro_inicio', 'ana_pluviometro_fim',
  'ana_telemetria_inicio', 'ana_telemetria_fim',
]);

function construirSetExprs(campos: CamposEditaveisPosto): Array<ReturnType<typeof sql>> {
  const exprs: Array<ReturnType<typeof sql>> = [];
  for (const [chaveCamel, valor] of Object.entries(campos)) {
    const coluna = MAP_CAMELCASE_SNAKE[chaveCamel];
    if (!coluna) continue;
    if (CAMPOS_DATE.has(coluna)) {
      exprs.push(sql`${sql.unsafe(coluna)} = ${valor as string | null}::date`);
    } else {
      exprs.push(sql`${sql.unsafe(coluna)} = ${valor as never}`);
    }
  }
  return exprs;
}

function extrairCamposAuditados(
  posto: Posto,
  campos: CamposEditaveisPosto,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const postoMap = posto as unknown as Record<string, unknown>;
  for (const chave of Object.keys(campos)) {
    result[chave] = postoMap[chave];
  }
  return result;
}

// Re-export for callers that need the audit context type
export type { ContextoAtorPosto, CamposEditaveisPosto, DadosCriacaoPosto };
