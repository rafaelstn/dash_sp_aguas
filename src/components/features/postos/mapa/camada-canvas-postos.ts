import L from 'leaflet';
import type { TipoPostoMapa } from '@/domain/mapa-postos';
import {
  COR_OUTRAS_REDES,
  desenharSimbolo,
  estiloDoTipo,
  raioNoZoom,
  tracarForma,
} from './simbolos';

/**
 * Camada própria de Canvas para os postos.
 *
 * Por que não `L.circleMarker`: são até 5.790 pontos, e cada marcador do
 * Leaflet é um objeto com eventos e caminho próprios. MEDIDO no protótipo de
 * 17/09/2026 com 5.082 pontos: o redesenho desta camada custou 7,45 ms, sem
 * agrupamento, e o teste de clique é uma varredura linear do que está na tela.
 *
 * Dois canvas: o de baixo tem todos os pontos e só se redesenha quando o
 * enquadramento muda; o de cima tem só o realce (passar o mouse, item da lista
 * em foco, posto aberto), e redesenha a cada movimento sem tocar nos 5 mil.
 *
 * O pane dos postos não recebe ponteiro. O clique e o hover chegam pelo mapa,
 * e quem traduz pixel em posto é `acha`.
 */

export interface PontoDesenho {
  readonly prefixo: string;
  readonly nome: string | null;
  readonly lat: number;
  readonly lon: number;
  readonly tipo: TipoPostoMapa | null;
  readonly extinto: boolean;
  /** Estação de outra rede: desenhada em cinza, sem detalhe. */
  readonly externo: boolean;
}

interface NaTela {
  readonly x: number;
  readonly y: number;
  readonly ponto: PontoDesenho;
}

/** Ordem de pintura: o mais numeroso embaixo, o mais raro por cima. */
const ORDEM_TIPO: Record<string, number> = { plu: 0, flu: 1, meteo: 2, piezo: 3 };
const MARGEM = 8;

export class CamadaCanvasPostos extends L.Layer {
  private mapa: L.Map | null = null;
  private base: HTMLCanvasElement | null = null;
  private topo: HTMLCanvasElement | null = null;
  private pontos: readonly PontoDesenho[] = [];
  private naTela: NaTela[] = [];
  private selecionado: string | null = null;
  private realce: string | null = null;
  private raio = 4;

  constructor(private readonly nomePane: string) {
    super();
  }

  override onAdd(mapa: L.Map): this {
    this.mapa = mapa;
    const pane = mapa.getPane(this.nomePane) ?? mapa.getPanes().overlayPane;
    this.base = L.DomUtil.create('canvas', 'leaflet-zoom-hide', pane);
    this.topo = L.DomUtil.create('canvas', 'leaflet-zoom-hide', pane);
    mapa.on('moveend resize viewreset zoomend', this.redesenhar, this);
    this.redesenhar();
    return this;
  }

  override onRemove(mapa: L.Map): this {
    mapa.off('moveend resize viewreset zoomend', this.redesenhar, this);
    this.base?.remove();
    this.topo?.remove();
    this.base = null;
    this.topo = null;
    this.mapa = null;
    return this;
  }

  definirPontos(pontos: readonly PontoDesenho[]): void {
    this.pontos = [...pontos].sort((a, b) => {
      if (a.externo !== b.externo) return a.externo ? -1 : 1;
      if (a.extinto !== b.extinto) return a.extinto ? -1 : 1;
      return (ORDEM_TIPO[a.tipo ?? 'meteo'] ?? 0) - (ORDEM_TIPO[b.tipo ?? 'meteo'] ?? 0);
    });
    this.redesenhar();
  }

  definirSelecionado(prefixo: string | null): void {
    if (prefixo === this.selecionado) return;
    this.selecionado = prefixo;
    this.desenharRealce();
  }

  definirRealce(prefixo: string | null): void {
    if (prefixo === this.realce) return;
    this.realce = prefixo;
    this.desenharRealce();
  }

  /** Posto mais próximo do pixel (coordenada do contêiner), ou `null`. */
  acha(x: number, y: number): PontoDesenho | null {
    const alcance = (this.raio + 5) ** 2;
    let melhor: NaTela | null = null;
    let menor = alcance;
    for (const t of this.naTela) {
      const d = (t.x - x) ** 2 + (t.y - y) ** 2;
      if (d <= menor) {
        menor = d;
        melhor = t;
      }
    }
    return melhor?.ponto ?? null;
  }

  /** Posição na tela de um posto desenhado, para o tooltip de quem vem da lista. */
  posicaoDe(prefixo: string): { x: number; y: number } | null {
    const t = this.naTela.find((n) => n.ponto.prefixo === prefixo);
    return t ? { x: t.x, y: t.y } : null;
  }

  private prepararCanvas(canvas: HTMLCanvasElement, largura: number, altura: number) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    canvas.style.width = `${largura}px`;
    canvas.style.height = `${altura}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  redesenhar(): void {
    const mapa = this.mapa;
    if (!mapa || !this.base || !this.topo) return;
    const tamanho = mapa.getSize();
    const origem = mapa.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.base, origem);
    L.DomUtil.setPosition(this.topo, origem);
    const ctx = this.prepararCanvas(this.base, tamanho.x, tamanho.y);
    this.prepararCanvas(this.topo, tamanho.x, tamanho.y);
    if (!ctx) return;

    this.raio = raioNoZoom(mapa.getZoom());
    const r = this.raio;
    const naTela: NaTela[] = [];
    ctx.clearRect(0, 0, tamanho.x, tamanho.y);

    for (const p of this.pontos) {
      const pt = mapa.latLngToContainerPoint([p.lat, p.lon]);
      if (pt.x < -MARGEM || pt.y < -MARGEM || pt.x > tamanho.x + MARGEM || pt.y > tamanho.y + MARGEM) {
        continue;
      }
      if (p.externo) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = COR_OUTRAS_REDES;
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        desenharSimbolo(ctx, estiloDoTipo(p.tipo), p.extinto, pt.x, pt.y, r);
      }
      naTela.push({ x: pt.x, y: pt.y, ponto: p });
    }
    this.naTela = naTela;
    this.desenharRealce();
  }

  private desenharRealce(): void {
    const mapa = this.mapa;
    const canvas = this.topo;
    if (!mapa || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const tamanho = mapa.getSize();
    ctx.clearRect(0, 0, tamanho.x, tamanho.y);
    const r = this.raio;

    for (const prefixo of [this.realce, this.selecionado]) {
      if (!prefixo) continue;
      const t = this.naTela.find((n) => n.ponto.prefixo === prefixo);
      if (!t) continue;
      const selecionado = prefixo === this.selecionado;
      const estilo = estiloDoTipo(t.ponto.tipo);
      if (selecionado) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, r * 1.85 + 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(30,64,175,0.16)';
        ctx.fill();
      }
      tracarForma(ctx, estilo.forma, t.x, t.y, r + 3.2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = selecionado ? '#1E3A8A' : '#111827';
      ctx.stroke();
      if (t.ponto.externo) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, r * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = COR_OUTRAS_REDES;
        ctx.fill();
      } else {
        desenharSimbolo(ctx, estilo, t.ponto.extinto, t.x, t.y, r + 1);
      }
    }
  }
}
