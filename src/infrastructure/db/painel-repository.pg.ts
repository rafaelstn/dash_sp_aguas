import 'server-only';
import { FalhaRepositorio } from '@/domain/errors';
import type {
  AtividadeRecente,
  ClasseDesconformidade,
  DistribuicaoTipo,
  PainelRepository,
  RankingMantenedor,
  RankingUGRHI,
  ResumoPendencias,
  StatusOperacional,
  TendenciaKPI,
} from '@/application/ports/painel-repository';
import { sql } from './client';

/** Quantos pontos mensais a série do sparkline traz (inclui o mês corrente). */
const MESES_SERIE = 6;

/**
 * Adapter PostgreSQL do PainelRepository (contrato em
 * `@/application/ports/painel-repository`). Consultas somente-leitura,
 * cacheadas em memória por 60 segundos (painel é visualizado; não precisa
 * de live).
 */

const TTL_MS = 60_000;
interface CacheEntry<T> { em: number; dados: T }
const cache: Record<string, CacheEntry<unknown>> = {};

async function memoize<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const agora = Date.now();
  const hit = cache[chave] as CacheEntry<T> | undefined;
  if (hit && agora - hit.em < TTL_MS) return hit.dados;
  const dados = await fn();
  cache[chave] = { em: agora, dados };
  return dados;
}

/**
 * Tendências dos KPIs com base temporal. Uma única query (sem N+1): um
 * `generate_series` produz os marcos de fim de mês dos últimos `MESES_SERIE`
 * meses, e para cada marco contamos cumulativamente.
 *
 *   - total de postos        → COUNT(postos) com created_at <= fim do mês
 *   - distintos com arquivo   → COUNT(DISTINCT prefixo) com indexado_em <= fim
 *   - arquivos órfãos         → COUNT(arquivos_orfaos) com indexado_em <= fim
 *
 * `postosSemArquivos(m) = totalPostos(m) - distintosComArquivo(m)`.
 *
 * O ponto de comparação (`valorAnterior`) é o penúltimo marco, ou seja o
 * fechamento do mês anterior ("vs. mês anterior"). Quando a base é toda
 * importada de uma vez (caso da carga DAEE), a série fica plana; isso é dado
 * real, não maquiagem — o CardKPI lida com delta estável e sparkline chato.
 *
 * KPIs sem dimensão temporal (desconformidades = view derivada; "sem
 * coordenadas" = coordenada não tem data própria de preenchimento) NÃO entram
 * aqui de propósito.
 */
async function serieTendencias(): Promise<ResumoPendencias['tendencias']> {
  const rows = await sql<
    { total_postos: string; com_arquivo: string; orfaos: string }[]
  >`
    WITH marcos AS (
      -- Fim (exclusivo) de cada mês: início do mês seguinte ao marco.
      SELECT (date_trunc('month', CURRENT_DATE)
                - (offset_meses || ' months')::interval
                + interval '1 month') AS fim
        FROM generate_series(${MESES_SERIE - 1}, 0, -1) AS offset_meses
    )
    SELECT
      (SELECT COUNT(*) FROM postos
        WHERE created_at < m.fim)::text AS total_postos,
      (SELECT COUNT(DISTINCT prefixo) FROM arquivos_indexados
        WHERE indexado_em < m.fim)::text AS com_arquivo,
      (SELECT COUNT(*) FROM arquivos_orfaos
        WHERE indexado_em < m.fim)::text AS orfaos
      FROM marcos m
     ORDER BY m.fim ASC
  `;

  const totalPostos = rows.map((r) => Number(r.total_postos));
  const semArquivos = rows.map(
    (r) => Number(r.total_postos) - Number(r.com_arquivo),
  );
  const orfaos = rows.map((r) => Number(r.orfaos));

  return {
    totalPostos: montarTendencia(totalPostos),
    postosSemArquivos: montarTendencia(semArquivos),
    arquivosOrfaos: montarTendencia(orfaos),
  };
}

/**
 * Monta a tendência a partir da série cumulativa. `valorAnterior` é o
 * penúltimo ponto (fechamento do mês anterior). Retorna `undefined` quando
 * não há histórico suficiente (menos de 2 pontos) ou quando todos os pontos
 * são zero (sem dado nenhum → não mostra sparkline nem delta enganoso).
 */
export function montarTendencia(serie: number[]): TendenciaKPI | undefined {
  if (serie.length < 2) return undefined;
  if (serie.every((v) => v === 0)) return undefined;
  return {
    serie,
    valorAnterior: serie[serie.length - 2] ?? 0,
  };
}

export const painelRepository: PainelRepository = {
  async resumoPendencias(): Promise<ResumoPendencias> {
    return memoize('resumo', async () => {
      try {
        const rows = await sql<
          {
            total: string;
            com_arquivos: string;
            com_coord: string;
            com_telem: string;
            desconformes: string;
            orfaos: string;
          }[]
        >`
          SELECT
            p.total,
            p.com_coord,
            p.com_telem,
            (SELECT COUNT(DISTINCT prefixo) FROM arquivos_indexados)::text AS com_arquivos,
            (SELECT COUNT(DISTINCT prefixo) FROM v_postos_desconformes)::text AS desconformes,
            (SELECT COUNT(*) FROM arquivos_orfaos)::text AS orfaos
          FROM (
            SELECT
              COUNT(*)::text AS total,
              COUNT(*) FILTER (
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
              )::text AS com_coord,
              COUNT(*) FILTER (
                WHERE telemetrico IS NOT NULL AND telemetrico <> ''
              )::text AS com_telem
            FROM postos
          ) p
        `;
        const r = rows[0];
        if (!r) throw new Error('Resumo de pendências sem linhas');
        const totalPostos = Number(r.total);
        const postosComArquivos = Number(r.com_arquivos);
        const postosComCoordenadas = Number(r.com_coord);
        const tendencias = await serieTendencias();
        return {
          totalPostos,
          postosComArquivos,
          postosSemArquivos: totalPostos - postosComArquivos,
          postosComCoordenadas,
          postosSemCoordenadas: totalPostos - postosComCoordenadas,
          postosComTelemetria: Number(r.com_telem),
          desconformidadesPostos: Number(r.desconformes),
          arquivosOrfaos: Number(r.orfaos),
          tendencias,
        };
      } catch (e) {
        throw new FalhaRepositorio('painel.resumoPendencias', e);
      }
    });
  },

  async statusOperacional(): Promise<StatusOperacional> {
    return memoize('status_op', async () => {
      try {
        const rows = await sql<
          {
            total: string;
            ativos: string;
            desativados: string;
            indeterminados: string;
          }[]
        >`
          SELECT
            COUNT(*)::text AS total,
            COUNT(*) FILTER (
              WHERE operacao_fim_ano IS NULL
                 OR operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
            )::text AS ativos,
            COUNT(*) FILTER (
              WHERE operacao_fim_ano > 0
                AND operacao_fim_ano < EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
            )::text AS desativados,
            COUNT(*) FILTER (WHERE operacao_fim_ano = 0)::text AS indeterminados
          FROM postos
        `;
        const r = rows[0];
        if (!r) throw new Error('Status operacional sem linhas');
        return {
          total: Number(r.total),
          ativos: Number(r.ativos),
          desativados: Number(r.desativados),
          indeterminados: Number(r.indeterminados),
        };
      } catch (e) {
        throw new FalhaRepositorio('painel.statusOperacional', e);
      }
    });
  },

  async rankingMantenedores(limite = 15): Promise<RankingMantenedor[]> {
    return memoize(`mantenedores:${limite}`, async () => {
      try {
        // Só `mantenedor`. Combinava com `btl` num `UNION ALL` até 03/09/2026,
        // e o campo saiu do domínio por não ter origem no `Dbfch`. Continuar
        // somando `btl` aqui faria o ranking do painel discordar da lista de
        // filtros e da busca, que já não conhecem esse valor: o gestor veria um
        // mantenedor no pódio e não conseguiria filtrar por ele.
        // Cruza com a heurística de status operacional pra contar ativos.
        const rows = await sql<
          { nome: string; total: string; ativos: string }[]
        >`
          WITH mantenedor_unificado AS (
            SELECT id, mantenedor AS valor, operacao_fim_ano FROM postos
             WHERE mantenedor IS NOT NULL AND mantenedor <> ''
          )
          SELECT valor AS nome,
                 COUNT(DISTINCT id)::text AS total,
                 COUNT(DISTINCT id) FILTER (
                   WHERE operacao_fim_ano IS NULL
                      OR operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
                 )::text AS ativos
            FROM mantenedor_unificado
           GROUP BY valor
           ORDER BY COUNT(DISTINCT id) DESC, valor ASC
           LIMIT ${limite}
        `;
        return rows.map((r) => ({
          nome: r.nome,
          total: Number(r.total),
          ativos: Number(r.ativos),
        }));
      } catch (e) {
        throw new FalhaRepositorio('painel.rankingMantenedores', e);
      }
    });
  },

  async distribuicaoPorTipo(): Promise<DistribuicaoTipo[]> {
    return memoize('tipo', async () => {
      try {
        const rows = await sql<{ tipo: string; total: string }[]>`
          SELECT tipo_posto AS tipo, COUNT(*)::text AS total
            FROM postos
           WHERE tipo_posto IS NOT NULL AND tipo_posto <> ''
           GROUP BY tipo_posto
           ORDER BY 2 DESC
        `;
        return rows.map((r) => ({ tipo: r.tipo, total: Number(r.total) }));
      } catch (e) {
        throw new FalhaRepositorio('painel.distribuicaoPorTipo', e);
      }
    });
  },

  async rankingUGRHI(): Promise<RankingUGRHI[]> {
    return memoize('ugrhi', async () => {
      try {
        const rows = await sql<
          {
            numero: string;
            nome: string;
            total: string;
            desconformes: string;
          }[]
        >`
          SELECT p.ugrhi_numero AS numero,
                 COALESCE(MAX(p.ugrhi_nome), p.ugrhi_numero) AS nome,
                 COUNT(DISTINCT p.prefixo)::text AS total,
                 COUNT(DISTINCT p.prefixo) FILTER (WHERE v.id IS NOT NULL)::text AS desconformes
            FROM postos p
            LEFT JOIN v_postos_desconformes v ON v.prefixo = p.prefixo
           WHERE p.ugrhi_numero IS NOT NULL AND p.ugrhi_numero <> ''
           GROUP BY p.ugrhi_numero
           ORDER BY NULLIF(regexp_replace(p.ugrhi_numero, '\\D', '', 'g'), '')::int NULLS LAST
        `;
        return rows.map((r) => {
          const total = Number(r.total);
          const desconformes = Number(r.desconformes);
          return {
            numero: r.numero,
            nome: r.nome,
            total,
            desconformes,
            taxa: total === 0 ? 0 : desconformes / total,
          };
        });
      } catch (e) {
        throw new FalhaRepositorio('painel.rankingUGRHI', e);
      }
    });
  },

  async classesDesconformidade(): Promise<ClasseDesconformidade[]> {
    return memoize('classes', async () => {
      try {
        const rows = await sql<
          { tipo: 'prefixo' | 'prefixo_ana'; classe: string; total: string }[]
        >`
          SELECT 'prefixo'::text AS tipo,
                 classe_prefixo AS classe,
                 COUNT(*)::text AS total
            FROM v_postos_desconformes
           WHERE classe_prefixo IS NOT NULL
           GROUP BY classe_prefixo
          UNION ALL
          SELECT 'prefixo_ana'::text AS tipo,
                 classe_prefixo_ana AS classe,
                 COUNT(*)::text AS total
            FROM v_postos_desconformes
           WHERE classe_prefixo_ana IS NOT NULL
           GROUP BY classe_prefixo_ana
           ORDER BY 3 DESC
        `;
        return rows.map((r) => ({
          tipo: r.tipo,
          classe: r.classe,
          total: Number(r.total),
        }));
      } catch (e) {
        throw new FalhaRepositorio('painel.classesDesconformidade', e);
      }
    });
  },

  async atividadeRecente(): Promise<AtividadeRecente> {
    return memoize('atividade', async () => {
      try {
        const rows = await sql<
          {
            ultima_idx: Date | null;
            status: string | null;
            total_lotes: string;
            arquivos_total: string;
            acessos_hoje: string;
            acessos_7d: string;
          }[]
        >`
          SELECT
            (SELECT MAX(iniciado_em) FROM indexacao_log) AS ultima_idx,
            (SELECT status FROM indexacao_log ORDER BY iniciado_em DESC NULLS LAST LIMIT 1) AS status,
            (SELECT COUNT(DISTINCT lote_indexacao) FROM indexacao_log)::text AS total_lotes,
            (SELECT COUNT(*) FROM arquivos_indexados)::text AS arquivos_total,
            (SELECT COUNT(*) FROM acesso_ficha WHERE DATE(ocorreu_em) = CURRENT_DATE)::text AS acessos_hoje,
            (SELECT COUNT(*) FROM acesso_ficha WHERE ocorreu_em >= NOW() - INTERVAL '7 days')::text AS acessos_7d
        `;
        const r = rows[0];
        if (!r) throw new Error('Atividade recente sem linhas');
        return {
          ultimaIndexacao: r.ultima_idx,
          statusUltimaIndexacao: r.status,
          totalLotesIndexacao: Number(r.total_lotes),
          arquivosIndexadosTotal: Number(r.arquivos_total),
          acessosHoje: Number(r.acessos_hoje),
          acessos7Dias: Number(r.acessos_7d),
        };
      } catch (e) {
        throw new FalhaRepositorio('painel.atividadeRecente', e);
      }
    });
  },
};
