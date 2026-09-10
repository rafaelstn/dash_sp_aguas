/**
 * Traduz o corpo de erro da API para a frase que a pessoa lê na tela.
 *
 * O contrato de erro da API é `{ erro: <slug>, mensagem: <texto>, ... }`
 * (ver `src/app/api/_helpers/erros.ts`). `erro` existe para o código decidir e
 * `mensagem` existe para a pessoa ler. Imprimir `erro` põe `erro_interno`,
 * `falha_repositorio` ou `estado_invalido` na frente de quem acabou de
 * preencher um formulário inteiro, o que não ajuda ninguém a se achar.
 *
 * O `correlationId` entra no fim quando existe, e não é enfeite: é o único fio
 * entre o que a pessoa viu e o que o servidor registrou, e sem ele o relato ao
 * suporte vira "deu erro".
 *
 * Função pura de propósito, sem `'use client'` e sem `server-only`: formatação
 * não tem lado, e quem precisar dela dos dois lados importa daqui.
 */
export interface CorpoDeErroDaApi {
  erro?: unknown;
  mensagem?: unknown;
  correlationId?: unknown;
}

function textoNaoVazio(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor.trim() : null;
}

export function mensagemDeFalha(corpo: unknown, alternativa: string): string {
  const body: CorpoDeErroDaApi =
    corpo !== null && typeof corpo === 'object' ? (corpo as CorpoDeErroDaApi) : {};

  const base = textoNaoVazio(body.mensagem) ?? textoNaoVazio(body.erro) ?? alternativa;
  const correlacao = textoNaoVazio(body.correlationId);

  return correlacao ? `${base} (código: ${correlacao})` : base;
}
