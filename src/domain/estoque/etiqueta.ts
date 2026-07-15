/**
 * Regras PURAS da etiqueta/QR de patrimonio (sem I/O). A pagina de impressao
 * renderiza UMA etiqueta por unidade serializada do filtro atual; para isso
 * precisa de um JSON enxuto, so com os campos que a etiqueta imprime. Este
 * modulo define esse shape minimo e a transformacao a partir da linha
 * enriquecida do export (`UnidadeExport`, que ja resolve o rotulo do local).
 * Nada de PII nem campo pesado (observacao, datas, ids de relacionamento).
 */

import type { Estado } from './estado';
import type { Status } from './status-unidade';
import type { UnidadeExport } from './export';

/**
 * Teto defensivo de etiquetas por requisicao (sem paginacao). O inventario atual
 * tem ~800 serializados; 2000 e folga larga para o filtro atual e evita montar
 * uma pagina de impressao gigante por engano (filtro vazio). Acima disso a rota
 * trunca e sinaliza `truncado` para a UI orientar o refino do filtro.
 */
export const TETO_ETIQUETAS = 2000;

/** Campos MINIMOS que a etiqueta/QR imprime por unidade. Sem PII, sem peso. */
export interface ItemEtiqueta {
  id: string;
  codigo: string | null;
  patDaee: string | null;
  numeroSerie: string | null;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  /** Rotulo legivel do local (ex. "PENHA / SALA 2A"); null quando sem local. */
  localRotulo: string | null;
  estado: Estado | null;
  status: Status;
}

/**
 * Projeta a linha enriquecida do export no shape enxuto da etiqueta. Funcao pura:
 * so seleciona campos, nao busca nada. `localRotulo` ja vem pronto do
 * `listarParaExport` (montado por `montarRotulo`).
 */
export function montarItemEtiqueta(u: UnidadeExport): ItemEtiqueta {
  return {
    id: u.id,
    codigo: u.codigo,
    patDaee: u.patDaee,
    numeroSerie: u.numeroSerie,
    descricao: u.descricao,
    marca: u.marca,
    modelo: u.modelo,
    localRotulo: u.localRotulo,
    estado: u.estado,
    status: u.status,
  };
}
