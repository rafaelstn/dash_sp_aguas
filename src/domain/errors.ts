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

export class TermoBuscaInvalido extends Error {
  constructor(motivo: string) {
    super(`Termo de busca inválido: ${motivo}`);
    this.name = 'TermoBuscaInvalido';
  }
}

export class FalhaRepositorio extends Error {
  constructor(operacao: string, causa: unknown) {
    super(`Falha no repositório (${operacao}): ${String(causa)}`);
    this.name = 'FalhaRepositorio';
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
// Erros do módulo de triagem (Fase 2.A — ADR-0008).
// Tradução pra HTTP é responsabilidade da camada de apresentação:
//   EstadoTriagemInvalido           → 409 Conflict
//   LockRevisaoNegado               → 423 Locked
//   MotivoRejeicaoInsuficiente      → 400 Bad Request
//   AprovadorSemMFA                 → 403 Forbidden
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

export class AprovadorSemMFA extends Error {
  constructor(public readonly usuarioId: string) {
    super(`Usuário ${usuarioId} é aprovador mas não tem MFA verificado.`);
    this.name = 'AprovadorSemMFA';
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
