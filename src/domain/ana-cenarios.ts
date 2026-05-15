/**
 * Cenários ANA: categorias de problema apontadas pela ANA nas colunas de
 * OBSERVAÇÃO (1 a 5) da planilha do PROGESTÃO. Cada cenário tem uma chave
 * estável (vai no URL) e um pattern SQL (ILIKE) que casa o texto real
 * usado pela ANA no inventário.
 *
 * Centralizado aqui para que a página /inventario-ana e o repositório
 * concordem sobre como casar a chave do chip com a observação no banco.
 */

export interface CenarioAna {
  /** Chave estável, vai no URL como ?cenario=XYZ */
  chave: string;
  /** Rótulo legível para o usuário */
  rotulo: string;
  /** Pattern SQL ILIKE que casa o texto real da observação ANA */
  pattern: string;
}

export const CENARIOS_ANA: readonly CenarioAna[] = [
  { chave: 'PLUVIOMETRO', rotulo: 'Pluviômetro', pattern: '[PLUVIÔMETRO]%' },
  { chave: 'TELEMETRIA', rotulo: 'Telemetria', pattern: '[TELEMETRIA]%' },
  { chave: 'DESCARGA', rotulo: 'Descarga líquida', pattern: '[DESCARGA LÍQUIDA]%' },
  { chave: 'QUALIDADE', rotulo: 'Qualidade água', pattern: '[QUALIDADE DA ÁGUA]%' },
  { chave: 'VERIFICAR_COORD', rotulo: 'Verificar coordenadas', pattern: 'VERIFICAR%COORDENADAS%' },
  { chave: 'MUN_INCOMP', rotulo: 'Município incompatível', pattern: 'MUNICÍPIO%INCOMPAT%' },
  { chave: 'RIO_INCOMP', rotulo: 'Rio incompatível', pattern: 'RIO%INCOMPAT%' },
  { chave: 'SUBBACIA', rotulo: 'Sub-bacia', pattern: 'VERIFICAR%SUB-BACIA%' },
  { chave: 'EST_DUP', rotulo: 'Estação duplicada', pattern: 'ESTAÇÃO DUPLICADA%' },
  { chave: 'COD_DUP', rotulo: 'Cód. adicional duplicado', pattern: 'CÓDIGO ADICIONAL DUPLICADO%' },
  { chave: 'SEM_COD', rotulo: 'Sem cód. adicional', pattern: 'ESTAÇÃO SEM%CÓDIGO ADICIONAL%' },
] as const;

/**
 * Converte chave de cenário para pattern SQL. Retorna null se a chave
 * for desconhecida (filtro deve ser ignorado em vez de aplicar pattern
 * sem sentido como '%VERIFICAR_COORD%').
 */
export function patternDeCenario(chave: string | undefined | null): string | null {
  if (!chave) return null;
  const c = CENARIOS_ANA.find((x) => x.chave === chave);
  return c ? c.pattern : null;
}
