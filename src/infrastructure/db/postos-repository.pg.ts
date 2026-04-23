import 'server-only';
import type {
  ParametrosPesquisa,
  PostosRepository,
  ResultadoPesquisa,
} from '@/application/ports/postos-repository';
import type { Posto } from '@/domain/posto';
import { FalhaRepositorio } from '@/domain/errors';
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
  rede: string | null;
  proprietario: string | null;
  tipo_posto: string | null;
  area_km2: string | null;
  btl: string | null;
  cia_ambiental: string | null;
  cobacia: string | null;
  observacoes: string | null;
  tempo_transmissao: string | null;
  status_pcd: string | null;
  ultima_transmissao: string | null;
  convencional: string | null;
  logger_eqp: string | null;
  telemetrico: string | null;
  nivel: string | null;
  vazao: string | null;
  ficha_inspecao: string | null;
  ultima_data_fi: string | null;
  ficha_descritiva: string | null;
  ultima_atualizacao_fd: string | null;
  aquifero: string | null;
  altimetria: string | null;
  created_at: Date;
  updated_at: Date;
};

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
    rede: linha.rede,
    proprietario: linha.proprietario,
    tipoPosto: linha.tipo_posto,
    areaKm2: linha.area_km2 !== null ? Number(linha.area_km2) : null,
    btl: linha.btl,
    ciaAmbiental: linha.cia_ambiental,
    cobacia: linha.cobacia,
    observacoes: linha.observacoes,
    tempoTransmissao: linha.tempo_transmissao,
    statusPcd: linha.status_pcd,
    ultimaTransmissao: linha.ultima_transmissao,
    convencional: linha.convencional,
    loggerEqp: linha.logger_eqp,
    telemetrico: linha.telemetrico,
    nivel: linha.nivel,
    vazao: linha.vazao,
    fichaInspecao: linha.ficha_inspecao,
    ultimaDataFi: linha.ultima_data_fi,
    fichaDescritiva: linha.ficha_descritiva,
    ultimaAtualizacaoFd: linha.ultima_atualizacao_fd,
    aquifero: linha.aquifero,
    altimetria: linha.altimetria !== null ? Number(linha.altimetria) : null,
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
    rede, proprietario, tipo_posto, area_km2, btl, cia_ambiental,
    cobacia, observacoes, tempo_transmissao, status_pcd,
    ultima_transmissao, convencional, logger_eqp, telemetrico,
    nivel, vazao, ficha_inspecao, ultima_data_fi, ficha_descritiva,
    ultima_atualizacao_fd, aquifero, altimetria,
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
    const condFD = params.temFichaDescritiva
      ? sql`AND ficha_descritiva IS NOT NULL AND ficha_descritiva <> ''`
      : sql``;
    const condFI = params.temFichaInspecao
      ? sql`AND ficha_inspecao IS NOT NULL AND ficha_inspecao <> ''`
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
           ${condFD}
           ${condFI}
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
           ${condFD}
           ${condFI}
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
};
