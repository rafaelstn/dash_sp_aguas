import 'server-only';

import type { RevisoesRepository } from '@/application/ports/revisoes-repository';
import type {
  ParametrosNovaRevisao,
  RevisaoDesconformidade,
} from '@/domain/revisao-desconformidade';
import { REVISOES_FIXTURES } from './fixtures';

/**
 * Adapter in-memory de RevisoesRepository (MODO DEMO).
 * Upsert espelha o comportamento do `.pg`: chave composta
 * (tipoEntidade, idEntidade, categoria). Persistência é por processo.
 */

type ChaveRevisao = `${string}|${string}|${string}`;

function chave(
  tipoEntidade: string,
  idEntidade: string,
  categoria: string,
): ChaveRevisao {
  return `${tipoEntidade}|${idEntidade}|${categoria}`;
}

const armazenamento = new Map<ChaveRevisao, RevisaoDesconformidade>();

// Seed inicial com as revisões pré-marcadas do fixture.
for (const r of REVISOES_FIXTURES) {
  armazenamento.set(chave(r.tipoEntidade, r.idEntidade, r.categoria), r);
}

let contadorId = REVISOES_FIXTURES.length;

function novoId(): string {
  contadorId += 1;
  return `fx-rev-${String(contadorId).padStart(3, '0')}`;
}

export const revisoesRepository: RevisoesRepository = {
  async marcarRevisado(
    params: ParametrosNovaRevisao,
  ): Promise<RevisaoDesconformidade> {
    const k = chave(params.tipoEntidade, params.idEntidade, params.categoria);
    const existente = armazenamento.get(k);
    const agora = new Date();

    if (existente) {
      const atualizado: RevisaoDesconformidade = {
        ...existente,
        status: 'revisado',
        nota: params.nota ?? existente.nota,
        ip: params.ip,
        revisadoEm: agora,
      };
      armazenamento.set(k, atualizado);
      return atualizado;
    }

    const nova: RevisaoDesconformidade = {
      id: novoId(),
      tipoEntidade: params.tipoEntidade,
      idEntidade: params.idEntidade,
      categoria: params.categoria,
      status: 'revisado',
      nota: params.nota,
      ip: params.ip,
      revisadoEm: agora,
      createdAt: agora,
    };
    armazenamento.set(k, nova);
    return nova;
  },

  async reabrir(id: string) {
    for (const [k, v] of armazenamento.entries()) {
      if (v.id === id) {
        armazenamento.set(k, { ...v, status: 'pendente', revisadoEm: null });
        return;
      }
    }
  },
};
