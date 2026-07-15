import 'server-only';
import type { EstoqueSaldosRepository } from '@/application/ports/estoque-saldos-repository';
import type { SaldoComContexto } from '@/domain/estoque/saldo';
import { TETO_EXPORT, type SaldoExport } from '@/domain/estoque/export';
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

  async listarParaExport(filtros) {
    const itens: SaldoExport[] = [];
    for (const saldo of estoqueStore.saldos.values()) {
      if (filtros.materialId && saldo.materialId !== filtros.materialId) continue;
      if (filtros.localId && saldo.localId !== filtros.localId) continue;
      const material = estoqueStore.materiais.get(saldo.materialId);
      const local = estoqueStore.locais.get(saldo.localId);
      if (!material || !local) continue;
      if (filtros.unidade && local.unidade !== filtros.unidade) continue;
      const categoria = material.categoriaId
        ? estoqueStore.categorias.get(material.categoriaId)?.nome ?? null
        : null;
      itens.push({
        materialDescricao: material.descricao,
        marca: material.marca,
        modelo: material.modelo,
        categoria,
        unidadeFisica: local.unidade,
        localRotulo: local.rotulo,
        tamanho: saldo.tamanho,
        quantidade: saldo.quantidade,
      });
    }
    return itens
      .sort((a, b) => a.materialDescricao.localeCompare(b.materialDescricao))
      .slice(0, TETO_EXPORT);
  },

  async obterPorMaterialLocal(materialId, localId, tamanho) {
    return estoqueStore.saldos.get(chaveSaldoMock(materialId, localId, tamanho)) ?? null;
  },
};
