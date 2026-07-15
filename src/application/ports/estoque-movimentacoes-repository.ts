import type {
  ComandoMovimentacao,
  FiltrosMovimentacao,
  Movimentacao,
  ResultadoMovimentacao,
} from '@/domain/estoque/movimentacao';
import type { MovimentacaoExport } from '@/domain/estoque/export';

/**
 * Port do repositorio de movimentacoes (o nucleo transacional do estoque).
 *
 * `registrar` executa TUDO numa unica transacao (`sql.begin` no adapter `.pg`):
 * grava no ledger E aplica o efeito colateral (upsert/UPDATE guardado de saldo
 * para quantificavel; mudanca de local/status da unidade para serializado),
 * tudo ou nada. Lanca erros de dominio tipados:
 *   - SaldoInsuficiente (UPDATE guardado afetou 0 linhas)
 *   - TransicaoStatusInvalida (baixa a partir de status invalido)
 *   - UnidadeNaoEncontrada / MaterialNaoEncontrado / NaturezaIncompativel
 *
 * Adapter `.pg` persiste (0057/0058/0059); `.mock` replica a mesma logica e os
 * mesmos erros em memoria (para o MODO DEMO e para teste do use-case).
 */
export interface EstoqueMovimentacoesRepository {
  registrar(comando: ComandoMovimentacao): Promise<ResultadoMovimentacao>;
  listar(filtros: FiltrosMovimentacao): Promise<{ itens: Movimentacao[]; total: number }>;
  /**
   * Lista a trilha SEM paginacao (export), enriquecida com descricao/identificacao
   * do item e rotulos dos locais de origem/destino. Operador NAO e resolvido aqui
   * (fica com `UsuariosIdentidadeRepository`). Mesmos filtros; teto TETO_EXPORT.
   */
  listarParaExport(filtros: FiltrosMovimentacao): Promise<MovimentacaoExport[]>;
}
