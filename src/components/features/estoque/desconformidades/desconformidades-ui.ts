/**
 * Logica PURA da aba de desconformidades do estoque: rotulos, validacao da nota
 * (espelha o PATCH), valores iniciais do cadastro a partir de `dados`, termo de
 * busca para ver o item repetido e acoes disponiveis por linha. Sem JSX nem I/O.
 */

import type {
  DesconformidadeDTO,
  LocalDTO,
  StatusDesconformidade,
  TipoDesconformidade,
} from '../dtos';

export const ROTULO_TIPO_DESCONFORMIDADE: Record<TipoDesconformidade, string> = {
  item_sem_descricao: 'Item sem descrição',
  identificador_repetido: 'Patrimônio repetido',
  chave_repetida: 'Linha sobrescrita',
  leitura_diferente_do_codigo: 'Etiqueta diferente do código',
  descricao_suspeita: 'Descrição é um link',
  quantidade_vazia: 'Quantidade vazia',
  coluna_sem_cabecalho: 'Coluna sem cabeçalho',
};

export const ROTULO_STATUS_DESCONFORMIDADE: Record<StatusDesconformidade, string> = {
  aberta: 'Aberta',
  resolvida: 'Resolvida',
  ignorada: 'Ignorada',
};

/** Titulo do estado vazio por status filtrado. */
export const VAZIO_POR_STATUS: Record<StatusDesconformidade, string> = {
  aberta: 'Nenhuma desconformidade aberta',
  resolvida: 'Nenhuma desconformidade resolvida',
  ignorada: 'Nenhuma desconformidade ignorada',
};

export function classeBadgeStatusDesconformidade(status: StatusDesconformidade): string {
  switch (status) {
    case 'aberta':
      return 'bg-amber-50 text-amber-900 border-amber-300';
    case 'resolvida':
      return 'bg-green-50 text-gov-sucesso border-green-300';
    case 'ignorada':
      return 'bg-app-surface-2 text-app-fg-muted border-app-border-subtle';
  }
}

/** Onde o problema esta na planilha: "GERAL PENHA, linha 12". */
export function localizacaoPlanilha(aba: string | null, linha: number | null): string {
  const temAba = typeof aba === 'string' && aba.trim() !== '';
  const temLinha = typeof linha === 'number' && Number.isFinite(linha);
  if (temAba && temLinha) return `${aba.trim()}, linha ${linha}`;
  if (temAba) return aba.trim();
  if (temLinha) return `Linha ${linha}`;
  return '—';
}

// ── Nota (espelha o servidor: 3 a 500, obrigatoria fora de `aberta`) ─────────
export const NOTA_MIN = 3;
export const NOTA_MAX = 500;
export const NOTA_CADASTRO = 'Cadastrado pela aba de desconformidades';

/** Devolve a mensagem de erro da nota ou null quando valida. */
export function validarNota(nota: string): string | null {
  const t = nota.trim();
  if (t.length === 0) return 'Escreva a nota.';
  if (t.length < NOTA_MIN) return `A nota precisa de ao menos ${NOTA_MIN} caracteres.`;
  if (t.length > NOTA_MAX) return `A nota aceita no máximo ${NOTA_MAX} caracteres.`;
  return null;
}

// ── Cadastro de item a partir de `item_sem_descricao` ───────────────────────
export interface ValoresCadastroItem {
  codigo: string;
  descricao: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  patDaee: string;
}

function textoDe(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/**
 * Valores iniciais do formulario. A descricao sempre comeca vazia: ela e o que
 * a planilha nao trouxe, e nao se inventa.
 */
export function valoresIniciaisCadastro(dados: Record<string, unknown>): ValoresCadastroItem {
  return {
    codigo: textoDe(dados.codigo),
    descricao: '',
    marca: textoDe(dados.marca),
    modelo: textoDe(dados.modelo),
    numeroSerie: textoDe(dados.numeroSerie),
    patDaee: textoDe(dados.patDaee),
  };
}

/**
 * Limites do POST /api/estoque/unidades. Devolve o primeiro campo inválido e a
 * mensagem, para o diálogo levar o foco a ele.
 */
export function campoInvalidoCadastro(
  v: ValoresCadastroItem,
): { campo: keyof ValoresCadastroItem; mensagem: string } | null {
  const descricao = v.descricao.trim();
  if (descricao.length === 0) return { campo: 'descricao', mensagem: 'Informe a descrição do item.' };
  if (descricao.length > 300)
    return { campo: 'descricao', mensagem: 'A descrição aceita no máximo 300 caracteres.' };
  if (v.marca.trim().length > 120)
    return { campo: 'marca', mensagem: 'A marca aceita no máximo 120 caracteres.' };
  if (v.modelo.trim().length > 120)
    return { campo: 'modelo', mensagem: 'O modelo aceita no máximo 120 caracteres.' };
  return null;
}

/** Devolve só a primeira mensagem de erro. */
export function validarCadastroItem(v: ValoresCadastroItem): string | null {
  return campoInvalidoCadastro(v)?.mensagem ?? null;
}

function normLocal(v: unknown): string {
  const t = textoDe(v)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
  return t === '?' || t === '-' || t === 'N/A' ? '' : t;
}

/**
 * Local cadastrado que corresponde a unidade, sala, prateleira e armario da
 * linha. So devolve quando ha exatamente um candidato; na duvida, vazio.
 */
export function localCorrespondente(
  dados: Record<string, unknown>,
  locais: readonly Pick<LocalDTO, 'id' | 'unidade' | 'sala' | 'prateleira' | 'armario'>[],
): string {
  const unidade = normLocal(dados.unidade);
  if (!unidade) return '';
  const sala = normLocal(dados.sala);
  const prateleira = normLocal(dados.prateleira);
  const armario = normLocal(dados.armario);
  if (!sala && !prateleira && !armario) return '';
  const candidatos = locais.filter(
    (l) =>
      normLocal(l.unidade) === unidade &&
      normLocal(l.sala) === sala &&
      normLocal(l.prateleira) === prateleira &&
      normLocal(l.armario) === armario,
  );
  return candidatos.length === 1 ? candidatos[0]!.id : '';
}

// ── Ver o item repetido na aba de itens ──────────────────────────────────────
/**
 * Termo para a busca da aba Serializados. So para patrimonio repetido e linha
 * sobrescrita; chave gerada por hash nao e buscavel e devolve null.
 */
export function termoBuscaDe(d: Pick<DesconformidadeDTO, 'tipo' | 'detalhe' | 'dados'>): string | null {
  if (d.tipo !== 'identificador_repetido' && d.tipo !== 'chave_repetida') return null;
  const doDado = textoDe(d.dados.valor) || textoDe(d.dados.codigo) || textoDe(d.dados.identificador);
  if (doDado) return doDado;

  const detalhe = d.detalhe.trim();
  if (d.tipo === 'identificador_repetido') {
    const fim = detalhe.indexOf(' em ');
    let termo = (fim > 0 ? detalhe.slice(0, fim) : '').trim();
    const campo = textoDe(d.dados.campo);
    if (campo && termo.startsWith(`${campo} `)) termo = termo.slice(campo.length + 1).trim();
    return termo || null;
  }
  const fim = detalhe.indexOf(' já usada');
  const chave = (fim > 0 ? detalhe.slice(0, fim) : '').trim();
  const partes = chave.split(':');
  if (partes.length < 2 || partes[1] === 'H') return null;
  const termo = partes.slice(1).join(':').trim();
  return termo || null;
}

// ── Filtro e paginação da lista ─────────────────────────────────────────────
export interface FiltroLista {
  status: StatusDesconformidade;
  tipo: '' | TipoDesconformidade;
  pagina: number;
}

export type MudancaFiltro =
  | { campo: 'status'; valor: StatusDesconformidade }
  | { campo: 'tipo'; valor: '' | TipoDesconformidade }
  | { campo: 'pagina'; valor: number };

/**
 * Trocar situação ou tipo volta para a página 1 no MESMO estado: sem isso a
 * lista busca a página antiga do filtro novo antes de corrigir.
 */
export function mudarFiltro(atual: FiltroLista, m: MudancaFiltro): FiltroLista {
  switch (m.campo) {
    case 'status':
      return m.valor === atual.status ? atual : { ...atual, status: m.valor, pagina: 1 };
    case 'tipo':
      return m.valor === atual.tipo ? atual : { ...atual, tipo: m.valor, pagina: 1 };
    case 'pagina':
      return m.valor === atual.pagina ? atual : { ...atual, pagina: Math.max(1, m.valor) };
  }
}

/**
 * Página para onde voltar quando a atual veio vazia mas ainda há registros
 * (resolveu ou ignorou o último item da última página). `null` = nada a fazer.
 */
export function paginaDeRecuo(
  pagina: number,
  total: number,
  porPagina: number,
  qtdItens: number,
): number | null {
  if (qtdItens > 0 || total <= 0 || pagina <= 1) return null;
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  return ultima < pagina ? ultima : null;
}

/** Linha que recebe o foco depois de uma ação: a mesma posição ou a última. */
export function indiceDeFoco(indiceAnterior: number, qtdItens: number): number | null {
  if (qtdItens <= 0) return null;
  return Math.min(Math.max(0, indiceAnterior), qtdItens - 1);
}

// ── Acoes por linha ──────────────────────────────────────────────────────────
export type AcaoDesconformidade = 'cadastrar' | 'resolver' | 'ignorar' | 'reabrir' | 'verItens';

/** Acoes na ordem de exibicao. Escrita so com `podeGerenciar`; ver itens e leitura. */
export function acoesDisponiveis(
  d: Pick<DesconformidadeDTO, 'tipo' | 'status' | 'detalhe' | 'dados'>,
  podeGerenciar: boolean,
): AcaoDesconformidade[] {
  const acoes: AcaoDesconformidade[] = [];
  if (termoBuscaDe(d)) acoes.push('verItens');
  if (!podeGerenciar) return acoes;
  if (d.status === 'aberta') {
    if (d.tipo === 'item_sem_descricao') acoes.unshift('cadastrar');
    acoes.push('resolver', 'ignorar');
  } else {
    acoes.push('reabrir');
  }
  return acoes;
}
