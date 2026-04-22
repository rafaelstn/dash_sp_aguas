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
