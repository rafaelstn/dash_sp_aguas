import type { Estacao } from './tipos';

/**
 * Paleta dos pontos do mapa do Monitor.
 *
 * Decisão (fase B2): hoje quase todas as estações são 'automatico', então uma
 * cor uniforme sóbria evita poluição. A diferenciação que importa pro operador
 * é "está vinculada a um posto do catálogo?" — essa ganha destaque por COR e
 * por FORMA (raio maior + anel branco), nunca só por cor (WCAG 1.4.1). Estações
 * manuais (poucas) recebem o âmbar de status pra se distinguirem das automáticas.
 *
 * As cores são literais (hex/hsl) e NÃO classes Tailwind: o renderer de canvas
 * do Leaflet desenha os pontos fora do fluxo de CSS, então precisa do valor
 * resolvido. Os hex abaixo são os mesmos tokens de globals.css.
 */

export type CategoriaPonto = 'vinculada' | 'automatica' | 'manual';

export interface EstiloPonto {
  categoria: CategoriaPonto;
  rotulo: string;
  /** Preenchimento do círculo. */
  cor: string;
  /** Cor da borda do círculo. */
  corBorda: string;
  /** Raio em pixels. Vinculadas maiores pra saltar aos olhos. */
  raio: number;
  /** Espessura da borda. */
  espessuraBorda: number;
}

// Tokens de globals.css resolvidos em hex.
const GOV_AZUL = '#1E40AF'; // --gov-azul
const GOV_AZUL_ESCURO = '#1E3A8A'; // --gov-azul-escuro
const STATUS_WARN = '#92400E'; // --status-warn (âmbar escuro, AA)
const BRANCO = '#FFFFFF';

export function categoriaDaEstacao(e: Estacao): CategoriaPonto {
  if (e.postoId) return 'vinculada';
  return e.tipo === 'manual' ? 'manual' : 'automatica';
}

const ESTILOS: Record<CategoriaPonto, EstiloPonto> = {
  vinculada: {
    categoria: 'vinculada',
    rotulo: 'Vinculada a posto do catálogo',
    cor: GOV_AZUL_ESCURO,
    corBorda: BRANCO,
    raio: 6,
    espessuraBorda: 2,
  },
  automatica: {
    categoria: 'automatica',
    rotulo: 'Automática (sem vínculo)',
    cor: GOV_AZUL,
    corBorda: GOV_AZUL_ESCURO,
    raio: 4,
    espessuraBorda: 1,
  },
  manual: {
    categoria: 'manual',
    rotulo: 'Manual',
    cor: STATUS_WARN,
    corBorda: BRANCO,
    raio: 4.5,
    espessuraBorda: 1,
  },
};

export function estiloDaEstacao(e: Estacao): EstiloPonto {
  return ESTILOS[categoriaDaEstacao(e)];
}

/** Itens da legenda, na ordem de exibição. */
export const LEGENDA: readonly EstiloPonto[] = [
  ESTILOS.vinculada,
  ESTILOS.automatica,
  ESTILOS.manual,
];
