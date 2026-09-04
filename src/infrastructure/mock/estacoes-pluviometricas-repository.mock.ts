import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EstacoesPluviometricasRepository } from '@/application/ports/estacoes-pluviometricas-repository';
import type { EstacaoPluviometrica } from '@/domain/monitor/estacao-pluviometrica';
import { normalizarTimestampSibh } from '@/domain/monitor/timestamp-sibh';

/**
 * Adapter in-memory de EstacoesPluviometricasRepository (MODO DEMO).
 * Armazenamento por processo, indexado por id. Perde dados ao reiniciar.
 */
const armazenamento = new Map<string, EstacaoPluviometrica>();

/** Reset de estado entre testes (segue o padrão `_resetTriagemMock`). */
export function _resetEstacoesPluviometricasMock(): void {
  armazenamento.clear();
}

export const estacoesPluviometricasRepository: EstacoesPluviometricasRepository = {
  async listar(filtros) {
    return Array.from(armazenamento.values())
      .filter((e) => (filtros?.bacia ? e.bacia === filtros.bacia : true))
      .filter((e) => (filtros?.tipo ? e.tipo === filtros.tipo : true))
      .filter((e) =>
        filtros?.tipoEstacao ? e.tipoEstacao === filtros.tipoEstacao : true,
      )
      .filter((e) => (filtros?.owner ? e.owner === filtros.owner : true))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  },

  async obterPorId(id) {
    return armazenamento.get(id) ?? null;
  },

  async upsertPorSibhId(estacao) {
    // Dedup pela chave natural sibhId (não por prefixo): o mesmo prefixo pode
    // coexistir em estações de tipos hidrológicos diferentes.
    const existente = Array.from(armazenamento.values()).find(
      (e) => e.sibhId === estacao.sibhId,
    );
    const resultado: EstacaoPluviometrica = {
      id: existente?.id ?? randomUUID(),
      prefixo: estacao.prefixo,
      nome: estacao.nome,
      lat: estacao.lat,
      lng: estacao.lng,
      tipo: estacao.tipo,
      tipoEstacao: estacao.tipoEstacao,
      bacia: estacao.bacia ?? null,
      owner: estacao.owner ?? null,
      transmissionStatus: estacao.transmissionStatus ?? null,
      // Espelha o .pg: normaliza a string crua do SIBH pra ISO (ou null).
      ultimaTransmissao: normalizarTimestampSibh(estacao.ultimaTransmissao),
      // Espelha o DEFAULT FALSE da coluna (migration 0067): ausente e' false,
      // nunca nulo. Nao ha id de posto aqui, e e' de proposito (ADR-0023).
      vinculadoAPosto: estacao.vinculadoAPosto ?? false,
      sibhId: estacao.sibhId,
      criadoEm: existente?.criadoEm ?? new Date(),
    };
    armazenamento.set(resultado.id, resultado);
    return resultado;
  },
};
