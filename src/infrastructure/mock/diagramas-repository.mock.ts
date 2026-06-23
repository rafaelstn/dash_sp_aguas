import 'server-only';
import { randomUUID } from 'node:crypto';
import type { DiagramasRepository } from '@/application/ports/diagramas-repository';
import type { Diagrama } from '@/domain/diagramas/diagrama';
import { DiagramaNaoEncontrado } from '@/domain/errors';

/**
 * Adapter in-memory de DiagramasRepository (MODO DEMO).
 * Armazenamento por processo — perde dados ao reiniciar o servidor.
 */
const armazenamento = new Map<string, Diagrama>();

export const diagramasRepository: DiagramasRepository = {
  async listar() {
    return Array.from(armazenamento.values())
      .sort((a, b) => b.atualizadoEm.getTime() - a.atualizadoEm.getTime())
      .map((d) => ({
        id: d.id,
        nome: d.nome,
        bacia: d.bacia,
        atualizadoEm: d.atualizadoEm,
      }));
  },

  async obter(id) {
    return armazenamento.get(id) ?? null;
  },

  async criar(dados, criadoPor) {
    const agora = new Date();
    const diagrama: Diagrama = {
      id: randomUUID(),
      nome: dados.nome,
      bacia: dados.bacia ?? null,
      descricao: dados.descricao ?? null,
      elementos: dados.elementos ?? [],
      criadoPor,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    armazenamento.set(diagrama.id, diagrama);
    return diagrama;
  },

  async renomear(id, nome) {
    const atual = armazenamento.get(id);
    if (!atual) throw new DiagramaNaoEncontrado(id);
    armazenamento.set(id, { ...atual, nome, atualizadoEm: new Date() });
  },

  async duplicar(id, criadoPor) {
    const origem = armazenamento.get(id);
    if (!origem) throw new DiagramaNaoEncontrado(id);
    const agora = new Date();
    const copia: Diagrama = {
      ...origem,
      id: randomUUID(),
      nome: `${origem.nome} (cópia)`,
      criadoPor,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    armazenamento.set(copia.id, copia);
    return copia;
  },

  async salvarElementos(id, elementos) {
    const atual = armazenamento.get(id);
    if (!atual) throw new DiagramaNaoEncontrado(id);
    armazenamento.set(id, { ...atual, elementos, atualizadoEm: new Date() });
  },

  async excluir(id) {
    if (!armazenamento.delete(id)) throw new DiagramaNaoEncontrado(id);
  },
};
