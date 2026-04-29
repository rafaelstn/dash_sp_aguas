import 'server-only';
import { randomUUID } from 'node:crypto';
import type {
  EntradaAtualizarFicha,
  EntradaCriarFicha,
  FichasVisitaRepository,
} from '@/application/ports/fichas-visita-repository';
import type { FichaVisita } from '@/domain/ficha-visita';

/**
 * Adapter in-memory de FichasVisitaRepository (MODO DEMO).
 * Estado vive apenas no processo Node atual — sumindo no restart.
 */

const fichas = new Map<string, FichaVisita>();

export const fichasVisitaRepository: FichasVisitaRepository = {
  async listarPorPosto(prefixo) {
    return Array.from(fichas.values())
      .filter((f) => f.prefixo === prefixo)
      .sort(
        (a, b) =>
          b.dataVisita.getTime() - a.dataVisita.getTime() ||
          b.criadaEm.getTime() - a.criadaEm.getTime(),
      );
  },

  async listarPorPostoETipo(prefixo, codigo) {
    return Array.from(fichas.values())
      .filter((f) => f.prefixo === prefixo && f.codTipoDocumento === codigo)
      .sort(
        (a, b) =>
          b.dataVisita.getTime() - a.dataVisita.getTime() ||
          b.criadaEm.getTime() - a.criadaEm.getTime(),
      );
  },

  async obterPorId(id) {
    return fichas.get(id) ?? null;
  },

  async criar(entrada: EntradaCriarFicha) {
    const agora = new Date();
    const ficha: FichaVisita = {
      id: randomUUID(),
      prefixo: entrada.prefixo,
      codTipoDocumento: entrada.codTipoDocumento,
      dataVisita: entrada.dataVisita,
      horaInicio: entrada.horaInicio,
      horaFim: entrada.horaFim,
      tecnicoNome: entrada.tecnicoNome,
      tecnicoId: entrada.tecnicoId,
      latitudeCapturada: entrada.latitudeCapturada,
      longitudeCapturada: entrada.longitudeCapturada,
      observacoes: entrada.observacoes,
      dados: entrada.dados,
      origem: entrada.origem ?? 'web_simulada',
      status: entrada.status ?? 'enviada',
      criadaEm: agora,
      atualizadaEm: agora,
    };
    fichas.set(ficha.id, ficha);
    return ficha;
  },

  async atualizar(id, entrada: EntradaAtualizarFicha) {
    const atual = fichas.get(id);
    if (!atual) throw new Error(`Ficha ${id} não encontrada`);
    const atualizada: FichaVisita = {
      ...atual,
      ...entrada,
      atualizadaEm: new Date(),
    };
    fichas.set(id, atualizada);
    return atualizada;
  },

  async apagar(id) {
    fichas.delete(id);
  },
};
