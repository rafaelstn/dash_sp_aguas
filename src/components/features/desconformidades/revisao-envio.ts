/**
 * Envio do "Marcar como revisado" sem JSX, para o teste em node conferir o
 * efeito: se a requisição sai e o que a pessoa lê depois.
 *
 * Na janela sem identidade o servidor recusa com 403 `identificacao_obrigatoria`
 * (a revisão grava autoria). Isso não é falha passageira: a mensagem diz que a
 * ação não está disponível, sem convidar a tentar de novo.
 */
import type { CategoriaDesconformidade } from '@/domain/desconformidade';

export const IDENTIFICACAO_OBRIGATORIA = 'identificacao_obrigatoria';

export const MENSAGEM_REVISAO_INDISPONIVEL =
  'Marcar como revisado exige usuário identificado e não está disponível no acesso sem identificação.';

export const MENSAGEM_FALHA_REVISAO = 'Falha ao registrar revisão. Tente novamente em instantes.';

export interface DadosRevisao {
  tipoEntidade: 'posto' | 'arquivo';
  idEntidade: string;
  categoria: CategoriaDesconformidade;
}

export type ResultadoRevisao =
  | { tipo: 'registrada' }
  | { tipo: 'indisponivel'; mensagem: string }
  | { tipo: 'falha'; mensagem: string };

type RespostaMinima = Pick<Response, 'ok' | 'status' | 'json'>;

export type EnviarRevisao = (dados: DadosRevisao) => Promise<RespostaMinima>;

async function codigoDoCorpo(resp: RespostaMinima): Promise<string | null> {
  try {
    const corpo: unknown = await resp.json();
    if (corpo && typeof corpo === 'object' && typeof (corpo as { erro?: unknown }).erro === 'string') {
      return (corpo as { erro: string }).erro;
    }
  } catch {
    /* corpo que não é JSON: fica como falha comum */
  }
  return null;
}

/**
 * `disponivel` vem da sessão lida no servidor (layout de desconformidades).
 * Falso: nem envia. Verdadeiro e o servidor discordar (a janela ligou depois da
 * carga da página): o 403 vira o mesmo "indisponível".
 */
export async function registrarRevisao(
  dados: DadosRevisao,
  disponivel: boolean,
  enviar: EnviarRevisao,
): Promise<ResultadoRevisao> {
  if (!disponivel) return { tipo: 'indisponivel', mensagem: MENSAGEM_REVISAO_INDISPONIVEL };
  let resp: RespostaMinima;
  try {
    resp = await enviar(dados);
  } catch {
    return { tipo: 'falha', mensagem: MENSAGEM_FALHA_REVISAO };
  }
  if (resp.ok) return { tipo: 'registrada' };
  if (resp.status === 403 && (await codigoDoCorpo(resp)) === IDENTIFICACAO_OBRIGATORIA) {
    return { tipo: 'indisponivel', mensagem: MENSAGEM_REVISAO_INDISPONIVEL };
  }
  return { tipo: 'falha', mensagem: MENSAGEM_FALHA_REVISAO };
}

export function enviarRevisaoPorFetch(dados: DadosRevisao): Promise<RespostaMinima> {
  return fetch('/api/desconformidades/revisoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
}
