import type {
  PostosRepository,
  PostoSugestao,
} from '@/application/ports/postos-repository';

export const LIMITE_AUTOCOMPLETE_PADRAO = 20;
export const LIMITE_AUTOCOMPLETE_MAX = 50;
export const TERMO_MINIMO = 2;

export interface EntradaAutocompletarPostos {
  termo?: string;
  limite?: number;
}

/**
 * Autocomplete de postos para vincular um nó do diagrama a um posto do
 * catálogo. Camada fina: normaliza o termo, faz clamp do limite e delega ao
 * repositório, que devolve a forma enxuta `PostoSugestao`.
 *
 * Regras:
 *   - termo com menos de 2 caracteres (após trim) -> lista vazia, sem erro
 *     (digitação inicial não dispara busca cara);
 *   - limite ausente/invalido -> 20; teto de 50 para proteger a query.
 */
export async function autocompletarPostos(
  repo: PostosRepository,
  entrada: EntradaAutocompletarPostos,
): Promise<PostoSugestao[]> {
  const termo = (entrada.termo ?? '').trim();
  if (termo.length < TERMO_MINIMO) return [];

  const limiteBruto = entrada.limite;
  const limite =
    typeof limiteBruto === 'number' && Number.isFinite(limiteBruto) && limiteBruto >= 1
      ? Math.min(LIMITE_AUTOCOMPLETE_MAX, Math.floor(limiteBruto))
      : LIMITE_AUTOCOMPLETE_PADRAO;

  return repo.autocompletar(termo, limite);
}
