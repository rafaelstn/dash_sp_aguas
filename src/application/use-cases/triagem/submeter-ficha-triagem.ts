import type {
  EntradaSubmeterTriagem,
  TriagemRepository,
} from '@/application/ports/triagem-repository';
import type { FichaTriagem } from '@/domain/triagem';
import { construirSchemaZodEstrito, obterSchema } from '@/domain/fichas/schemas';
import {
  IdempotencyKeyDuplicada,
  EstadoTriagemInvalido,
} from '@/domain/errors';
import { TipoFichaIndisponivel, DadosFichaInvalidos } from '../fichas-visita';

/**
 * Submete nova ficha de triagem (estado `pendente`).
 *
 * Fluxo:
 *   1) Valida tipo disponível (mesmo critério de fichas-visita).
 *   2) Valida payload `dados` contra Zod específico do tipo.
 *   3) Se houver `idempotencyKey`, checa duplicata: se já existe ficha pra
 *      esse par (tecnico, key), retorna a existente (idempotente).
 *   4) Persiste ficha + evento `submetida` numa única transação (atômico
 *      garantido pelo repositório).
 *
 * O caso de re-envio após devolução tem use case próprio
 * (`reenviar-ficha-triagem.ts`) — aqui só aceita submissão fresca.
 */
export async function submeterFichaTriagem(
  repo: TriagemRepository,
  entrada: EntradaSubmeterTriagem,
  metadata: { ip: string | null; userAgent: string | null },
): Promise<FichaTriagem> {
  const schema = obterSchema(entrada.codTipoDocumento);
  if (!schema.disponivel) {
    throw new TipoFichaIndisponivel(entrada.codTipoDocumento);
  }

  const validador = construirSchemaZodEstrito(entrada.codTipoDocumento);
  const resultado = validador.safeParse(entrada.dados);
  if (!resultado.success) {
    throw new DadosFichaInvalidos(
      resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }

  if (entrada.idempotencyKey) {
    const existente = await repo.obterPorIdempotency(
      entrada.tecnicoId,
      entrada.idempotencyKey,
    );
    if (existente) {
      // Idempotência verdadeira: mesma key + mesmo técnico = devolve a anterior.
      // O cliente trata como sucesso. Nunca lança IdempotencyKeyDuplicada aqui
      // (esse erro fica reservado pra colisão entre dados diferentes — caso
      // a UNIQUE constraint do banco dispare em race).
      return existente;
    }
  }

  return repo.submeter(
    {
      ...entrada,
      dados: resultado.data as Record<string, unknown>,
    },
    metadata,
  );
}

/**
 * Re-envio após devolução: cria NOVA ficha de triagem, com `ficha_origem_id`
 * apontando pra original. A original permanece com estado `devolvida` (não é
 * reaberta — preserva linhagem). O técnico NÃO atualiza a ficha original.
 *
 * Validações:
 *   - Origem deve estar em estado `devolvida`.
 *   - Mesmo dono (técnico que envia = dono da ficha original).
 *   - Mesmo schema (não dá pra mudar tipo da ficha re-enviando).
 */
export async function reenviarFichaTriagem(
  repo: TriagemRepository,
  fichaOrigemId: string,
  entrada: EntradaSubmeterTriagem,
  metadata: { ip: string | null; userAgent: string | null },
): Promise<FichaTriagem> {
  const original = await repo.obterPorId(fichaOrigemId);
  if (!original) {
    throw new EstadoTriagemInvalido('inexistente', 'pendente');
  }
  if (original.estado !== 'devolvida') {
    throw new EstadoTriagemInvalido(original.estado, 'pendente');
  }
  if (original.tecnicoId !== entrada.tecnicoId) {
    // Não dá pra outro técnico re-submeter ficha alheia.
    throw new EstadoTriagemInvalido('dono_diferente', 'pendente');
  }

  // Re-utiliza a validação de schema acima.
  const schema = obterSchema(entrada.codTipoDocumento);
  if (!schema.disponivel) {
    throw new TipoFichaIndisponivel(entrada.codTipoDocumento);
  }
  const validador = construirSchemaZodEstrito(entrada.codTipoDocumento);
  const resultado = validador.safeParse(entrada.dados);
  if (!resultado.success) {
    throw new DadosFichaInvalidos(
      resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }

  return repo.reenviarAposDevolucao(
    fichaOrigemId,
    {
      ...entrada,
      codTipoDocumento: original.codTipoDocumento,
      dados: resultado.data as Record<string, unknown>,
    },
    metadata,
  );
}

// Marca o erro de duplicata como exportado para tradução de status na rota.
export { IdempotencyKeyDuplicada };
