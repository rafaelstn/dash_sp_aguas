import type { AnaRevisaoRepository } from '@/application/ports/ana-revisao-repository';
import type { ContextoAtor } from '@/domain/ana-revisao';
import type { OrigemCadastroPostos } from '@/application/ports/postos-repository';
import { ROTULO_ORIGEM_DBFCH } from '@/application/ports/postos-repository';
import { EscritaIndisponivel } from '@/domain/errors';

export interface ParametrosAceitarMatchAna {
  estacaoId: string;
  postoIdSugerido: string;
  prefixoSugerido: string;
  codigoAna: string;
  referenciaExternaId?: string | null;
  observacaoPosto?: string | null;
  origemEvento?: string;
}

/**
 * Aceita o match sugerido do inventário ANA, vinculando a estação ao posto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE USE CASE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `anaRevisaoRepository.aceitarMatch` faz DUAS escritas na mesma transação:
 * `postos.prefixo_ana` e `ana_revisao_estacao`. A primeira é uma escrita no
 * CADASTRO, e desde o ADR-0023 o cadastro é lido ao vivo do `Dbfch`, em modo
 * SOMENTE LEITURA por determinação do órgão.
 *
 * Com a origem em `dbfch`, aquele caminho fazia duas coisas erradas de uma vez
 * (medido em 10/09/2026, com `postos` vazia em produção):
 *   1. `SELECT ... FROM postos ... FOR UPDATE` não achava nada e a rota
 *      respondia **404 para posto que existe**, no órgão;
 *   2. se achasse, tentaria **UPDATE em `postos`**, que o ADR proíbe.
 *
 * A decisão de produto é a mínima: a rota passa a responder
 * `EscritaIndisponivel` (HTTP 501), que é o mesmo tratamento que editar, criar,
 * remover ou restaurar posto já recebe desde o ADR-0023. Levar `prefixo_ana`
 * para uma tabela nossa é outra funcionalidade, com escopo próprio, e não foi
 * decidida.
 *
 * A recusa é CONDICIONADA À ORIGEM, e isso não é cautela: com origem
 * `postgres` a tabela `postos` É o cadastro daquele ambiente, e escrever nela
 * ali é legítimo; em `mock` o repositório de demo nem toca em posto. Recusar
 * nos três quebraria dois ambientes para consertar um.
 *
 * A ordem também importa: a recusa acontece ANTES de chamar o repositório, e
 * não dentro dele. Assim nenhuma das duas escritas chega a ser tentada, e a
 * estação ANA não fica marcada como revisada sem o vínculo existir.
 */
export async function aceitarMatchAna(
  anaRevisao: AnaRevisaoRepository,
  origemDoCadastro: OrigemCadastroPostos,
  params: ParametrosAceitarMatchAna,
  ator: ContextoAtor,
): Promise<void> {
  if (origemDoCadastro === 'dbfch') {
    throw new EscritaIndisponivel(
      `vincular a estação ANA ${params.codigoAna} ao posto ${params.prefixoSugerido}`,
      ROTULO_ORIGEM_DBFCH,
    );
  }

  await anaRevisao.aceitarMatch(params, ator);
}
