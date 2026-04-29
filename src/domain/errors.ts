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
