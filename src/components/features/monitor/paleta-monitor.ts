import type { Estacao } from './tipos';

/**
 * Paleta dos pontos do mapa do Monitor.
 *
 * Decisão (fase B4): a COR de cada ponto passa a representar a ENTIDADE
 * responsável (owner / SIBH station_owner), igual ao painel oficial. Cada órgão
 * tem uma cor própria, com "Outros" (cinza) cobrindo donos raros e null.
 *
 * A informação "vinculada a um posto do catálogo" NÃO é representada por cor
 * (WCAG 1.4.1: não diferenciar apenas por cor). Ela é comunicada por FORMA:
 * raio maior + anel branco mais grosso ao redor do ponto. Além disso, segue
 * presente em texto no popup do mapa e na lista textual (alternativa acessível).
 *
 * As cores são literais hex (NÃO classes Tailwind): o renderer de canvas do
 * Leaflet desenha os pontos fora do fluxo de CSS, então precisa do valor
 * resolvido. Os hex abaixo casam com o painel oficial (sao-paulo-rain-map).
 */

// Cor por entidade. Ordenadas por contagem/relevância nos dados de produção.
// "Outros" sempre por último (cobre CPFL - ANA, EMAE - ANA, DIVERSAS e null).
export const COR_OUTROS = '#94a3b8'; // cinza

export interface EntidadeCor {
  /** Nome da entidade como vem do owner (chave de comparação). */
  nome: string;
  /** Rótulo exibido (igual ao nome, já acentuado). */
  rotulo: string;
  /** Cor de preenchimento do ponto (hex literal). */
  cor: string;
}

/**
 * Entidades conhecidas, na ordem de relevância (contagem em produção).
 * Quem não estiver aqui (ou owner null) cai em "Outros".
 */
export const ENTIDADES: readonly EntidadeCor[] = [
  { nome: 'SP ÁGUAS', rotulo: 'SP Águas', cor: '#3b82f6' }, // azul
  { nome: 'CEMADEN', rotulo: 'CEMADEN', cor: '#10b981' }, // verde
  { nome: 'ANA', rotulo: 'ANA', cor: '#8b5cf6' }, // roxo
  { nome: 'IAC', rotulo: 'IAC', cor: '#14b8a6' }, // teal
  { nome: 'SABESP', rotulo: 'SABESP', cor: '#ec4899' }, // rosa
  { nome: 'SAISP', rotulo: 'SAISP', cor: '#a855f7' }, // roxo claro
  { nome: 'INMET', rotulo: 'INMET', cor: '#06b6d4' }, // ciano
  { nome: 'CETESB', rotulo: 'CETESB', cor: '#ef4444' }, // vermelho
];

// Item de "Outros" para legenda e filtro (agrupa donos raros e null).
export const ENTIDADE_OUTROS: EntidadeCor = {
  nome: 'Outros',
  rotulo: 'Outros',
  cor: COR_OUTROS,
};

// Índice nome -> cor, resolvido uma vez.
const COR_POR_NOME = new Map<string, string>(
  ENTIDADES.map((e) => [e.nome, e.cor]),
);

/**
 * Cor de um owner. owner null/desconhecido -> cinza de "Outros".
 * Aceita owner com espaços extras (normaliza trim).
 */
export function corDoOwner(owner: string | null | undefined): string {
  if (!owner) return COR_OUTROS;
  return COR_POR_NOME.get(owner.trim()) ?? COR_OUTROS;
}

/**
 * Chave de entidade de uma estação, usada por filtro e legenda. Mapeia owners
 * conhecidos pro próprio nome; desconhecidos e null para "Outros".
 */
export function entidadeDaEstacao(e: Estacao): string {
  const owner = e.owner?.trim();
  if (owner && COR_POR_NOME.has(owner)) return owner;
  return 'Outros';
}

// --- Forma: vínculo a posto do catálogo (independente da cor) ---

export interface FormaPonto {
  /** Raio em pixels. */
  raio: number;
  /** Espessura da borda branca. */
  espessuraBorda: number;
}

// Vinculadas a posto: maiores e com anel branco mais grosso (pista de FORMA).
const FORMA_VINCULADA: FormaPonto = { raio: 6.5, espessuraBorda: 2.5 };
const FORMA_PADRAO: FormaPonto = { raio: 4, espessuraBorda: 1 };

export function ehVinculada(e: Estacao): boolean {
  return e.vinculadoAPosto;
}

export function formaDaEstacao(e: Estacao): FormaPonto {
  return ehVinculada(e) ? FORMA_VINCULADA : FORMA_PADRAO;
}

export interface EstiloPonto {
  cor: string;
  corBorda: string;
  raio: number;
  espessuraBorda: number;
}

/** Estilo completo do ponto: cor pela entidade, forma pelo vínculo. */
export function estiloDaEstacao(e: Estacao): EstiloPonto {
  const forma = formaDaEstacao(e);
  return {
    cor: corDoOwner(e.owner),
    corBorda: '#FFFFFF',
    raio: forma.raio,
    espessuraBorda: forma.espessuraBorda,
  };
}

/**
 * Itens da legenda de entidades, na ordem de exibição (relevância), com
 * "Outros" por último. A pista de FORMA (vinculada) tem entrada própria na
 * legenda do mapa, separada das cores de entidade.
 */
export const LEGENDA_ENTIDADES: readonly EntidadeCor[] = [
  ...ENTIDADES,
  ENTIDADE_OUTROS,
];
