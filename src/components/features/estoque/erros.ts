/**
 * Tratamento de erro da API de estoque no cliente. Traduz o corpo padronizado
 * do backend (`{ erro, mensagem, motivos }`) em mensagem PT-BR pronta para a
 * tela. A parte de mapeamento por codigo/status e PURA (testavel); o
 * `lancarErro` apenas le a resposta e delega.
 */

export class ErroEstoque extends Error {
  /** Slug estavel do backend (ex.: 'saldo_insuficiente', 'rate_limit'). */
  readonly codigo: string;
  readonly status: number;
  constructor(mensagem: string, codigo: string, status: number) {
    super(mensagem);
    this.name = 'ErroEstoque';
    this.codigo = codigo;
    this.status = status;
  }
}

export interface CorpoErroEstoque {
  erro?: string;
  mensagem?: string;
  motivos?: string[];
}

/** Mensagens amigaveis por codigo de negocio conhecido do modulo. */
const MENSAGEM_POR_CODIGO: Record<string, string> = {
  saldo_insuficiente:
    'Saldo insuficiente no local de origem para a quantidade informada.',
  transicao_invalida:
    'A mudança de situação não é permitida a partir da situação atual do item.',
  material_em_uso:
    'O material possui vínculos e foi inativado em vez de excluído.',
  unidade_com_movimentacao:
    'A unidade possui movimentação registrada e não pode ser excluída. Use uma baixa.',
  local_em_uso:
    'O local está em uso por itens ou saldos e não pode ser excluído.',
  natureza_incompativel:
    'A operação não é compatível com a natureza do item.',
  alvo_invalido:
    'Informe exatamente um alvo: uma unidade serializada ou um material quantificável.',
  movimentacao_invalida: 'Dados da movimentação inválidos. Revise os campos.',
  material_nao_encontrado: 'Material não encontrado.',
  unidade_nao_encontrada: 'Unidade não encontrada.',
  local_nao_encontrado: 'Local não encontrado.',
  categoria_nao_encontrada: 'Categoria não encontrada.',
  rate_limit:
    'Muitas operações em sequência. Aguarde alguns instantes e tente de novo.',
  // ── Conferência física (inventário) ──────────────────────────────────────
  escopo_conferencia_em_aberto:
    'Já existe uma conferência aberta para este escopo (unidade, natureza e local). Conclua ou cancele a conferência em aberto antes de abrir outra.',
  conferencia_fechada:
    'A conferência não está aberta. Não é possível registrar contagem em uma sessão já concluída ou cancelada.',
  conferencia_nao_concluida:
    'Conclua a conferência antes de reconciliar as divergências.',
  conferencia_nao_encontrada: 'Conferência não encontrada.',
  item_conferencia_nao_encontrado: 'Item de conferência não encontrado.',
};

const MENSAGEM_POR_STATUS: Record<number, string> = {
  400: 'Dados inválidos. Revise os campos e tente novamente.',
  401: 'Sua sessão expirou. Entre novamente para continuar.',
  403: 'Você não tem privilégio para esta ação.',
  404: 'Registro não encontrado.',
  409: 'A operação não pode ser concluída no estado atual.',
  429: 'Muitas operações em sequência. Aguarde alguns instantes e tente de novo.',
  500: 'Falha ao processar a solicitação. Tente novamente em instantes.',
};

/**
 * Resolve a mensagem a exibir a partir do corpo e do status. Prioriza: (1)
 * mensagem por codigo de negocio conhecido, (2) mensagem enviada pelo backend,
 * (3) motivos de validacao, (4) mensagem por status, (5) fallback generico.
 * Funcao PURA.
 */
export function mensagemDeErro(corpo: CorpoErroEstoque, status: number): string {
  const codigo = corpo.erro ?? '';
  if (codigo && MENSAGEM_POR_CODIGO[codigo]) return MENSAGEM_POR_CODIGO[codigo];
  if (corpo.mensagem) return corpo.mensagem;
  if (corpo.motivos && corpo.motivos.length > 0) return corpo.motivos.join(' ');
  return (
    MENSAGEM_POR_STATUS[status] ??
    'Não foi possível concluir a operação. Tente novamente em instantes.'
  );
}

/** Le a resposta nao-ok e lanca `ErroEstoque` com mensagem pronta. */
export async function lancarErro(resp: Response): Promise<never> {
  let corpo: CorpoErroEstoque = {};
  try {
    corpo = (await resp.json()) as CorpoErroEstoque;
  } catch {
    /* corpo nao-JSON: usa fallback por status */
  }
  const codigo = corpo.erro ?? `http_${resp.status}`;
  throw new ErroEstoque(mensagemDeErro(corpo, resp.status), codigo, resp.status);
}
