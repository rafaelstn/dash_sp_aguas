/**
 * Enum de Tipo de Documento — 7 valores oficiais (SPÁguas, 22/04/2026).
 * Seed espelhada na migration 0008. Codigo corresponde ao segmento CodDoc
 * do nome do arquivo PDF, conforme padrão oficial do cliente.
 */

export type CodigoTipoDocumento = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TipoDocumento {
  codigo: CodigoTipoDocumento;
  rotulo: string;
}

export const TIPOS_DOCUMENTO: Readonly<Record<CodigoTipoDocumento, TipoDocumento>> =
  Object.freeze({
    1: { codigo: 1, rotulo: 'Ficha Descritiva' },
    2: { codigo: 2, rotulo: 'PCD' },
    3: { codigo: 3, rotulo: 'Inspeção' },
    4: { codigo: 4, rotulo: 'Nivelamento' },
    5: { codigo: 5, rotulo: 'Levantamento de Seção' },
    6: { codigo: 6, rotulo: 'Troca de Observador' },
    7: { codigo: 7, rotulo: 'Vazão' },
  });

export const CODIGOS_TIPO_DOCUMENTO: readonly CodigoTipoDocumento[] = Object.freeze([
  1, 2, 3, 4, 5, 6, 7,
]);

export function rotuloTipoDocumento(codigo: CodigoTipoDocumento | null | undefined): string {
  if (codigo === null || codigo === undefined) return 'Sem classificação';
  return TIPOS_DOCUMENTO[codigo]?.rotulo ?? String(codigo);
}
