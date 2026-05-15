import 'server-only';
import type { AnaRevisaoRepository } from '@/application/ports/ana-revisao-repository';
import type {
  AnaRevisaoEstacao,
  AnaRevisaoLote,
  DivergenciaMunicipio,
  MatchTipo,
  StatusRevisao,
} from '@/domain/ana-revisao';
import { FalhaRepositorio } from '@/domain/errors';
import { patternDeCenario } from '@/domain/ana-cenarios';
import { sql } from './client';

// ─────────────────────────────────────────────────────────────────────────
// Tipos do banco (snake_case)
// ─────────────────────────────────────────────────────────────────────────

type LinhaLote = {
  id: string;
  nome: string;
  arquivo_origem: string | null;
  total_estacoes: number;
  total_pendencias: number;
  prazo_resposta: Date | null;
  criado_em: Date;
};

type LinhaEstacao = {
  id: string;
  lote_id: string;
  codigo_ana: string;
  codigo_adicional: string | null;
  nome: string | null;
  latitude: string | null;
  longitude: string | null;
  altitude: string | null;
  area_drenagem_km2: string | null;
  bacia_codigo: string | null;
  bacia_nome: string | null;
  subbacia_codigo: string | null;
  subbacia_nome: string | null;
  rio_codigo: string | null;
  rio_nome: string | null;
  estado_sigla: string | null;
  municipio_codigo: string | null;
  municipio_nome: string | null;
  responsavel_sigla: string | null;
  estacao_tipo: string | null;
  escala_inicio: Date | null;
  escala_fim: Date | null;
  descarga_liquida_inicio: Date | null;
  descarga_liquida_fim: Date | null;
  sedimentos_inicio: Date | null;
  sedimentos_fim: Date | null;
  qualidade_inicio: Date | null;
  qualidade_fim: Date | null;
  pluviometro_inicio: Date | null;
  pluviometro_fim: Date | null;
  telemetria_inicio: Date | null;
  telemetria_fim: Date | null;
  operando: boolean | null;
  observacao_1: string | null;
  observacao_2: string | null;
  observacao_3: string | null;
  observacao_4: string | null;
  observacao_5: string | null;
  posto_id: string | null;
  posto_prefixo: string | null;
  match_tipo: string | null;
  status: string;
  dentro_municipio_declarado: boolean | null;
  distancia_municipio_declarado_m: string | null;
  municipio_sugerido_codigo: string | null;
  municipio_sugerido_nome: string | null;
  divergencia_municipio: string | null;
  revisado_em: Date | null;
  atualizado_em: Date;
};

function isoOuNull(d: Date | null): string | null {
  if (!d) return null;
  // Normaliza pra ISO date (YYYY-MM-DD) sem timezone.
  return d.toISOString().slice(0, 10);
}

function mapearLote(l: LinhaLote): AnaRevisaoLote {
  return {
    id: l.id,
    nome: l.nome,
    arquivoOrigem: l.arquivo_origem,
    totalEstacoes: Number(l.total_estacoes),
    totalPendencias: Number(l.total_pendencias),
    prazoResposta: l.prazo_resposta,
    criadoEm: l.criado_em,
  };
}

function mapearEstacao(l: LinhaEstacao): AnaRevisaoEstacao {
  return {
    id: l.id,
    loteId: l.lote_id,
    codigoAna: l.codigo_ana,
    codigoAdicional: l.codigo_adicional,
    nome: l.nome,
    latitude: l.latitude !== null ? Number(l.latitude) : null,
    longitude: l.longitude !== null ? Number(l.longitude) : null,
    altitude: l.altitude !== null ? Number(l.altitude) : null,
    areaDrenagemKm2:
      l.area_drenagem_km2 !== null ? Number(l.area_drenagem_km2) : null,
    baciaCodigo: l.bacia_codigo,
    baciaNome: l.bacia_nome,
    subbaciaCodigo: l.subbacia_codigo,
    subbaciaNome: l.subbacia_nome,
    rioCodigo: l.rio_codigo,
    rioNome: l.rio_nome,
    estadoSigla: l.estado_sigla,
    municipioCodigo: l.municipio_codigo,
    municipioNome: l.municipio_nome,
    responsavelSigla: l.responsavel_sigla,
    estacaoTipo: l.estacao_tipo,
    escalaInicio: isoOuNull(l.escala_inicio),
    escalaFim: isoOuNull(l.escala_fim),
    descargaLiquidaInicio: isoOuNull(l.descarga_liquida_inicio),
    descargaLiquidaFim: isoOuNull(l.descarga_liquida_fim),
    sedimentosInicio: isoOuNull(l.sedimentos_inicio),
    sedimentosFim: isoOuNull(l.sedimentos_fim),
    qualidadeInicio: isoOuNull(l.qualidade_inicio),
    qualidadeFim: isoOuNull(l.qualidade_fim),
    pluviometroInicio: isoOuNull(l.pluviometro_inicio),
    pluviometroFim: isoOuNull(l.pluviometro_fim),
    telemetriaInicio: isoOuNull(l.telemetria_inicio),
    telemetriaFim: isoOuNull(l.telemetria_fim),
    operando: l.operando,
    observacoes: [
      l.observacao_1,
      l.observacao_2,
      l.observacao_3,
      l.observacao_4,
      l.observacao_5,
    ].filter((v): v is string => Boolean(v)),
    postoId: l.posto_id,
    postoPrefixo: l.posto_prefixo,
    matchTipo: (l.match_tipo as MatchTipo) ?? null,
    status: l.status as StatusRevisao,
    dentroMunicipioDeclarado: l.dentro_municipio_declarado,
    distanciaMunicipioDeclaradoM:
      l.distancia_municipio_declarado_m !== null
        ? Number(l.distancia_municipio_declarado_m)
        : null,
    municipioSugeridoCodigo: l.municipio_sugerido_codigo,
    municipioSugeridoNome: l.municipio_sugerido_nome,
    divergenciaMunicipio: (l.divergencia_municipio as DivergenciaMunicipio) ?? null,
    revisadoEm: l.revisado_em,
    atualizadoEm: l.atualizado_em,
  };
}

// Transições válidas de status (defesa em profundidade)
const TRANSICOES: Record<StatusRevisao, StatusRevisao[]> = {
  pendente: ['em_revisao', 'revisada', 'descartada', 'sem_match'],
  em_revisao: ['revisada', 'descartada', 'pendente'],
  revisada: ['em_revisao', 'descartada', 'promovida_a_posto'],
  descartada: ['pendente', 'em_revisao'],
  sem_match: ['em_revisao', 'descartada', 'promovida_a_posto'],
  promovida_a_posto: [],
};

function transicaoPermitida(de: StatusRevisao, para: StatusRevisao): boolean {
  if (de === para) return true;
  return TRANSICOES[de]?.includes(para) ?? false;
}

// ─────────────────────────────────────────────────────────────────────────
// Implementação
// ─────────────────────────────────────────────────────────────────────────

export const anaRevisaoRepository: AnaRevisaoRepository = {
  async loteAtual() {
    try {
      const linhas = await sql<LinhaLote[]>`
        SELECT id, nome, arquivo_origem, total_estacoes, total_pendencias,
               prazo_resposta, criado_em
          FROM ana_revisao_lote
         ORDER BY criado_em DESC
         LIMIT 1
      `;
      return linhas[0] ? mapearLote(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('anaRevisao.loteAtual', e);
    }
  },

  async resumoPainel(loteId) {
    try {
      const linhas = await sql<
        Array<{
          lote_nome: string;
          prazo_resposta: Date | null;
          total_estacoes: number;
          total_pendencias: number;
          operando: number;
          desativadas: number;
          sem_match: number;
          status_pendente: number;
          status_em_revisao: number;
          status_revisada: number;
          status_descartada: number;
          status_promovida: number;
          div_ok: number;
          div_margem: number;
          div_divergente: number;
          div_sem_coord: number;
          total_pendencias_reais: number;
        }>
      >`
        SELECT
          (SELECT nome FROM ana_revisao_lote WHERE id = ${loteId})           AS lote_nome,
          (SELECT prazo_resposta FROM ana_revisao_lote WHERE id = ${loteId}) AS prazo_resposta,
          (SELECT total_estacoes FROM ana_revisao_lote WHERE id = ${loteId}) AS total_estacoes,
          (SELECT total_pendencias FROM ana_revisao_lote WHERE id = ${loteId}) AS total_pendencias,
          -- "Pendente": estação ANA com observação E status que ainda pede ação.
          -- Promovida/revisada/descartada SAI da contagem (já resolvida).
          COUNT(*) FILTER (WHERE e.operando = TRUE
            AND e.status NOT IN ('revisada', 'promovida_a_posto', 'descartada')
            AND (e.observacao_1 IS NOT NULL OR e.observacao_2 IS NOT NULL
              OR e.observacao_3 IS NOT NULL OR e.observacao_4 IS NOT NULL
              OR e.observacao_5 IS NOT NULL))::int AS operando,
          COUNT(*) FILTER (WHERE e.operando = FALSE
            AND e.status NOT IN ('revisada', 'promovida_a_posto', 'descartada')
            AND (e.observacao_1 IS NOT NULL OR e.observacao_2 IS NOT NULL
              OR e.observacao_3 IS NOT NULL OR e.observacao_4 IS NOT NULL
              OR e.observacao_5 IS NOT NULL))::int AS desativadas,
          -- Sem match: ainda pendente de cadastro (não conta o que já foi descartado)
          COUNT(*) FILTER (WHERE e.posto_id IS NULL
            AND e.status NOT IN ('revisada', 'promovida_a_posto', 'descartada'))::int AS sem_match,
          -- Andamento da revisão: conta APENAS estações com observação ANA.
          -- As 1.668 sem observação ficaram com status=pendente por default
          -- do import, mas não precisam ação — não inflamos a UI com elas.
          COUNT(*) FILTER (WHERE e.status = 'pendente'
            AND (e.observacao_1 IS NOT NULL OR e.observacao_2 IS NOT NULL
              OR e.observacao_3 IS NOT NULL OR e.observacao_4 IS NOT NULL
              OR e.observacao_5 IS NOT NULL))::int AS status_pendente,
          COUNT(*) FILTER (WHERE e.status = 'em_revisao'
            AND (e.observacao_1 IS NOT NULL OR e.observacao_2 IS NOT NULL
              OR e.observacao_3 IS NOT NULL OR e.observacao_4 IS NOT NULL
              OR e.observacao_5 IS NOT NULL))::int AS status_em_revisao,
          COUNT(*) FILTER (WHERE e.status = 'revisada'
            AND (e.observacao_1 IS NOT NULL OR e.observacao_2 IS NOT NULL
              OR e.observacao_3 IS NOT NULL OR e.observacao_4 IS NOT NULL
              OR e.observacao_5 IS NOT NULL))::int AS status_revisada,
          COUNT(*) FILTER (WHERE e.status = 'descartada'
            AND (e.observacao_1 IS NOT NULL OR e.observacao_2 IS NOT NULL
              OR e.observacao_3 IS NOT NULL OR e.observacao_4 IS NOT NULL
              OR e.observacao_5 IS NOT NULL))::int AS status_descartada,
          COUNT(*) FILTER (WHERE e.status = 'promovida_a_posto'
            AND (e.observacao_1 IS NOT NULL OR e.observacao_2 IS NOT NULL
              OR e.observacao_3 IS NOT NULL OR e.observacao_4 IS NOT NULL
              OR e.observacao_5 IS NOT NULL))::int AS status_promovida,
          -- Divergência geo: contagem PENDENTE (postos.divergencia_municipio é a verdade,
          -- não a coluna em ana_revisao_estacao que é snapshot da planilha).
          -- Quando posto associado está OK ou margem_aceitavel, NÃO conta como divergência pendente.
          COUNT(*) FILTER (WHERE
            COALESCE(p.divergencia_municipio, e.divergencia_municipio) = 'ok'
          )::int AS div_ok,
          COUNT(*) FILTER (WHERE
            COALESCE(p.divergencia_municipio, e.divergencia_municipio) = 'margem_aceitavel'
          )::int AS div_margem,
          COUNT(*) FILTER (WHERE
            COALESCE(p.divergencia_municipio, e.divergencia_municipio) = 'divergente'
            AND e.status NOT IN ('revisada', 'promovida_a_posto', 'descartada')
          )::int AS div_divergente,
          COUNT(*) FILTER (WHERE
            COALESCE(p.divergencia_municipio, e.divergencia_municipio) = 'sem_coordenada'
          )::int AS div_sem_coord,
          -- Pendentes reais: tem observação E ainda precisa ação
          COUNT(*) FILTER (WHERE
            (e.observacao_1 IS NOT NULL OR e.observacao_2 IS NOT NULL
              OR e.observacao_3 IS NOT NULL OR e.observacao_4 IS NOT NULL
              OR e.observacao_5 IS NOT NULL)
            AND e.status NOT IN ('revisada', 'promovida_a_posto', 'descartada')
          )::int AS total_pendencias_reais
        FROM ana_revisao_estacao e
        LEFT JOIN postos p ON p.id = e.posto_id AND p.deleted_at IS NULL
        WHERE e.lote_id = ${loteId}
      `;
      const r = linhas[0];
      if (!r) {
        return {
          loteId,
          loteNome: '',
          prazoResposta: null,
          totalEstacoes: 0,
          totalPendencias: 0,
          operando: 0,
          desativadas: 0,
          semMatch: 0,
          statusPendente: 0,
          statusEmRevisao: 0,
          statusRevisada: 0,
          statusDescartada: 0,
          statusPromovida: 0,
          divergenciaOk: 0,
          divergenciaMargem: 0,
          divergenciaDivergente: 0,
          divergenciaSemCoord: 0,
        };
      }
      return {
        loteId,
        loteNome: r.lote_nome ?? '',
        prazoResposta: r.prazo_resposta,
        totalEstacoes: Number(r.total_estacoes ?? 0),
        // totalPendencias agora vem do COUNT real (status ainda não revisada/promovida/descartada).
        // O r.total_pendencias original da tabela lote era o snapshot do import, não o estado atual.
        totalPendencias: Number(r.total_pendencias_reais ?? r.total_pendencias ?? 0),
        operando: Number(r.operando ?? 0),
        desativadas: Number(r.desativadas ?? 0),
        semMatch: Number(r.sem_match ?? 0),
        statusPendente: Number(r.status_pendente ?? 0),
        statusEmRevisao: Number(r.status_em_revisao ?? 0),
        statusRevisada: Number(r.status_revisada ?? 0),
        statusDescartada: Number(r.status_descartada ?? 0),
        statusPromovida: Number(r.status_promovida ?? 0),
        divergenciaOk: Number(r.div_ok ?? 0),
        divergenciaMargem: Number(r.div_margem ?? 0),
        divergenciaDivergente: Number(r.div_divergente ?? 0),
        divergenciaSemCoord: Number(r.div_sem_coord ?? 0),
      };
    } catch (e) {
      throw new FalhaRepositorio('anaRevisao.resumoPainel', e);
    }
  },

  async listar(loteId, filtros) {
    try {
      const porPagina = Math.min(Math.max(filtros.porPagina ?? 25, 1), 200);
      const pagina = Math.max(filtros.pagina ?? 1, 1);
      const offset = (pagina - 1) * porPagina;

      // Filtro de cenário: a planilha ANA marca o cenário no início da
      // OBSERVAÇÃO 1, ex "[PLUVIÔMETRO] SEM DATA FIM..." ou texto livre
      // ("VERIFICAR AS COORDENADAS"). Casamos a chave estável vinda do URL
      // (ex VERIFICAR_COORD) ao pattern real ('VERIFICAR%COORDENADAS%') via
      // CENARIOS_ANA em src/domain/ana-cenarios.ts. Se a chave for desconhecida,
      // ignoramos o filtro em vez de aplicar pattern literal sem sentido.
      const cenarioPattern = patternDeCenario(filtros.cenario);

      // Operando
      const filtroOperando =
        filtros.operando === 'sim'
          ? sql`AND e.operando = TRUE`
          : filtros.operando === 'nao'
            ? sql`AND e.operando = FALSE`
            : sql``;

      // Status
      const filtroStatus = filtros.status
        ? sql`AND e.status = ${filtros.status}`
        : sql``;

      // Divergência
      const filtroDivergencia = filtros.divergenciaMunicipio
        ? sql`AND e.divergencia_municipio = ${filtros.divergenciaMunicipio}`
        : sql``;

      // Sem match
      const filtroSemMatch =
        filtros.semMatch === true
          ? sql`AND e.posto_id IS NULL`
          : filtros.semMatch === false
            ? sql`AND e.posto_id IS NOT NULL`
            : sql``;

      // Cenário
      const filtroCenario = cenarioPattern
        ? sql`AND (
            e.observacao_1 ILIKE ${cenarioPattern}
            OR e.observacao_2 ILIKE ${cenarioPattern}
            OR e.observacao_3 ILIKE ${cenarioPattern}
            OR e.observacao_4 ILIKE ${cenarioPattern}
            OR e.observacao_5 ILIKE ${cenarioPattern}
          )`
        : sql``;

      // Busca livre por código ANA, código adicional ou nome
      const buscaTrim = (filtros.busca ?? '').trim();
      const filtroBusca = buscaTrim
        ? sql`AND (
            e.codigo_ana ILIKE ${`%${buscaTrim}%`}
            OR e.codigo_adicional ILIKE ${`%${buscaTrim}%`}
            OR e.nome ILIKE ${`%${buscaTrim}%`}
          )`
        : sql``;

      // Total
      const totalLinhas = await sql<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
          FROM ana_revisao_estacao e
         WHERE e.lote_id = ${loteId}
           ${filtroOperando}
           ${filtroStatus}
           ${filtroDivergencia}
           ${filtroSemMatch}
           ${filtroCenario}
           ${filtroBusca}
      `;
      const total = Number(totalLinhas[0]?.total ?? 0);

      // Itens
      const itens = await sql<LinhaEstacao[]>`
        SELECT e.*, p.prefixo AS posto_prefixo
          FROM ana_revisao_estacao e
          LEFT JOIN postos p ON p.id = e.posto_id
         WHERE e.lote_id = ${loteId}
           ${filtroOperando}
           ${filtroStatus}
           ${filtroDivergencia}
           ${filtroSemMatch}
           ${filtroCenario}
           ${filtroBusca}
         ORDER BY
           CASE
             WHEN e.divergencia_municipio = 'divergente' THEN 0
             WHEN e.divergencia_municipio = 'margem_aceitavel' THEN 1
             ELSE 2
           END,
           e.operando DESC NULLS LAST,
           e.codigo_ana
         LIMIT ${porPagina} OFFSET ${offset}
      `;

      return {
        itens: itens.map(mapearEstacao),
        total,
      };
    } catch (e) {
      throw new FalhaRepositorio('anaRevisao.listar', e);
    }
  },

  async obterPorCodigo(loteId, codigoAna) {
    try {
      const linhas = await sql<LinhaEstacao[]>`
        SELECT e.*, p.prefixo AS posto_prefixo
          FROM ana_revisao_estacao e
          LEFT JOIN postos p ON p.id = e.posto_id
         WHERE e.lote_id = ${loteId}
           AND e.codigo_ana = ${codigoAna}
         LIMIT 1
      `;
      return linhas[0] ? mapearEstacao(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('anaRevisao.obterPorCodigo', e);
    }
  },

  async aplicarRevisao(estacaoId, payload, ator) {
    try {
      // Lê estado atual (transação)
      return await sql.begin(async (tx) => {
        const linhas = await tx<LinhaEstacao[]>`
          SELECT e.*, p.prefixo AS posto_prefixo
            FROM ana_revisao_estacao e
            LEFT JOIN postos p ON p.id = e.posto_id
           WHERE e.id = ${estacaoId}
             FOR UPDATE
        `;
        const atual = linhas[0];
        if (!atual) {
          throw new FalhaRepositorio('anaRevisao.aplicarRevisao', 'estacao nao encontrada');
        }
        const statusAtual = atual.status as StatusRevisao;
        if (!transicaoPermitida(statusAtual, payload.novoStatus)) {
          throw new FalhaRepositorio(
            'anaRevisao.aplicarRevisao',
            `transicao invalida ${statusAtual} -> ${payload.novoStatus}`,
          );
        }

        const valoresAntes = { status: atual.status };

        await tx`
          UPDATE ana_revisao_estacao
             SET status = ${payload.novoStatus},
                 revisado_por = ${ator.usuarioId},
                 revisado_em = NOW()
           WHERE id = ${estacaoId}
        `;

        // Audit trail
        const evento =
          payload.novoStatus === 'descartada'
            ? 'descartada'
            : payload.novoStatus === 'revisada'
              ? 'revisada'
              : 'corrigida_manual';

        await tx`
          INSERT INTO ana_revisao_evento
            (estacao_id, evento, ator_id, valores_antes, valores_depois, observacao, ip, user_agent)
          VALUES (
            ${estacaoId},
            ${evento},
            ${ator.usuarioId},
            ${JSON.stringify(valoresAntes)}::jsonb,
            ${JSON.stringify({ status: payload.novoStatus })}::jsonb,
            ${payload.observacao ?? null},
            ${ator.ip}::inet,
            ${ator.userAgent}
          )
        `;

        // Retorna estado final
        const atualizadas = await tx<LinhaEstacao[]>`
          SELECT e.*, p.prefixo AS posto_prefixo
            FROM ana_revisao_estacao e
            LEFT JOIN postos p ON p.id = e.posto_id
           WHERE e.id = ${estacaoId}
        `;
        return mapearEstacao(atualizadas[0]!);
      });
    } catch (e) {
      if (e instanceof FalhaRepositorio) throw e;
      throw new FalhaRepositorio('anaRevisao.aplicarRevisao', e);
    }
  },

  async aplicarBulk(loteId, acao, ator) {
    try {
      if (acao.estacaoIds.length === 0) {
        return { aplicadas: 0, falhadas: 0 };
      }
      if (acao.estacaoIds.length > 500) {
        throw new FalhaRepositorio(
          'anaRevisao.aplicarBulk',
          'bulk limitado a 500 estacoes por requisicao',
        );
      }

      return await sql.begin(async (tx) => {
        // Carrega estações selecionadas (com lock)
        const linhas = await tx<LinhaEstacao[]>`
          SELECT e.*, p.prefixo AS posto_prefixo
            FROM ana_revisao_estacao e
            LEFT JOIN postos p ON p.id = e.posto_id
           WHERE e.lote_id = ${loteId}
             AND e.id = ANY(${acao.estacaoIds})
             FOR UPDATE
        `;

        let aplicadas = 0;
        let falhadas = 0;

        for (const atual of linhas) {
          const statusAtual = atual.status as StatusRevisao;
          let novoStatus: StatusRevisao = statusAtual;
          let evento = 'corrigida_manual';

          if (acao.acao === 'marcar_revisada') {
            novoStatus = 'revisada';
            evento = 'revisada';
          } else if (acao.acao === 'descartar') {
            novoStatus = 'descartada';
            evento = 'descartada';
          } else if (acao.acao === 'restaurar') {
            novoStatus = 'pendente';
            evento = 'restaurada';
          } else if (acao.acao === 'aceitar_sugestao_municipio') {
            // FASE 5: correções agora vão direto pra postos via PATCH
            // /api/postos/[prefixo]. Bulk de aceitar sugestão de município
            // foi removido; usar a UI individual.
            falhadas += 1;
            continue;
          }

          if (!transicaoPermitida(statusAtual, novoStatus)) {
            falhadas += 1;
            continue;
          }

          await tx`
            UPDATE ana_revisao_estacao
               SET status = ${novoStatus},
                   revisado_por = ${ator.usuarioId},
                   revisado_em = NOW()
             WHERE id = ${atual.id}
          `;

          await tx`
            INSERT INTO ana_revisao_evento
              (estacao_id, evento, ator_id, valores_antes, valores_depois, observacao, ip, user_agent)
            VALUES (
              ${atual.id},
              ${evento},
              ${ator.usuarioId},
              ${JSON.stringify({ status: atual.status })}::jsonb,
              ${JSON.stringify({ status: novoStatus })}::jsonb,
              ${acao.justificativa ?? null},
              ${ator.ip}::inet,
              ${ator.userAgent}
            )
          `;
          aplicadas += 1;
        }

        return { aplicadas, falhadas };
      });
    } catch (e) {
      if (e instanceof FalhaRepositorio) throw e;
      throw new FalhaRepositorio('anaRevisao.aplicarBulk', e);
    }
  },
};
