import type { UsuariosIdentidadeRepository } from '@/application/ports/usuarios-identidade-repository';
import { mapaOperadores } from '@/domain/estoque/export';

export interface ResultadoResolverOperadores {
  /** usuarioId -> rotulo legivel do operador (nome/email/id, ou "Importação"). */
  operadores: Map<string, string>;
  /**
   * true quando a resolucao de identidade FALHOU e caiu no fallback (id cru).
   * Nao e silencioso: o chamador loga a degradacao (sem email/nome). false no
   * caminho feliz e tambem quando a lista de ids e vazia (nada a resolver).
   */
  degradado: boolean;
}

/**
 * Resolve, em LOTE, o rotulo do operador de um conjunto de registros da trilha
 * (listagem `GET /api/estoque/movimentacoes` e detalhe do item). Coleta os ids
 * DISTINTOS, resolve identidade num unico SELECT (`resolver`) e mapeia pela regra
 * PURA do dominio (`mapaOperadores` -> `rotuloOperador`), a MESMA do export, pra
 * o rotulo nunca divergir entre as superficies.
 *
 * Degrada com seguranca: se o resolver falhar/indisponivel, NAO lanca (a trilha
 * de auditoria nao pode quebrar por causa do nome do operador); cada id cai no
 * fallback do dominio (UUID de import -> "Importação"; senao o id cru) e
 * `degradado` sinaliza pro chamador logar. So o EXPORT falha duro nesse caso
 * (integridade da planilha), por isso ele nao usa este helper de degradacao.
 *
 * Read-only e livre de PII: nao recebe, retorna nem loga email/nome.
 */
export async function resolverOperadores(
  identidadeRepo: UsuariosIdentidadeRepository,
  usuarioIds: readonly string[],
): Promise<ResultadoResolverOperadores> {
  const distintos = [...new Set(usuarioIds)];
  try {
    const identidades = await identidadeRepo.resolver(distintos);
    return { operadores: mapaOperadores(distintos, identidades), degradado: false };
  } catch {
    return { operadores: mapaOperadores(distintos, new Map()), degradado: true };
  }
}
