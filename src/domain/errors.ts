/**
 * Erros de domínio tipados. Nunca vazam string genérica para o BFF:
 * cada caso de uso usa um erro nomeado, traduzido na camada de apresentação.
 */

export class PostoNaoEncontrado extends Error {
  constructor(public readonly prefixo: string) {
    super(`Posto não encontrado: ${prefixo}`);
    this.name = 'PostoNaoEncontrado';
  }
}

/**
 * Posto existe na tabela mas foi removido (soft delete, `deleted_at`).
 * Não pode receber edição nem ser usado em fluxo de aprovação até ser
 * restaurado. Tradução padrão: HTTP 409.
 */
export class PostoRemovido extends Error {
  constructor(public readonly prefixo: string) {
    super(`Posto ${prefixo} foi removido e não aceita edição.`);
    this.name = 'PostoRemovido';
  }
}

/**
 * Tentativa de cadastrar ou renomear um posto cujo prefixo (ou prefixo
 * ANA) colide com um existente. Tradução padrão: HTTP 409.
 */
export class PrefixoDuplicado extends Error {
  constructor(public readonly prefixo: string) {
    super(`Já existe um posto com prefixo ${prefixo}.`);
    this.name = 'PrefixoDuplicado';
  }
}

/**
 * Diagrama unifilar inexistente (ou já excluído). Tradução padrão: HTTP 404.
 */
export class DiagramaNaoEncontrado extends Error {
  constructor(public readonly id: string) {
    super(`Diagrama não encontrado: ${id}`);
    this.name = 'DiagramaNaoEncontrado';
  }
}

export class TermoBuscaInvalido extends Error {
  constructor(motivo: string) {
    super(`Termo de busca inválido: ${motivo}`);
    this.name = 'TermoBuscaInvalido';
  }
}

/**
 * Usuário (conta) inexistente em operação de gestão. Tradução padrão: HTTP 404.
 */
export class UsuarioNaoEncontrado extends Error {
  constructor(public readonly id: string) {
    super(`Usuário não encontrado: ${id}`);
    this.name = 'UsuarioNaoEncontrado';
  }
}

/**
 * Tentativa de criar usuário com e-mail já cadastrado. Tradução padrão: 409.
 */
export class EmailJaCadastrado extends Error {
  constructor(public readonly email: string) {
    super('Este e-mail já está cadastrado.');
    this.name = 'EmailJaCadastrado';
  }
}

export class FalhaRepositorio extends Error {
  constructor(operacao: string, causa: unknown) {
    super(`Falha no repositório (${operacao}): ${String(causa)}`);
    this.name = 'FalhaRepositorio';
  }
}

/** Entrada inválida de uso geral (mapeia para 400 nas rotas). */
export class DadosInvalidos extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'DadosInvalidos';
  }
}

/**
 * Sinaliza que o backend aceitou a solicitação de indexação mas ela não
 * concluiu no tempo síncrono esperado (>8s). O frontend deve fazer polling
 * em GET /api/jobs/{jobId} até a varredura terminar.
 */
export class IndexacaoPendente extends Error {
  constructor(
    public readonly prefixo: string,
    public readonly jobId: string,
  ) {
    super(`Indexação pendente para ${prefixo} (job ${jobId})`);
    this.name = 'IndexacaoPendente';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Erros do módulo de triagem (Fase 2.A, ADR-0008 revisado pelo ADR-0010).
// Tradução pra HTTP é responsabilidade da camada de apresentação:
//   EstadoTriagemInvalido           → 409 Conflict
//   LockRevisaoNegado               → 423 Locked
//   MotivoRejeicaoInsuficiente      → 400 Bad Request
//   FichaTriagemNaoEncontrada       → 404 Not Found
// ─────────────────────────────────────────────────────────────────────────────

export class FichaTriagemNaoEncontrada extends Error {
  constructor(public readonly id: string) {
    super(`Ficha de triagem não encontrada: ${id}`);
    this.name = 'FichaTriagemNaoEncontrada';
  }
}

export class EstadoTriagemInvalido extends Error {
  constructor(
    public readonly de: string,
    public readonly para: string,
  ) {
    super(`Transição inválida na triagem: ${de} → ${para}`);
    this.name = 'EstadoTriagemInvalido';
  }
}

export class LockRevisaoNegado extends Error {
  constructor(
    public readonly triagemId: string,
    public readonly motivo: 'ja_existe_lock' | 'nao_dono_do_lock' | 'lock_expirado',
  ) {
    super(`Lock de revisão negado (${motivo}) para triagem ${triagemId}`);
    this.name = 'LockRevisaoNegado';
  }
}

export class MotivoRejeicaoInsuficiente extends Error {
  constructor(public readonly tamanhoRecebido: number) {
    super(
      `Motivo de rejeição/devolução exige ao menos 20 caracteres (recebido: ${tamanhoRecebido}).`,
    );
    this.name = 'MotivoRejeicaoInsuficiente';
  }
}

export class UsuarioNaoEhAprovador extends Error {
  constructor(public readonly usuarioId: string) {
    super(`Usuário ${usuarioId} não tem papel de aprovador.`);
    this.name = 'UsuarioNaoEhAprovador';
  }
}

export class IdempotencyKeyDuplicada extends Error {
  constructor(
    public readonly key: string,
    public readonly fichaExistenteId: string,
  ) {
    super(`Idempotency-Key ${key} já usada — ficha existente: ${fichaExistenteId}`);
    this.name = 'IdempotencyKeyDuplicada';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Erros do módulo de Estoque (almoxarifado / patrimônio, ADR 0020).
// Tradução pra HTTP na camada de apresentação (respostaDeErro):
//   MaterialNaoEncontrado/UnidadeNaoEncontrada/LocalNaoEncontrado/
//   CategoriaNaoEncontrada        → 404 Not Found
//   AlvoMovimentacaoInvalido/MovimentacaoInvalida/NaturezaIncompativel → 400
//   SaldoInsuficiente/TransicaoStatusInvalida/MaterialEmUso/
//   UnidadeComMovimentacao/LocalEmUso → 409 Conflict
// ─────────────────────────────────────────────────────────────────────────────

export class MaterialNaoEncontrado extends Error {
  constructor(public readonly id: string) {
    super(`Material não encontrado: ${id}`);
    this.name = 'MaterialNaoEncontrado';
  }
}

export class UnidadeNaoEncontrada extends Error {
  constructor(public readonly id: string) {
    super(`Unidade de estoque não encontrada: ${id}`);
    this.name = 'UnidadeNaoEncontrada';
  }
}

export class LocalNaoEncontrado extends Error {
  constructor(public readonly id: string) {
    super(`Local de estoque não encontrado: ${id}`);
    this.name = 'LocalNaoEncontrado';
  }
}

export class CategoriaNaoEncontrada extends Error {
  constructor(public readonly id: string) {
    super(`Categoria de estoque não encontrada: ${id}`);
    this.name = 'CategoriaNaoEncontrada';
  }
}

/** Alvo da movimentação não é exatamente um (unidade XOR material). HTTP 400. */
export class AlvoMovimentacaoInvalido extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'AlvoMovimentacaoInvalido';
  }
}

/** Regra estrutural da movimentação violada (locais, motivo, quantidade). HTTP 400. */
export class MovimentacaoInvalida extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'MovimentacaoInvalida';
  }
}

/** Natureza do material não bate com a operação (ex.: serializado num saldo). HTTP 400. */
export class NaturezaIncompativel extends Error {
  constructor(
    public readonly esperada: string,
    public readonly recebida: string,
  ) {
    super(`Natureza incompatível: esperada ${esperada}, recebida ${recebida}.`);
    this.name = 'NaturezaIncompativel';
  }
}

/**
 * Saída/baixa/transferência sem saldo suficiente. Disparado quando o UPDATE
 * guardado (`WHERE quantidade >= :q`) afeta 0 linhas. HTTP 409.
 */
export class SaldoInsuficiente extends Error {
  constructor(
    public readonly materialId: string,
    public readonly localId: string,
    public readonly solicitado: number,
  ) {
    super(
      `Saldo insuficiente do material ${materialId} no local ${localId} para retirar ${solicitado}.`,
    );
    this.name = 'SaldoInsuficiente';
  }
}

/** Transição de status inválida na máquina de estados da unidade. HTTP 409. */
export class TransicaoStatusInvalida extends Error {
  constructor(
    public readonly de: string,
    public readonly para: string,
  ) {
    super(`Transição de status inválida: ${de} → ${para}.`);
    this.name = 'TransicaoStatusInvalida';
  }
}

/** Hard-delete de material com vínculo (unidade/saldo/movimentação). HTTP 409. */
export class MaterialEmUso extends Error {
  constructor(public readonly id: string) {
    super(`Material ${id} possui vínculos e não pode ser excluído (foi inativado).`);
    this.name = 'MaterialEmUso';
  }
}

/** Exclusão de unidade que já tem movimentação (use baixa). HTTP 409. */
export class UnidadeComMovimentacao extends Error {
  constructor(public readonly id: string) {
    super(`Unidade ${id} possui movimentação e não pode ser excluída; use baixa.`);
    this.name = 'UnidadeComMovimentacao';
  }
}

/** Exclusão de local ainda referenciado por saldo/unidade/movimentação. HTTP 409. */
export class LocalEmUso extends Error {
  constructor(public readonly id: string) {
    super(`Local ${id} está em uso e não pode ser excluído.`);
    this.name = 'LocalEmUso';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Erros da conferência física de estoque (inventário, ADR 0021).
// Tradução pra HTTP na camada de apresentação (respostaDeErro):
//   ConferenciaNaoEncontrada/ItemConferenciaNaoEncontrado → 404 Not Found
//   ConferenciaFechada/ConferenciaNaoConcluida/EscopoConferenciaEmAberto → 409
// ─────────────────────────────────────────────────────────────────────────────

/** Sessão de conferência inexistente. HTTP 404. */
export class ConferenciaNaoEncontrada extends Error {
  constructor(public readonly id: string) {
    super(`Conferência não encontrada: ${id}`);
    this.name = 'ConferenciaNaoEncontrada';
  }
}

/** Item de conferência inexistente OU que não pertence à conferência do path (IDOR). HTTP 404. */
export class ItemConferenciaNaoEncontrado extends Error {
  constructor(public readonly id: string) {
    super(`Item de conferência não encontrado: ${id}`);
    this.name = 'ItemConferenciaNaoEncontrado';
  }
}

/** Editar contagem/sobra com a sessão fora de `aberta` (concluída/cancelada). HTTP 409. */
export class ConferenciaFechada extends Error {
  constructor(
    public readonly id: string,
    public readonly status: string,
  ) {
    super(`Conferência ${id} está ${status}; contagem só pode ser editada com a sessão aberta.`);
    this.name = 'ConferenciaFechada';
  }
}

/** Reconciliar antes de concluir a sessão (a contagem precisa estar fechada). HTTP 409. */
export class ConferenciaNaoConcluida extends Error {
  constructor(
    public readonly id: string,
    public readonly status: string,
  ) {
    super(`Conferência ${id} está ${status}; reconcilie apenas depois de concluir a contagem.`);
    this.name = 'ConferenciaNaoConcluida';
  }
}

/** Já existe uma conferência aberta no mesmo escopo (unidade + natureza + local). HTTP 409. */
export class EscopoConferenciaEmAberto extends Error {
  constructor(
    public readonly unidade: string,
    public readonly natureza: string,
    public readonly localId: string | null,
  ) {
    super(
      `Já existe uma conferência aberta neste escopo (${unidade}/${natureza}${localId ? `/${localId}` : ''}). Conclua ou cancele antes de abrir outra.`,
    );
    this.name = 'EscopoConferenciaEmAberto';
  }
}
