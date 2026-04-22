import type { PostosRepository, ResultadoPesquisa } from '@/application/ports/postos-repository';
import { TermoBuscaInvalido } from '@/domain/errors';

export interface EntradaBuscarPostos {
  termo?: string;
  pagina?: number;
  porPagina?: number;
}

const POR_PAGINA_PADRAO = 25;
const POR_PAGINA_MAX = 100;

/**
 * Normaliza o termo e delega ao repositório.
 * Regras:
 *  - termo vazio ou só espaços → resultado vazio sem ir ao banco;
 *  - termo que parece prefixo (ex.: "2D", "1D-008") entra como prefixoComecaCom;
 *  - caso contrário, entra como busca textual.
 */
export async function buscarPostos(
  repo: PostosRepository,
  entrada: EntradaBuscarPostos,
): Promise<ResultadoPesquisa> {
  const termoBruto = (entrada.termo ?? '').trim();
  const pagina = Math.max(1, entrada.pagina ?? 1);
  const porPagina = Math.min(POR_PAGINA_MAX, Math.max(1, entrada.porPagina ?? POR_PAGINA_PADRAO));

  if (termoBruto.length === 0) {
    return { total: 0, itens: [] };
  }

  if (termoBruto.length === 1) {
    throw new TermoBuscaInvalido('informe ao menos 2 caracteres');
  }

  const pareceCodigo = /^[A-Za-z0-9]{1,4}(-[A-Za-z0-9]{1,5})?$/.test(termoBruto);

  return repo.pesquisar({
    termo: pareceCodigo ? undefined : termoBruto,
    prefixoComecaCom: pareceCodigo ? termoBruto : undefined,
    pagina,
    porPagina,
  });
}
