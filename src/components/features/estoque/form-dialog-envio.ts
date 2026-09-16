/**
 * Regras do envio do FormDialog sem JSX nem DOM, para o teste em node conferir
 * o efeito: quantas vezes o `aoSalvar` roda e como o erro aparece.
 */

/** Erro de validação que pertence a um campo: o diálogo leva o foco até ele. */
export class ErroDeCampo extends Error {
  readonly campo: string;
  constructor(campo: string, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeCampo';
    this.campo = campo;
  }
}

export const MENSAGEM_PADRAO_FALHA = 'Não foi possível salvar. Tente novamente em instantes.';

export interface ErroExibido {
  mensagem: string;
  /** Campo que recebe aria-invalid e o foco; null é erro geral (role=alert no rodapé). */
  campo: string | null;
  /**
   * Só para erro de campo: a mensagem ao lado do campo vira role=alert quando o
   * foco JÁ está nele (Enter no próprio campo), porque mover o foco para onde ele
   * está não faz o leitor reler a descrição. Com o foco vindo de outro lugar, a
   * leitura sai do aria-describedby, uma vez só.
   */
  anunciar: boolean;
}

/**
 * Traduz o que o `aoSalvar` lançou. Campo que não está montado no formulário
 * vira erro geral, para a mensagem nunca ficar sem lugar na tela.
 */
export function erroParaExibir(
  e: unknown,
  campoEmFoco: string | null,
  camposMontados: ReadonlySet<string>,
): ErroExibido {
  const mensagem = e instanceof Error && e.message ? e.message : MENSAGEM_PADRAO_FALHA;
  if (e instanceof ErroDeCampo && camposMontados.has(e.campo)) {
    return { mensagem, campo: e.campo, anunciar: campoEmFoco === e.campo };
  }
  return { mensagem, campo: null, anunciar: true };
}

export interface TravaEnvio {
  current: boolean;
}

export type ResultadoEnvio =
  | { executou: false }
  | { executou: true; erro: null }
  | { executou: true; erro: unknown };

/**
 * Roda a ação uma vez por envio. A trava é um ref, e não estado do React: dois
 * submits no mesmo tick leem o mesmo `salvando` antigo e passariam os dois.
 * Sucesso mantém travado (o diálogo fecha; reabrir solta), falha solta para
 * tentar de novo.
 */
export async function enviarUmaVez(
  trava: TravaEnvio,
  acao: () => Promise<void>,
): Promise<ResultadoEnvio> {
  if (trava.current) return { executou: false };
  trava.current = true;
  try {
    await acao();
    return { executou: true, erro: null };
  } catch (e) {
    trava.current = false;
    return { executou: true, erro: e };
  }
}
