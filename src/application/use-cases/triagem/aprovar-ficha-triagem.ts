import type { TriagemRepository } from '@/application/ports/triagem-repository';
import type { PapeisRepository } from '@/application/ports/papeis-repository';
import type { PostosRepository } from '@/application/ports/postos-repository';
import type { FichaTriagem } from '@/domain/triagem';
import {
  EstadoTriagemInvalido,
  FichaTriagemNaoEncontrada,
  UsuarioNaoEhAprovador,
} from '@/domain/errors';

export interface ResultadoAprovacaoUseCase {
  triagem: FichaTriagem;
  fichaVisitaId: string;
}

/**
 * Aprova ficha em revisão — promoção atômica para `fichas_visita`.
 *
 * Defesa em profundidade:
 *   1) Aprovador.
 *   2) Posto ativo, perguntado à ORIGEM do cadastro (ver abaixo).
 *   3) Repo verifica dentro de sql.begin: estado='em_revisao' AND lock pertence ao aprovador.
 *   4) INSERT em fichas_visita + UPDATE triagem + DELETE lock + INSERT evento, tudo ou nada.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE A VERIFICAÇÃO DE POSTO ATIVO MORA AQUI, E NÃO NA TRANSAÇÃO
 * ─────────────────────────────────────────────────────────────────────────
 * Ela morava dentro do `sql.begin` do repositório, como
 * `SELECT deleted_at FROM postos WHERE prefixo = ...`. Desde o ADR-0023 o
 * cadastro de posto é lido AO VIVO do `Dbfch` e a nossa tabela `postos` está
 * VAZIA em produção (`count(*) = 0`, medido em 10/09/2026). Com a tabela
 * vazia, `postos[0]` era sempre `undefined` e TODA aprovação respondia 409
 * `posto_inativo`, mandando o aprovador investigar o sistema do órgão por
 * causa de uma tabela nossa que está vazia de propósito.
 *
 * A pergunta "este posto existe e está ativo?" só tem uma resposta válida: a
 * do órgão. Perguntar ao `postosRepository` significa sair da transação,
 * porque a resposta vem de OUTRO armazenamento, e o ADR-0023 §2.3 proíbe
 * junção entre os dois. Fica composição por lote: pergunta primeiro, grava
 * depois, e a janela entre as duas é aceita explicitamente — o cadastro do
 * órgão não muda por ação nossa, e a alternativa (junção entre armazenamentos)
 * é justamente o que o ADR proíbe.
 *
 * A verificação só roda com a ficha em `em_revisao`. Fora disso, quem tem a
 * palavra é o `FOR UPDATE` do repositório: responder `posto_inativo` para uma
 * ficha já aprovada seria trocar o motivo real da recusa por outro.
 *
 * As três origens respondem de forma honesta, e nenhuma delas é caso de borda:
 *   - `dbfch` (produção): `buscarPorPrefixo` filtra `Excluido = 0` e devolve
 *     `null` quando o órgão não tem aquele posto ativo. `deletedAt` vem sempre
 *     `null`, porque soft delete é conceito nosso e não de lá.
 *   - `postgres` (sem `SQLSERVER_*`): a tabela `postos` É a origem do cadastro
 *     naquele ambiente, então `null` e `deletedAt` significam o que dizem.
 *   - `mock` (demo): as fixtures são a origem.
 *
 * Erros típicos:
 *   UsuarioNaoEhAprovador     → 403
 *   LockRevisaoNegado         → 423 (lock perdido, não é dono)
 *   EstadoTriagemInvalido     → 409 (não está em em_revisao, ou posto inativo)
 *   FichaTriagemNaoEncontrada → 404
 */
export async function aprovarFichaTriagem(
  repo: TriagemRepository,
  papeis: PapeisRepository,
  postos: PostosRepository,
  triagemId: string,
  aprovadorId: string,
  metadata: { ip: string | null; userAgent: string | null },
): Promise<ResultadoAprovacaoUseCase> {
  const ehAprovador = await papeis.ehAprovador(aprovadorId);
  if (!ehAprovador) {
    throw new UsuarioNaoEhAprovador(aprovadorId);
  }

  const ficha = await repo.obterPorId(triagemId);
  if (!ficha) {
    throw new FichaTriagemNaoEncontrada(triagemId);
  }

  if (ficha.estado === 'em_revisao') {
    const posto = await postos.buscarPorPrefixo(ficha.prefixo);
    // `null` e `deletedAt` preenchido são a mesma recusa para quem aprova: a
    // origem do cadastro não oferece aquele posto como ativo, e a ação é a
    // mesma nos dois casos (falar com o órgão). Manter o par
    // `posto_inativo → aprovada` preserva o contrato 409 que já existia.
    if (posto === null || posto.deletedAt !== null) {
      throw new EstadoTriagemInvalido('posto_inativo', 'aprovada');
    }
  }

  return repo.aprovar(triagemId, aprovadorId, metadata);
}
