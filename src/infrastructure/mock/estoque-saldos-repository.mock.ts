import 'server-only';
import type { EstoqueSaldosRepository } from '@/application/ports/estoque-saldos-repository';
import type { SaldoComContexto } from '@/domain/estoque/saldo';
import { estoqueStore, chaveSaldoMock } from './estoque-store.mock';

export const estoqueSaldosRepository: EstoqueSaldosRepository = {
  async listar(filtros) {
    const itens: SaldoComContexto[] = [];
    for (const saldo of estoqueStore.saldos.values()) {
      if (filtros.materialId && saldo.materialId !== filtros.materialId) continue;
      if (filtros.localId && saldo.localId !== filtros.localId) continue;
      const material = estoqueStore.materiais.get(saldo.materialId);
      const local = estoqueStore.locais.get(saldo.localId);
      if (!material || !local) continue;
      if (filtros.unidade && local.unidade !== filtros.unidade) continue;
      itens.push({
        ...saldo,
        materialDescricao: material.descricao,
        localRotulo: local.rotulo,
        unidade: local.unidade,
      });
    }
    return itens.sort((a, b) => a.materialDescricao.localeCompare(b.materialDescricao));
  },

  async obterPorMaterialLocal(materialId, localId, tamanho) {
    return estoqueStore.saldos.get(chaveSaldoMock(materialId, localId, tamanho)) ?? null;
  },
};
