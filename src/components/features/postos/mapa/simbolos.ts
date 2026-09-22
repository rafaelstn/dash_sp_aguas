import type { SituacaoPosto, TipoPostoMapa, Transmissao, OpcaoVazao } from '@/domain/mapa-postos';

/**
 * Símbolos do mapa de postos: cor e forma por tipo, preenchimento por situação.
 *
 * A cor nunca é a única pista (WCAG 1.4.1): cada tipo tem uma FORMA própria, e
 * a situação muda o preenchimento (cheio em operação, vazado quando extinto).
 * As cores passam 3:1 sobre o fundo claro do mapa, medidas no protótipo de
 * 17/09/2026. O meteorológico é neutro de propósito: são 156 postos e não
 * podem competir com os três tipos que a tela existe para mostrar.
 */

export type Forma = 'circulo' | 'quadrado' | 'triangulo' | 'losango';

export interface EstiloTipo {
  readonly nome: string;
  readonly plural: string;
  readonly cor: string;
  readonly forma: Forma;
}

export const ESTILO_TIPO: Readonly<Record<TipoPostoMapa, EstiloTipo>> = {
  plu: { nome: 'Pluviométrico', plural: 'Pluviométricos', cor: '#2563A8', forma: 'circulo' },
  flu: { nome: 'Fluviométrico', plural: 'Fluviométricos', cor: '#0E8A6A', forma: 'quadrado' },
  piezo: { nome: 'Piezométrico', plural: 'Piezométricos', cor: '#C2410C', forma: 'triangulo' },
  meteo: { nome: 'Meteorológico', plural: 'Meteorológicos', cor: '#4B5563', forma: 'losango' },
};

/** Posto cujo tipo a base não reconhece. Aparece, mas não finge ser de um tipo. */
export const ESTILO_SEM_TIPO: EstiloTipo = {
  nome: 'Tipo não reconhecido',
  plural: 'Tipo não reconhecido',
  cor: '#6B7280',
  forma: 'losango',
};

/** Estação de outra rede (SIBH), sem posto no cadastro do órgão. */
export const COR_OUTRAS_REDES = '#6B7280';

export function estiloDoTipo(tipo: TipoPostoMapa | null): EstiloTipo {
  return tipo ? ESTILO_TIPO[tipo] : ESTILO_SEM_TIPO;
}

export const ROTULO_SITUACAO: Readonly<Record<SituacaoPosto, string>> = {
  em_operacao: 'Em operação',
  extinto: 'Extinto',
};

export const ROTULO_TRANSMISSAO: Readonly<Record<Transmissao, string>> = {
  telemetrico: 'Telemétrico',
  gravacao_local: 'Gravação local',
  convencional: 'Convencional',
};

export const ROTULO_VAZAO: Readonly<Record<OpcaoVazao, string>> = {
  aparelho_ativo: 'Aparelho de vazão ativo',
  medicao: 'Com medição de campo',
  curva: 'Com curva-chave',
  qualquer: 'Qualquer fonte de vazão',
};

/** Raio do símbolo em pixels por nível de zoom. */
export function raioNoZoom(zoom: number): number {
  if (zoom < 7) return 3.3;
  if (zoom < 8) return 3.9;
  if (zoom < 9.5) return 4.7;
  return 5.8;
}

/** Traça o caminho da forma centrada em (x, y). Quem chama decide fill e stroke. */
export function tracarForma(
  ctx: CanvasRenderingContext2D,
  forma: Forma,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  switch (forma) {
    case 'circulo':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
    case 'quadrado': {
      const h = r * 0.9;
      ctx.rect(x - h, y - h, h * 2, h * 2);
      break;
    }
    case 'triangulo': {
      const h = r * 1.22;
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h * 0.95, y + h * 0.68);
      ctx.lineTo(x - h * 0.95, y + h * 0.68);
      ctx.closePath();
      break;
    }
    case 'losango': {
      const h = r * 1.15;
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x - h, y);
      ctx.closePath();
      break;
    }
  }
}

/** Desenha o símbolo completo de um posto: em operação cheio, extinto vazado. */
export function desenharSimbolo(
  ctx: CanvasRenderingContext2D,
  estilo: EstiloTipo,
  extinto: boolean,
  x: number,
  y: number,
  r: number,
): void {
  tracarForma(ctx, estilo.forma, x, y, r);
  if (extinto) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = estilo.cor;
    ctx.stroke();
  } else {
    ctx.fillStyle = estilo.cor;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
  }
}
