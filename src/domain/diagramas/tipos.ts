/**
 * Domínio dos Diagramas Unifilares.
 *
 * Portado do protótipo Lovable (`types/diagram.ts`), que era front-only sobre
 * localStorage. Aqui o modelo de dados é o mesmo (4 tipos de elemento, status
 * por limiares), mas vive na camada de domínio: puro, sem I/O, testável de
 * forma isolada. O array de elementos é persistido como JSONB; o backend só
 * guarda e devolve, quem manipula é o editor (fases A2/A3).
 *
 * Os 4 elementos do diagrama:
 *   reservatorio : caixa/represa, apenas rótulo.
 *   nivel        : posto de nível, valor numérico avaliado contra limiares.
 *   chuva        : posto pluviométrico, valor numérico (mm) informativo.
 *   linha        : trecho de rio/canal, ligação visual entre elementos.
 */

/** Tipos de status hidrológico, do mais calmo ao mais crítico. */
export type StatusNivel =
  | 'normal'
  | 'atencao'
  | 'alerta'
  | 'emergencia'
  | 'extravasamento';

/**
 * Limiares de um posto de nível, em ordem crescente. Cada limiar é o piso a
 * partir do qual o status correspondente passa a valer. Todos opcionais: um
 * posto pode ter só alguns configurados.
 */
export interface LimiaresNivel {
  /** Piso do status `atencao`. */
  atencao?: number | null;
  /** Piso do status `alerta`. */
  alerta?: number | null;
  /** Piso do status `emergencia`. */
  emergencia?: number | null;
  /** Piso do status `extravasamento` (transbordo). */
  extravasamento?: number | null;
}

/** Coordenada no canvas do editor. */
export interface Posicao {
  x: number;
  y: number;
}

/** Campos comuns a todos os elementos. */
interface ElementoBase {
  /** Identificador local do elemento dentro do diagrama (gerado no editor). */
  id: string;
  posicao: Posicao;
}

/** Reservatório: caixa-d'água ou represa. Só rótulo, sem valor medido. */
export interface ElementoReservatorio extends ElementoBase {
  tipo: 'reservatorio';
  nome: string;
}

/** Posto de nível: valor avaliado contra os limiares para definir o status. */
export interface ElementoNivel extends ElementoBase {
  tipo: 'nivel';
  /** Código/prefixo do posto (liga ao catálogo na fase A5). */
  codigo: string;
  nome: string;
  /** Valor medido. Null quando ainda não há leitura. */
  valor: number | null;
  /** Unidade de medida exibida (ex.: 'm', 'cm'). */
  unidade?: string | null;
  limiares: LimiaresNivel;
}

/** Posto de chuva: valor pluviométrico informativo (mm). */
export interface ElementoChuva extends ElementoBase {
  tipo: 'chuva';
  codigo: string;
  nome: string;
  /** Acumulado em mm. Null quando ainda não há leitura. */
  valor: number | null;
}

/** Direção da seta desenhada sobre o trecho de rio. */
export type DirecaoSeta = 'nenhuma' | 'direta' | 'reversa';

/** Linha/rio: liga visualmente elementos, com pontos, rótulo e seta. */
export interface ElementoLinha extends ElementoBase {
  tipo: 'linha';
  /** Vértices do traçado (mínimo 2). A `posicao` base é o primeiro ponto. */
  pontos: Posicao[];
  label?: string | null;
  direcaoSeta: DirecaoSeta;
}

/** União fechada dos 4 tipos de elemento de um diagrama. */
export type ElementoDiagrama =
  | ElementoReservatorio
  | ElementoNivel
  | ElementoChuva
  | ElementoLinha;

/**
 * Cor de cada status, em tokens do tema (consumidos pela UI). Mantém o
 * mapeamento num único ponto pra custom nodes e legenda não divergirem.
 */
export const STATUS_COLORS: Record<StatusNivel, string> = {
  normal: 'hsl(var(--status-hidro-normal))',
  atencao: 'hsl(var(--status-hidro-atencao))',
  alerta: 'hsl(var(--status-hidro-alerta))',
  emergencia: 'hsl(var(--status-hidro-emergencia))',
  extravasamento: 'hsl(var(--status-hidro-extravasamento))',
};

/** Rótulo legível de cada status, para legenda e leitor de tela. */
export const STATUS_LABELS: Record<StatusNivel, string> = {
  normal: 'Normal',
  atencao: 'Atenção',
  alerta: 'Alerta',
  emergencia: 'Emergência',
  extravasamento: 'Extravasamento',
};

/**
 * Calcula o status de um posto de nível a partir do valor medido e dos
 * limiares. Avalia do mais crítico ao menos crítico: o primeiro limiar
 * definido que o valor alcança vence. Limiares ausentes (null/undefined)
 * são ignorados. Valor ausente devolve `normal` (sem leitura, sem alarme).
 *
 * Domínio puro: sem I/O, totalmente testável.
 */
export function calcularStatus(
  valor: number | null | undefined,
  limiares: LimiaresNivel | null | undefined,
): StatusNivel {
  if (valor === null || valor === undefined || !limiares) {
    return 'normal';
  }
  const { atencao, alerta, emergencia, extravasamento } = limiares;
  if (extravasamento != null && valor >= extravasamento) return 'extravasamento';
  if (emergencia != null && valor >= emergencia) return 'emergencia';
  if (alerta != null && valor >= alerta) return 'alerta';
  if (atencao != null && valor >= atencao) return 'atencao';
  return 'normal';
}
