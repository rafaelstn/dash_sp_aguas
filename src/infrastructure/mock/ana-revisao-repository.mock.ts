import type { AnaRevisaoRepository } from '@/application/ports/ana-revisao-repository';
import type {
  AnaRevisaoEstacao,
  AnaRevisaoLote,
  ContextoAtor,
  StatusRevisao,
} from '@/domain/ana-revisao';
import { patternDeCenario } from '@/domain/ana-cenarios';

function ilikeMatch(texto: string, pattern: string): boolean {
  const escapado = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('^' + escapado.replace(/%/g, '.*') + '$', 'i');
  return regex.test(texto);
}

/**
 * Mock in-memory do AnaRevisaoRepository, usado em testes e modo demo.
 *
 * Estado fica em closures globais ao módulo. `_resetMockAna()` zera tudo
 * entre testes.
 */

interface EstadoMock {
  lotes: AnaRevisaoLote[];
  estacoes: AnaRevisaoEstacao[];
  /** Audit trail simplificado (test-only) */
  eventos: Array<{
    estacaoId: string;
    evento: string;
    atorId: string;
    valoresAntes: unknown;
    valoresDepois: unknown;
    ocorreuEm: Date;
  }>;
}

let estado: EstadoMock = { lotes: [], estacoes: [], eventos: [] };

export function _resetMockAna(): void {
  estado = { lotes: [], estacoes: [], eventos: [] };
}

export function _seedMockAnaLote(lote: AnaRevisaoLote): void {
  estado.lotes.push(lote);
}

export function _seedMockAnaEstacao(estacao: AnaRevisaoEstacao): void {
  estado.estacoes.push(estacao);
}

export function _eventosMockAna(): EstadoMock['eventos'] {
  return [...estado.eventos];
}

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

function temObservacao(e: AnaRevisaoEstacao): boolean {
  return e.observacoes.length > 0;
}

export const anaRevisaoRepository: AnaRevisaoRepository = {
  async loteAtual() {
    if (estado.lotes.length === 0) return null;
    return estado.lotes[estado.lotes.length - 1]!;
  },

  async resumoPainel(loteId) {
    const ests = estado.estacoes.filter((e) => e.loteId === loteId);
    const lote = estado.lotes.find((l) => l.id === loteId);
    const comObs = ests.filter(temObservacao);
    return {
      loteId,
      loteNome: lote?.nome ?? '',
      prazoResposta: lote?.prazoResposta ?? null,
      totalEstacoes: ests.length,
      totalPendencias: comObs.length,
      operando: comObs.filter((e) => e.operando === true).length,
      desativadas: comObs.filter((e) => e.operando === false).length,
      semMatch: ests.filter((e) => e.postoId === null).length,
      statusPendente: ests.filter((e) => e.status === 'pendente').length,
      statusEmRevisao: ests.filter((e) => e.status === 'em_revisao').length,
      statusRevisada: ests.filter((e) => e.status === 'revisada').length,
      statusDescartada: ests.filter((e) => e.status === 'descartada').length,
      statusPromovida: ests.filter((e) => e.status === 'promovida_a_posto').length,
      divergenciaOk: ests.filter((e) => e.divergenciaMunicipio === 'ok').length,
      divergenciaMargem: ests.filter((e) => e.divergenciaMunicipio === 'margem_aceitavel').length,
      divergenciaDivergente: ests.filter((e) => e.divergenciaMunicipio === 'divergente').length,
      divergenciaSemCoord: ests.filter((e) => e.divergenciaMunicipio === 'sem_coordenada').length,
    };
  },

  async listar(loteId, filtros) {
    let itens = estado.estacoes.filter((e) => e.loteId === loteId);

    if (filtros.operando === 'sim') itens = itens.filter((e) => e.operando === true);
    if (filtros.operando === 'nao') itens = itens.filter((e) => e.operando === false);
    if (filtros.status) {
      itens = itens.filter((e) => e.status === filtros.status);
    } else {
      // Default: só trabalho aberto (alinhado com a query SQL)
      itens = itens.filter(
        (e) => e.status === 'pendente' || e.status === 'em_revisao',
      );
    }
    if (filtros.divergenciaMunicipio) {
      itens = itens.filter((e) => e.divergenciaMunicipio === filtros.divergenciaMunicipio);
    }
    if (filtros.semMatch === true) itens = itens.filter((e) => e.postoId === null);
    if (filtros.semMatch === false) itens = itens.filter((e) => e.postoId !== null);
    if (filtros.busca) {
      const q = filtros.busca.toLowerCase();
      itens = itens.filter(
        (e) =>
          e.codigoAna.toLowerCase().includes(q) ||
          (e.codigoAdicional?.toLowerCase().includes(q) ?? false) ||
          (e.nome?.toLowerCase().includes(q) ?? false),
      );
    }
    if (filtros.cenario) {
      const pattern = patternDeCenario(filtros.cenario);
      if (pattern) {
        itens = itens.filter((e) =>
          e.observacoes.some((o) => ilikeMatch(o, pattern)),
        );
      }
    }

    const total = itens.length;
    const porPagina = Math.min(Math.max(filtros.porPagina ?? 25, 1), 200);
    const pagina = Math.max(filtros.pagina ?? 1, 1);
    const offset = (pagina - 1) * porPagina;

    const paged = itens.slice(offset, offset + porPagina);
    return { itens: paged, total };
  },

  async obterPorCodigo(loteId, codigoAna) {
    return (
      estado.estacoes.find(
        (e) => e.loteId === loteId && e.codigoAna === codigoAna,
      ) ?? null
    );
  },

  async aplicarRevisao(estacaoId, payload, ator) {
    const idx = estado.estacoes.findIndex((e) => e.id === estacaoId);
    if (idx === -1) {
      throw new Error(`estacao ${estacaoId} nao encontrada`);
    }
    const atual = estado.estacoes[idx]!;
    if (!transicaoPermitida(atual.status, payload.novoStatus)) {
      throw new Error(
        `transicao invalida ${atual.status} -> ${payload.novoStatus}`,
      );
    }

    const valoresAntes = { status: atual.status };

    const atualizado: AnaRevisaoEstacao = {
      ...atual,
      status: payload.novoStatus,
      revisadoEm: new Date(),
      atualizadoEm: new Date(),
    };
    estado.estacoes[idx] = atualizado;

    estado.eventos.push({
      estacaoId,
      evento:
        payload.novoStatus === 'descartada'
          ? 'descartada'
          : payload.novoStatus === 'revisada'
            ? 'revisada'
            : 'corrigida_manual',
      atorId: ator.usuarioId,
      valoresAntes,
      valoresDepois: { status: payload.novoStatus },
      ocorreuEm: new Date(),
    });

    return atualizado;
  },

  async aplicarBulk(loteId, acao, ator) {
    if (acao.estacaoIds.length === 0) return { aplicadas: 0, falhadas: 0 };
    if (acao.estacaoIds.length > 500) {
      throw new Error('bulk limitado a 500 estacoes');
    }
    let aplicadas = 0;
    let falhadas = 0;

    for (const id of acao.estacaoIds) {
      const idx = estado.estacoes.findIndex(
        (e) => e.id === id && e.loteId === loteId,
      );
      if (idx === -1) {
        falhadas += 1;
        continue;
      }
      const atual = estado.estacoes[idx]!;
      let novoStatus: StatusRevisao = atual.status;

      if (acao.acao === 'marcar_revisada') novoStatus = 'revisada';
      else if (acao.acao === 'descartar') novoStatus = 'descartada';
      else if (acao.acao === 'restaurar') novoStatus = 'pendente';
      else if (acao.acao === 'aceitar_sugestao_municipio') {
        // FASE 5: correções vão direto pra postos (não há mais JSONB).
        falhadas += 1;
        continue;
      }

      if (!transicaoPermitida(atual.status, novoStatus)) {
        falhadas += 1;
        continue;
      }

      estado.estacoes[idx] = {
        ...atual,
        status: novoStatus,
        revisadoEm: new Date(),
        atualizadoEm: new Date(),
      };

      estado.eventos.push({
        estacaoId: id,
        evento:
          novoStatus === 'descartada'
            ? 'descartada'
            : novoStatus === 'pendente'
              ? 'restaurada'
              : novoStatus === 'revisada'
                ? 'revisada'
                : 'corrigida_manual',
        atorId: ator.usuarioId,
        valoresAntes: { status: atual.status },
        valoresDepois: { status: novoStatus },
        ocorreuEm: new Date(),
      });

      aplicadas += 1;
    }

    return { aplicadas, falhadas };
  },

  async obterSugestaoMatch() {
    // Mock nao modela match sugerido; testes que precisam disso usam o
    // adapter PG real ou stub dedicado.
    return null;
  },

  async contarPorCenario() {
    return 0;
  },

  async detalheSugestaoMatch() {
    return null;
  },

  /**
   * Espelha o adapter PG: vincula a estação ao posto sugerido, marca a revisão
   * como manual e registra o evento. O PG faz as duas escritas numa transação
   * (postos.prefixo_ana e ana_revisao_estacao); aqui o estado é in-memory,
   * então a atomicidade não se aplica, mas o efeito visível na tela é o mesmo.
   */
  async aceitarMatch(params, ator) {
    const idx = estado.estacoes.findIndex((e) => e.id === params.estacaoId);
    if (idx === -1) {
      throw new Error(`estacao ${params.estacaoId} nao encontrada`);
    }
    const atual = estado.estacoes[idx]!;
    if (!transicaoPermitida(atual.status, 'revisada')) {
      throw new Error(`transicao invalida ${atual.status} -> revisada`);
    }

    const agora = new Date();
    estado.estacoes[idx] = {
      ...atual,
      postoId: params.postoIdSugerido,
      matchTipo: 'manual',
      status: 'revisada',
      revisadoEm: agora,
      atualizadoEm: agora,
    };

    estado.eventos.push({
      estacaoId: params.estacaoId,
      evento: 'revisada',
      atorId: ator.usuarioId,
      valoresAntes: { status: atual.status, postoId: atual.postoId },
      valoresDepois: {
        status: 'revisada',
        posto_id: params.postoIdSugerido,
        posto_prefixo: params.prefixoSugerido,
      },
      ocorreuEm: agora,
    });
  },
};

/**
 * Builder usado pelos testes pra criar uma estação ANA com defaults sensatos.
 */
export function _criarEstacaoMock(
  override: Partial<AnaRevisaoEstacao> & {
    id: string;
    loteId: string;
    codigoAna: string;
  },
): AnaRevisaoEstacao {
  return {
    codigoAdicional: null,
    nome: null,
    latitude: null,
    longitude: null,
    altitude: null,
    areaDrenagemKm2: null,
    baciaCodigo: null,
    baciaNome: null,
    subbaciaCodigo: null,
    subbaciaNome: null,
    rioCodigo: null,
    rioNome: null,
    estadoSigla: 'SP',
    municipioCodigo: null,
    municipioNome: null,
    responsavelSigla: null,
    estacaoTipo: null,
    escalaInicio: null,
    escalaFim: null,
    descargaLiquidaInicio: null,
    descargaLiquidaFim: null,
    sedimentosInicio: null,
    sedimentosFim: null,
    qualidadeInicio: null,
    qualidadeFim: null,
    pluviometroInicio: null,
    pluviometroFim: null,
    telemetriaInicio: null,
    telemetriaFim: null,
    operando: null,
    observacoes: [],
    postoId: null,
    postoPrefixo: null,
    matchTipo: null,
    status: 'pendente',
    dentroMunicipioDeclarado: null,
    distanciaMunicipioDeclaradoM: null,
    municipioSugeridoCodigo: null,
    municipioSugeridoNome: null,
    divergenciaMunicipio: null,
    municipioEfetivo: null,
    divergenciaEfetiva: null,
    distanciaEfetivaM: null,
    respostaFonte: null,
    revisadoEm: null,
    atualizadoEm: new Date(),
    ...override,
  };
}

export function _criarLoteMock(
  override: Partial<AnaRevisaoLote> & { id: string; nome: string },
): AnaRevisaoLote {
  return {
    arquivoOrigem: null,
    totalEstacoes: 0,
    totalPendencias: 0,
    prazoResposta: null,
    criadoEm: new Date(),
    ...override,
  };
}

export const META_ATOR: ContextoAtor = {
  usuarioId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ip: '127.0.0.1',
  userAgent: 'vitest',
};
