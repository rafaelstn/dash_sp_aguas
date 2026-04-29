import 'server-only';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

/**
 * Agregações para o painel (/painel). Consultas somente-leitura, sem domain
 * logic — por isso fora da pasta de ports. Todas as queries são cacheadas
 * em memória por 60 segundos (panel é visualizado; não precisa de live).
 */

export interface ResumoPendencias {
  totalPostos: number;
  postosComArquivos: number;
  postosSemArquivos: number;
  postosComCoordenadas: number;
  postosSemCoordenadas: number;
  postosComTelemetria: number;
  desconformidadesPostos: number;
  arquivosOrfaos: number;
}

export interface DistribuicaoTipo {
  tipo: string;
  total: number;
}

export interface RankingUGRHI {
  numero: string;
  nome: string;
  total: number;
  desconformes: number;
  taxa: number;
}

export interface ClasseDesconformidade {
  tipo: 'prefixo' | 'prefixo_ana';
  classe: string;
  total: number;
}

export interface AtividadeRecente {
  ultimaIndexacao: Date | null;
  statusUltimaIndexacao: string | null;
  totalLotesIndexacao: number;
  arquivosIndexadosTotal: number;
  acessosHoje: number;
  acessos7Dias: number;
}

/**
 * Distribuição operacional dos postos (heurística de recência sobre
 * `operacao_fim_ano` — ver knowledge-base 2026-04-28).
 *   ativo      = NULL OR ano >= ano_corrente - 1
 *   desativado = ano > 0 AND ano < ano_corrente - 1
 *   indeterminado = ano = 0 (sentinela "sem dado")
 */
export interface StatusOperacional {
  ativos: number;
  desativados: number;
  indeterminados: number;
  total: number;
}

/**
 * Mantenedor — combinação de `mantenedor` + `btl` (mesma lógica das
 * facetas de busca). Total conta postos distintos pra evitar dobrar
 * quando os dois campos têm o mesmo valor no mesmo registro.
 */
export interface RankingMantenedor {
  nome: string;
  total: number;
  ativos: number;
}

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

export const painelRepository = {
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
            (SELECT COUNT(*) FROM postos)::text AS total,
            (SELECT COUNT(DISTINCT prefixo) FROM arquivos_indexados)::text AS com_arquivos,
            (SELECT COUNT(*) FROM postos WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::text AS com_coord,
            (SELECT COUNT(*) FROM postos WHERE telemetrico IS NOT NULL AND telemetrico <> '')::text AS com_telem,
            (SELECT COUNT(DISTINCT prefixo) FROM v_postos_desconformes)::text AS desconformes,
            (SELECT COUNT(*) FROM arquivos_orfaos)::text AS orfaos
        `;
        const r = rows[0];
        if (!r) throw new Error('Resumo de pendências sem linhas');
        const totalPostos = Number(r.total);
        const postosComArquivos = Number(r.com_arquivos);
        const postosComCoordenadas = Number(r.com_coord);
        return {
          totalPostos,
          postosComArquivos,
          postosSemArquivos: totalPostos - postosComArquivos,
          postosComCoordenadas,
          postosSemCoordenadas: totalPostos - postosComCoordenadas,
          postosComTelemetria: Number(r.com_telem),
          desconformidadesPostos: Number(r.desconformes),
          arquivosOrfaos: Number(r.orfaos),
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
        // UNION ALL combina mantenedor + btl, COUNT(DISTINCT id) deduplica.
        // Cruza com a heurística de status operacional pra contar ativos.
        const rows = await sql<
          { nome: string; total: string; ativos: string }[]
        >`
          WITH mantenedor_unificado AS (
            SELECT id, mantenedor AS valor, operacao_fim_ano FROM postos
             WHERE mantenedor IS NOT NULL AND mantenedor <> ''
            UNION ALL
            SELECT id, btl AS valor, operacao_fim_ano FROM postos
             WHERE btl IS NOT NULL AND btl <> ''
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
