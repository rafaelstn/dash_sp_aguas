/**
 * Local fisico do estoque (unidade + sala/prateleira/armario). Tipo puro,
 * espelha a tabela `estoque_locais` (migration 0054). A normalizacao da
 * localizacao suja da planilha (`normalizarLocal`) vive aqui e e reutilizada
 * pelo import e por qualquer criacao/edicao de local.
 */

export type UnidadeFisica = 'PENHA' | 'ARARAQUARA';

export const UNIDADES_FISICAS: readonly UnidadeFisica[] = Object.freeze([
  'PENHA',
  'ARARAQUARA',
]);

export function ehUnidadeFisica(valor: unknown): valor is UnidadeFisica {
  return valor === 'PENHA' || valor === 'ARARAQUARA';
}

export interface Local {
  id: string;
  unidade: UnidadeFisica;
  sala: string | null;
  prateleira: string | null;
  armario: string | null;
  rotulo: string;
  observacao: string | null;
  criadoEm: Date;
}

/** Entrada bruta de local (da planilha ou do formulario). */
export interface EntradaLocal {
  unidade: UnidadeFisica;
  sala?: string | null;
  prateleira?: string | null;
  armario?: string | null;
  observacao?: string | null;
}

/** Resultado da normalizacao: campos limpos + rotulo legivel + chave natural. */
export interface LocalNormalizado {
  unidade: UnidadeFisica;
  sala: string | null;
  prateleira: string | null;
  armario: string | null;
  rotulo: string;
  /** Chave natural (espelha o unique index uq_estoque_locais_chave). */
  chave: string;
}

/**
 * Normaliza um campo de localizacao: trim, caixa alta, colapsa espacos. Valores
 * de "vazio sujo" ("?", "-", "") viram `null` (nao inventa estrutura). Funcao pura.
 */
export function normalizarCampoLocal(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const limpo = valor.trim().toUpperCase().replace(/\s+/g, ' ');
  if (limpo === '' || limpo === '?' || limpo === '-' || limpo === 'N/A') return null;
  return limpo;
}

/** Monta um rotulo legivel a partir dos campos preenchidos. */
export function montarRotulo(
  unidade: UnidadeFisica,
  sala: string | null,
  prateleira: string | null,
  armario: string | null,
): string {
  const partes: string[] = [unidade];
  if (sala) partes.push(`SALA ${sala}`);
  if (prateleira) partes.push(`PRAT ${prateleira}`);
  if (armario) partes.push(`ARM ${armario}`);
  return partes.join(' / ');
}

/**
 * Normaliza uma localizacao bruta em campos limpos + rotulo + chave natural.
 * A chave espelha o unique index (unidade + COALESCE dos tres campos): mesmo
 * local nao duplica no import (get-or-create) nem entre reexecucoes. Funcao pura.
 */
export function normalizarLocal(entrada: EntradaLocal): LocalNormalizado {
  const sala = normalizarCampoLocal(entrada.sala);
  const prateleira = normalizarCampoLocal(entrada.prateleira);
  const armario = normalizarCampoLocal(entrada.armario);
  const rotulo = montarRotulo(entrada.unidade, sala, prateleira, armario);
  const chave = `${entrada.unidade}|${sala ?? ''}|${prateleira ?? ''}|${armario ?? ''}`;
  return { unidade: entrada.unidade, sala, prateleira, armario, rotulo, chave };
}
