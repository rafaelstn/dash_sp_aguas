import type { FacetasPostos, FacetasRepository } from '@/application/ports/facetas-repository';

/** Thin wrapper — reservado pra futuro filtro (ex.: apenas UGRHIs ativas). */
export async function listarFacetas(
  repo: FacetasRepository,
): Promise<FacetasPostos> {
  return repo.listar();
}
