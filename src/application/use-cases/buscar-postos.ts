import type { PostosRepository, ResultadoPesquisa } from '@/application/ports/postos-repository';
import { TermoBuscaInvalido } from '@/domain/errors';

export interface EntradaBuscarPostos {
  termo?: string;
  // Filtros categóricos
  ugrhiNumero?: string;
  municipio?: string;
  baciaHidrografica?: string;
  tipoPosto?: string;
  // Booleans
  temFichaDescritiva?: boolean;
  temFichaInspecao?: boolean;
  temTelemetrico?: boolean;
  apenasFavoritos?: boolean;
  // Contexto
  usuarioId?: string | null;
  pagina?: number;
  porPagina?: number;
}

const POR_PAGINA_PADRAO = 25;
const POR_PAGINA_MAX = 100;

/**
 * Normaliza entrada e delega ao repositório.
 *
 * Regras:
 *  - sem termo + sem filtros → array vazio (busca ociosa);
 *  - só filtros categóricos (sem termo) → consulta normal;
 *  - termo que parece prefixo ("2D", "1D-008") entra como `prefixoComecaCom`;
 *  - caso contrário, entra como busca textual (FTS portuguese + unaccent);
 *  - `apenasFavoritos=true` sem `usuarioId` → array vazio silencioso.
 */
export async function buscarPostos(
  repo: PostosRepository,
  entrada: EntradaBuscarPostos,
): Promise<ResultadoPesquisa> {
  const termoBruto = (entrada.termo ?? '').trim();
  const pagina = Math.max(1, entrada.pagina ?? 1);
  const porPagina = Math.min(POR_PAGINA_MAX, Math.max(1, entrada.porPagina ?? POR_PAGINA_PADRAO));

  const temFiltrosCategoricos = Boolean(
    entrada.ugrhiNumero ||
      entrada.municipio ||
      entrada.baciaHidrografica ||
      entrada.tipoPosto ||
      entrada.temFichaDescritiva ||
      entrada.temFichaInspecao ||
      entrada.temTelemetrico ||
      entrada.apenasFavoritos,
  );

  if (entrada.apenasFavoritos && !entrada.usuarioId) {
    return { total: 0, itens: [] };
  }

  if (termoBruto.length === 0 && !temFiltrosCategoricos) {
    return { total: 0, itens: [] };
  }

  if (termoBruto.length === 1) {
    throw new TermoBuscaInvalido('informe ao menos 2 caracteres');
  }

  const pareceCodigo =
    termoBruto.length > 0 &&
    /^[A-Za-z0-9]{1,4}(-[A-Za-z0-9]{1,5})?$/.test(termoBruto);

  return repo.pesquisar({
    termo: pareceCodigo || termoBruto.length === 0 ? undefined : termoBruto,
    prefixoComecaCom: pareceCodigo ? termoBruto : undefined,
    ugrhiNumero: entrada.ugrhiNumero,
    municipio: entrada.municipio,
    baciaHidrografica: entrada.baciaHidrografica,
    tipoPosto: entrada.tipoPosto,
    temFichaDescritiva: entrada.temFichaDescritiva,
    temFichaInspecao: entrada.temFichaInspecao,
    temTelemetrico: entrada.temTelemetrico,
    apenasFavoritos: entrada.apenasFavoritos,
    usuarioId: entrada.usuarioId,
    pagina,
    porPagina,
  });
}
