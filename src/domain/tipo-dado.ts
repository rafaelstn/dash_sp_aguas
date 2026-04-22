/**
 * Enum de Tipo de Dado — 5 categorias oficiais de pasta raiz (SPÁguas, 22/04/2026).
 * Seed espelhada na migration 0009. Imutável durante o MVP.
 */

export type CodigoTipoDado =
  | 'Fluviometria'
  | 'FluviometriaANA'
  | 'FluviometriaQualiAgua'
  | 'Piezometria'
  | 'Pluviometria'
  | 'QualiAgua';

export interface TipoDado {
  codigo: CodigoTipoDado;
  rotulo: string;
  regexPrefixo: string;
  usaPrefixoAna: boolean;
}

export const TIPOS_DADO: Readonly<Record<CodigoTipoDado, TipoDado>> = Object.freeze({
  Fluviometria: {
    codigo: 'Fluviometria',
    rotulo: 'Fluviometria',
    regexPrefixo: '^[0-9][A-Z]-[0-9]{3}$',
    usaPrefixoAna: false,
  },
  FluviometriaANA: {
    codigo: 'FluviometriaANA',
    rotulo: 'Fluviometria — ANA',
    regexPrefixo: '^[0-9]{8}$',
    usaPrefixoAna: true,
  },
  FluviometriaQualiAgua: {
    codigo: 'FluviometriaQualiAgua',
    rotulo: 'Fluviometria — QualiÁgua',
    regexPrefixo: '^[0-9][A-Z]-[0-9]{3}$',
    usaPrefixoAna: false,
  },
  Piezometria: {
    codigo: 'Piezometria',
    rotulo: 'Piezometria',
    regexPrefixo: '^[0-9][A-Z]-[0-9]{3}[A-Z]$',
    usaPrefixoAna: false,
  },
  Pluviometria: {
    codigo: 'Pluviometria',
    rotulo: 'Pluviometria',
    regexPrefixo: '^[A-Z][0-9]-[0-9]{3}$',
    usaPrefixoAna: false,
  },
  QualiAgua: {
    codigo: 'QualiAgua',
    rotulo: 'QualiÁgua',
    regexPrefixo: '^[A-Z]{4}[0-9]{4,5}$',
    usaPrefixoAna: false,
  },
});

export function rotuloTipoDado(codigo: CodigoTipoDado | null | undefined): string {
  if (!codigo) return 'Sem classificação';
  return TIPOS_DADO[codigo]?.rotulo ?? codigo;
}
