import type {
  InventarioAnaExportRepository,
  LinhaInventarioAnaExport,
  MunicipioIbge,
} from '@/application/ports/inventario-ana-export-repository';

/**
 * Mock do port de export ANA. Em modo demo não há lote/estação importada, então
 * o export devolve uma planilha vazia (só cabeçalho). Os testes do use case
 * injetam um repositório de stub próprio com linhas controladas.
 */
export const inventarioAnaExportRepository: InventarioAnaExportRepository = {
  async carregarMunicipiosIbge(): Promise<MunicipioIbge[]> {
    return [];
  },
  async carregarLinhasInventario(): Promise<LinhaInventarioAnaExport[]> {
    return [];
  },
};
