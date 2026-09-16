import type {
  DecisaoDesconformidade,
  Desconformidade,
  FiltrosDesconformidade,
  PaginaDesconformidades,
  StatusDesconformidade,
} from '@/domain/estoque/desconformidade';

/**
 * Port das desconformidades da carga do estoque. Adapter `.pg` persiste em
 * `estoque_desconformidades` (migration 0071); adapter `.mock` guarda em
 * memória (demo). Quem GRAVA a detecção é o importador
 * (`scripts/estoque/importar-inventario.mjs`); a aplicação só lista e decide.
 *
 * Não confundir com `DesconformidadesRepository`, que trata da qualidade do
 * cadastro de postos.
 */
export interface EstoqueDesconformidadesRepository {
  listar(filtros: FiltrosDesconformidade): Promise<PaginaDesconformidades>;
  obterPorId(id: string): Promise<Desconformidade | null>;
  /**
   * Grava a decisão numa única instrução (lê o status anterior sob lock e
   * atualiza). `resolvidaEm` é carimbado aqui: agora para resolvida/ignorada,
   * nulo para aberta. Lança `DesconformidadeNaoEncontrada` se o id não existir
   * e `UnidadeNaoEncontrada` se a unidade ligada sumir no meio do caminho.
   * `decisaoAnterior` devolve quem, quando e com que unidade a decisão
   * substituída foi tomada: reabrir apaga isso da linha, e o log é a trilha.
   *
   * Com `opcoes.statusEsperado`, a gravação só acontece se o status da linha
   * travada for esse; senão lança `DesconformidadeAlterada` sem gravar nada. A
   * conferência é parte da MESMA instrução que grava, nunca leitura prévia.
   */
  decidir(
    id: string,
    decisao: DecisaoDesconformidade,
    opcoes?: OpcoesDecisaoDesconformidade,
  ): Promise<{
    anterior: StatusDesconformidade;
    decisaoAnterior: DecisaoAnteriorDesconformidade;
    atual: Desconformidade;
  }>;
}

export interface OpcoesDecisaoDesconformidade {
  statusEsperado?: StatusDesconformidade;
}

export interface DecisaoAnteriorDesconformidade {
  resolvidaPor: string | null;
  resolvidaEm: Date | null;
  unidadeId: string | null;
}
