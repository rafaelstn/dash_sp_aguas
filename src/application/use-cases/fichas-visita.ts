import type {
  EntradaAtualizarFicha,
  EntradaCriarFicha,
  FichasVisitaRepository,
} from '@/application/ports/fichas-visita-repository';
import type { FichaVisita } from '@/domain/ficha-visita';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';
import { construirSchemaZod, obterSchema } from '@/domain/fichas/schemas';

/**
 * Concentra os 5 casos de uso de fichas no mesmo arquivo — todos finos,
 * sem regra extensa, e com dependência única no repositório. Manter
 * separado em 5 arquivos seria cerimônia sem benefício.
 */

export async function listarFichasDoPosto(
  repo: FichasVisitaRepository,
  prefixo: string,
  filtroTipo?: CodigoTipoDocumento,
): Promise<FichaVisita[]> {
  if (!prefixo.trim()) return [];
  return filtroTipo
    ? repo.listarPorPostoETipo(prefixo, filtroTipo)
    : repo.listarPorPosto(prefixo);
}

export async function obterFichaVisita(
  repo: FichasVisitaRepository,
  id: string,
): Promise<FichaVisita | null> {
  if (!id) return null;
  return repo.obterPorId(id);
}

export class TipoFichaIndisponivel extends Error {
  constructor(public readonly codigo: CodigoTipoDocumento) {
    super(`Tipo de ficha ${codigo} ainda não tem schema disponível pra criação.`);
    this.name = 'TipoFichaIndisponivel';
  }
}

export class DadosFichaInvalidos extends Error {
  constructor(public readonly motivos: string[]) {
    super(`Dados inválidos: ${motivos.join('; ')}`);
    this.name = 'DadosFichaInvalidos';
  }
}

/**
 * Valida o payload `dados` contra o schema Zod do tipo antes de gravar.
 * Tipos sem schema disponível (`disponivel: false`) são rejeitados.
 */
export async function criarFichaVisita(
  repo: FichasVisitaRepository,
  entrada: EntradaCriarFicha,
): Promise<FichaVisita> {
  const schema = obterSchema(entrada.codTipoDocumento);
  if (!schema.disponivel) {
    throw new TipoFichaIndisponivel(entrada.codTipoDocumento);
  }

  const validador = construirSchemaZod(entrada.codTipoDocumento);
  const resultado = validador.safeParse(entrada.dados);
  if (!resultado.success) {
    throw new DadosFichaInvalidos(
      resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }

  return repo.criar({
    ...entrada,
    dados: resultado.data as Record<string, unknown>,
  });
}

export async function atualizarFichaVisita(
  repo: FichasVisitaRepository,
  id: string,
  entrada: EntradaAtualizarFicha,
): Promise<FichaVisita> {
  // Se o caller mandou `dados`, valida; senão preserva o payload existente.
  if (entrada.dados !== undefined) {
    const atual = await repo.obterPorId(id);
    if (!atual) throw new Error(`Ficha ${id} não encontrada`);
    const validador = construirSchemaZod(atual.codTipoDocumento);
    const resultado = validador.safeParse(entrada.dados);
    if (!resultado.success) {
      throw new DadosFichaInvalidos(
        resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    }
    entrada = { ...entrada, dados: resultado.data as Record<string, unknown> };
  }
  return repo.atualizar(id, entrada);
}

export async function apagarFichaVisita(
  repo: FichasVisitaRepository,
  id: string,
): Promise<void> {
  if (!id) throw new Error('id obrigatório');
  await repo.apagar(id);
}
