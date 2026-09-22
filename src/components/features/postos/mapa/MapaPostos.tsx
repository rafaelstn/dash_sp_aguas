'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './mapa-postos.css';
import { Crosshair, Minus, Plus } from 'lucide-react';
import type { PontoMapaPosto } from '@/domain/mapa-postos';
import { CamadaCanvasPostos, type PontoDesenho } from './camada-canvas-postos';
import { GlifoPosto } from './GlifoPosto';
import { ROTULO_SITUACAO, estiloDoTipo } from './simbolos';
import { AVISO_COORDENADA_SUSPEITA, linhasDeLocal } from './local-posto';
import type { UgrhiSelecionada } from './estado-url';

/**
 * Mapa da tela Postos, em Leaflet puro.
 *
 * Por que não react-leaflet aqui (o antigo mapa do Monitor usava): a camada de pontos é um
 * `L.Layer` próprio em Canvas, e a máscara, os rótulos e o realce são
 * imperativos. Envolver isso em componentes declarativos só acrescentaria um
 * ciclo de render do React a cada movimento do mapa.
 *
 * A geometria do estado e das UGRHIs é estática (`public/geo`, gerada por
 * `scripts/geo/gerar-geometria-postos.mjs`). Nada aqui consulta WFS nem WMS em
 * tempo de execução, e o mapa funciona sem o fundo do OpenStreetMap: se os
 * blocos não chegam (rede do órgão bloqueando), postos e UGRHIs continuam na
 * tela e um aviso diz o que faltou.
 */

export interface LimitesMapa {
  readonly sul: number;
  readonly oeste: number;
  readonly norte: number;
  readonly leste: number;
}

export interface ControleMapa {
  enquadrarEstado(): void;
  enquadrarUgrhi(numero: number): void;
  /** Enquadra os pontos dados (outra UF, ou todas). Sem ponto, volta ao estado. */
  enquadrarPontos(pontos: readonly PontoMapaPosto[]): void;
  centralizarPosto(ponto: { lat: number; lon: number }): void;
}

export interface EstacaoOutraRede {
  readonly prefixo: string;
  readonly nome: string;
  readonly lat: number;
  readonly lon: number;
  readonly tipoHidrologico: string;
}

interface MapaPostosProps {
  readonly pontos: readonly PontoMapaPosto[];
  readonly outrasRedes: readonly EstacaoOutraRede[] | null;
  readonly selecionado: string | null;
  readonly realce: string | null;
  readonly ugrhi: UgrhiSelecionada;
  readonly rotuloEnquadrar: string;
  readonly aoEnquadrar: () => void;
  readonly aoSelecionar: (prefixo: string) => void;
  readonly aoRealcar: (prefixo: string | null) => void;
  readonly aoMudarLimites: (limites: LimitesMapa) => void;
  readonly aoPronto: (controle: ControleMapa) => void;
}

interface Colecao {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { codigo: number; nome: string };
    geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
  }>;
}

const LIMITE_SP = L.latLngBounds([-25.35, -53.15], [-19.75, -44.15]);
/** Até onde se arrasta o mapa em SP. Fora de SP o limite passa a ser o dos pontos. */
const ARRASTO_SP = LIMITE_SP.pad(0.35);
const ZOOM_MINIMO_SP = 5.5;
/** Posição do rótulo onde o centroide cai no mar ou fora do desenho. */
const AJUSTE_ROTULO: Record<number, [number, number]> = {
  3: [-23.55, -45.25],
  7: [-23.95, -46.35],
  11: [-24.45, -47.85],
  6: [-23.55, -46.55],
};
const ZOOM_NOMES = 8.5;
const COR_FUNDO = '#F4F6F8';

function centroide(anel: number[][]): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xj, yj] = anel[j] as [number, number];
    const [xi, yi] = anel[i] as [number, number];
    const f = xj * yi - xi * yj;
    a += f;
    cx += (xj + xi) * f;
    cy += (yj + yi) * f;
  }
  return [cy / (3 * a), cx / (3 * a)];
}

function preferenciaSemMovimento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ehCelular(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

/**
 * Folga base do encaixe do estado inteiro. No celular tem de ser zero: com 6 px
 * o encaixe (zoomSnap 0,25) caía um degrau e São Paulo ocupava 83% da largura,
 * contra 98% sem folga (medido a 390 px).
 */
function baseDoEstado(): number {
  return ehCelular() ? 0 : 20;
}

async function lerGeo(nome: string): Promise<Colecao | null> {
  try {
    const r = await fetch(`/geo/${nome}`);
    if (!r.ok) return null;
    return (await r.json()) as Colecao;
  } catch {
    return null;
  }
}

interface Dica {
  readonly x: number;
  readonly y: number;
  readonly ponto: PontoDesenho;
}

export function MapaPostos({
  pontos,
  outrasRedes,
  selecionado,
  realce,
  ugrhi,
  rotuloEnquadrar,
  aoEnquadrar,
  aoSelecionar,
  aoRealcar,
  aoMudarLimites,
  aoPronto,
}: MapaPostosProps) {
  const elemento = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<CamadaCanvasPostos | null>(null);
  const ugrhisRef = useRef<L.GeoJSON | null>(null);
  const rotulosRef = useRef<Array<{ codigo: number; nome: string; marcador: L.Marker }>>([]);
  const ugrhiRef = useRef<UgrhiSelecionada>(ugrhi);
  const pontosRef = useRef(new Map<string, PontoMapaPosto>());
  const controleRef = useRef<ControleMapa | null>(null);
  const atualizarRotulosRef = useRef<() => void>(() => undefined);
  const retornos = useRef({ aoSelecionar, aoRealcar, aoMudarLimites, aoPronto });
  retornos.current = { aoSelecionar, aoRealcar, aoMudarLimites, aoPronto };

  const [dica, setDica] = useState<Dica | null>(null);
  const [fundoIndisponivel, setFundoIndisponivel] = useState(false);
  const [geoIndisponivel, setGeoIndisponivel] = useState(false);

  // Montagem única do mapa.
  useEffect(() => {
    const el = elemento.current;
    if (!el) return;
    const semMovimento = preferenciaSemMovimento();
    const mapa = L.map(el, {
      preferCanvas: true,
      zoomControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      minZoom: ZOOM_MINIMO_SP,
      maxZoom: 16,
      maxBounds: ARRASTO_SP,
      maxBoundsViscosity: 0.7,
      fadeAnimation: !semMovimento,
      zoomAnimation: !semMovimento,
      markerZoomAnimation: !semMovimento,
    });
    mapaRef.current = mapa;
    mapa.attributionControl.setPrefix(false);

    mapa.fitBounds(LIMITE_SP, { ...folgaDaLegenda(LIMITE_SP, baseDoEstado()), animate: false });

    for (const [nome, z] of [
      ['mascara', 250],
      ['ugrhis', 380],
      ['rotulos', 420],
      ['postos', 450],
    ] as const) {
      const pane = mapa.createPane(nome);
      pane.style.zIndex = String(z);
      if (nome !== 'ugrhis') pane.style.pointerEvents = 'none';
    }

    let blocosOk = 0;
    let blocosErro = 0;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      className: 'mapa-postos-fundo',
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
      .on('tileload', () => {
        blocosOk++;
        setFundoIndisponivel(false);
      })
      .on('tileerror', () => {
        blocosErro++;
        if (blocosErro >= 4 && blocosOk === 0) setFundoIndisponivel(true);
      })
      .addTo(mapa);

    const camada = new CamadaCanvasPostos('postos');
    camada.addTo(mapa);
    camadaRef.current = camada;

    const atualizarRotulos = () => {
      const z = mapa.getZoom();
      const nomes = z >= ZOOM_NOMES;
      const sel = ugrhiRef.current;
      for (const r of rotulosRef.current) {
        const alvo = r.marcador.getElement()?.firstElementChild as HTMLElement | null | undefined;
        if (!alvo) continue;
        alvo.textContent = nomes ? r.nome : String(r.codigo);
        alvo.dataset.nome = nomes ? 'sim' : 'nao';
        // A UGRHI escolhida já está nomeada no filtro: o rótulo só cobriria os postos.
        const visivel = sel !== r.codigo && (typeof sel !== 'number' || nomes);
        alvo.style.display = visivel ? '' : 'none';
      }
    };

    const emitirLimites = () => {
      const b = mapa.getBounds();
      retornos.current.aoMudarLimites({
        sul: b.getSouth(),
        oeste: b.getWest(),
        norte: b.getNorth(),
        leste: b.getEast(),
      });
    };

    mapa.on('zoomend', atualizarRotulos);
    mapa.on('moveend', emitirLimites);

    let realceAtual: string | null = null;
    mapa.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (ehCelular()) return;
      const p = camada.acha(e.containerPoint.x, e.containerPoint.y);
      el.style.cursor = p && !p.externo ? 'pointer' : '';
      const novo = p && !p.externo ? p.prefixo : null;
      if (novo !== realceAtual) {
        realceAtual = novo;
        camada.definirRealce(novo);
        retornos.current.aoRealcar(novo);
      }
      setDica(p ? { x: e.containerPoint.x, y: e.containerPoint.y, ponto: p } : null);
    });
    mapa.on('mouseout movestart', () => {
      if (realceAtual !== null) {
        realceAtual = null;
        camada.definirRealce(null);
        retornos.current.aoRealcar(null);
      }
      setDica(null);
    });
    mapa.on('click', (e: L.LeafletMouseEvent) => {
      const p = camada.acha(e.containerPoint.x, e.containerPoint.y);
      if (p && !p.externo) retornos.current.aoSelecionar(p.prefixo);
      else if (p) setDica({ x: e.containerPoint.x, y: e.containerPoint.y, ponto: p });
    });

    let desmontado = false;
    void Promise.all([lerGeo('limite-sp.json'), lerGeo('ugrhis-sp.json')]).then(([sp, ugrhis]) => {
      if (desmontado) return;
      if (!sp || !ugrhis) setGeoIndisponivel(true);
      if (sp) {
        const aneis: L.LatLngExpression[][] = [];
        for (const poligono of sp.features[0]?.geometry.coordinates ?? []) {
          const externo = poligono[0];
          if (externo) aneis.push(externo.map(([x, y]) => [y as number, x as number]));
        }
        // Máscara: o mundo menos São Paulo, na cor do fundo. Põe o estado em primeiro plano.
        L.polygon(
          [
            [
              [-90, -180],
              [-90, 180],
              [90, 180],
              [90, -180],
            ],
            ...aneis,
          ],
          { pane: 'mascara', stroke: false, fillColor: COR_FUNDO, fillOpacity: 0.78, interactive: false },
        ).addTo(mapa);
        L.geoJSON(sp as unknown as GeoJSON.FeatureCollection, {
          pane: 'ugrhis',
          interactive: false,
          style: { color: '#1E3A8A', weight: 1.5, opacity: 0.8, fill: false },
        }).addTo(mapa);
      }
      if (ugrhis) {
        const camadaUg = L.geoJSON(ugrhis as unknown as GeoJSON.FeatureCollection, {
          pane: 'ugrhis',
          interactive: false,
          style: (f) => estiloUgrhi((f?.properties as { codigo: number }).codigo, ugrhiRef.current),
        }).addTo(mapa);
        ugrhisRef.current = camadaUg;
        rotulosRef.current = ugrhis.features.map((f) => {
          const codigo = f.properties.codigo;
          const anel = f.geometry.coordinates[0]?.[0] ?? [];
          const pos = AJUSTE_ROTULO[codigo] ?? centroide(anel);
          const icone = L.divIcon({ className: 'mapa-postos-rotulo', html: '<span></span>', iconSize: [0, 0] });
          const marcador = L.marker(pos, { pane: 'rotulos', interactive: false, keyboard: false, icon: icone }).addTo(mapa);
          return { codigo, nome: f.properties.nome, marcador };
        });
        atualizarRotulos();
        const sel = ugrhiRef.current;
        if (typeof sel === 'number') enquadrarUgrhi(sel, false);
      }
    });

    function enquadrarUgrhi(numero: number, animar = !preferenciaSemMovimento()) {
      const alvo = ugrhisRef.current
        ?.getLayers()
        .find((l) => codigoDaFeicao(l) === numero) as L.Polygon | undefined;
      if (!alvo) return;
      const limite = alvo.getBounds();
      mapa.fitBounds(limite, {
        ...folgaDaLegenda(limite, ehCelular() ? 10 : 24),
        animate: animar,
      });
    }

    /**
     * Folga do enquadramento. A legenda aberta ocupa o canto inferior esquerdo
     * e, medido no filtro PR a 1280 px, escondia a ponta oeste do estado. A
     * folga desvia dela pela lateral OU por baixo, o que deixar o zoom maior;
     * no celular a legenda nasce recolhida, então lá vale só a base.
     *
     * A `base` vem de quem chama porque cada enquadramento tem a sua, medida:
     * o estado no celular pede 0, porque com 6 px o encaixe (zoomSnap 0,25)
     * caía um degrau e ele passava de 98% para 83% da largura (a 390 px). Os
     * três enquadramentos passam por aqui de propósito: quando só o dos pontos
     * desviava da legenda, escolher uma UGRHI do oeste ou voltar para o estado
     * inteiro punha a ponta do recorte atrás dela.
     */
    function folgaDaLegenda(
      alvo: L.LatLngBounds,
      base = ehCelular() ? 16 : 32,
    ): L.FitBoundsOptions {
      const legenda = mapa
        .getContainer()
        .parentElement?.parentElement?.querySelector<HTMLElement>('section[aria-label="Legenda do mapa"]');
      if (ehCelular() || !legenda) return { padding: [base, base] };
      const largura = legenda.offsetWidth + 12;
      const altura = legenda.offsetHeight + 12;
      const pelaLateral = mapa.getBoundsZoom(alvo, false, L.point(base * 2 + largura, base * 2));
      const porBaixo = mapa.getBoundsZoom(alvo, false, L.point(base * 2, base * 2 + altura));
      return pelaLateral > porBaixo
        ? { paddingTopLeft: [base + largura, base], paddingBottomRight: [base, base] }
        : { paddingTopLeft: [base, base], paddingBottomRight: [base, base + altura] };
    }

    function enquadrarEstado() {
      mapa.setMinZoom(ZOOM_MINIMO_SP);
      mapa.setMaxBounds(ARRASTO_SP);
      mapa.fitBounds(LIMITE_SP, {
        ...folgaDaLegenda(LIMITE_SP, baseDoEstado()),
        animate: !preferenciaSemMovimento(),
      });
    }

    const controle: ControleMapa = {
      enquadrarEstado,
      enquadrarPontos: (lista) => {
        const coordenadas: L.LatLngTuple[] = [];
        for (const p of lista) if (p.lat !== null && p.lon !== null) coordenadas.push([p.lat, p.lon]);
        if (coordenadas.length === 0) {
          enquadrarEstado();
          return;
        }
        const alvo = L.latLngBounds(coordenadas);
        // O limite de arrasto e o zoom mínimo de SP prenderiam o mapa longe
        // dos postos do PR ou de MG: passam a cobrir os pontos e o estado.
        // O limite só volta depois do encaixe e cobrindo a vista resultante:
        // aplicado antes, ele puxava o centro de volta e anulava a folga da
        // legenda.
        mapa.setMinZoom(3);
        mapa.setMaxBounds();
        mapa.once('moveend', () => {
          mapa.setMaxBounds(mapa.getBounds().pad(0.25).extend(alvo.pad(0.5)).extend(ARRASTO_SP));
        });
        mapa.fitBounds(alvo, {
          ...folgaDaLegenda(alvo),
          maxZoom: 11,
          animate: !preferenciaSemMovimento(),
        });
      },
      enquadrarUgrhi: (n) => enquadrarUgrhi(n),
      centralizarPosto: ({ lat, lon }) => {
        const alvo = L.latLng(lat, lon);
        if (!mapa.getBounds().pad(-0.1).contains(alvo)) {
          mapa.setView(alvo, Math.max(mapa.getZoom(), 9), { animate: !preferenciaSemMovimento() });
        }
      },
    };
    controleRef.current = controle;
    retornos.current.aoPronto(controle);
    atualizarRotulosRef.current = atualizarRotulos;

    const observador = new ResizeObserver(() => mapa.invalidateSize({ animate: false }));
    observador.observe(el);
    emitirLimites();

    return () => {
      desmontado = true;
      observador.disconnect();
      mapa.remove();
      mapaRef.current = null;
      controleRef.current = null;
      camadaRef.current = null;
      ugrhisRef.current = null;
      rotulosRef.current = [];
    };
  }, []);

  // Pontos desenhados.
  useEffect(() => {
    const camada = camadaRef.current;
    if (!camada) return;
    const indice = new Map<string, PontoMapaPosto>();
    const desenho: PontoDesenho[] = [];
    for (const p of pontos) {
      if (p.lat === null || p.lon === null) continue;
      indice.set(p.prefixo, p);
      desenho.push({
        prefixo: p.prefixo,
        nome: p.nome,
        lat: p.lat,
        lon: p.lon,
        tipo: p.tipo,
        extinto: p.situacao === 'extinto',
        externo: false,
      });
    }
    for (const o of outrasRedes ?? []) {
      desenho.push({
        prefixo: o.prefixo,
        nome: o.nome,
        lat: o.lat,
        lon: o.lon,
        tipo: null,
        extinto: false,
        externo: true,
      });
    }
    pontosRef.current = indice;
    camada.definirPontos(desenho);
  }, [pontos, outrasRedes]);

  useEffect(() => {
    camadaRef.current?.definirSelecionado(selecionado);
  }, [selecionado]);

  // Realce vindo da lista (o do próprio mapa já foi aplicado no mousemove).
  useEffect(() => {
    camadaRef.current?.definirRealce(realce);
  }, [realce]);

  useEffect(() => {
    ugrhiRef.current = ugrhi;
    const camadaUg = ugrhisRef.current;
    camadaUg?.setStyle((f) => estiloUgrhi((f?.properties as { codigo: number }).codigo, ugrhi));
    atualizarRotulosRef.current();
  }, [ugrhi]);

  const detalhe = dica ? pontosRef.current.get(dica.ponto.prefixo) : undefined;

  return (
    <div className="relative isolate h-full w-full overflow-hidden bg-[#F4F6F8]">
      <div
        ref={elemento}
        className="mapa-postos h-full w-full"
        role="region"
        aria-label="Mapa dos postos. A lista ao lado tem os mesmos postos, navegável por teclado."
      />

      <div className="absolute right-3 top-3 z-[800] grid gap-2">
        <div className="grid overflow-hidden rounded-md bg-white/95 shadow-gov-card">
          <BotaoMapa rotulo="Aproximar" aoClicar={() => mapaRef.current?.zoomIn()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </BotaoMapa>
          <BotaoMapa rotulo="Afastar" aoClicar={() => mapaRef.current?.zoomOut()} separado>
            <Minus className="h-4 w-4" aria-hidden="true" />
          </BotaoMapa>
        </div>
        <div className="grid overflow-hidden rounded-md bg-white/95 shadow-gov-card">
          <BotaoMapa
            rotulo={rotuloEnquadrar}
            aoClicar={aoEnquadrar}
          >
            <Crosshair className="h-4 w-4" aria-hidden="true" />
          </BotaoMapa>
        </div>
      </div>

      {(fundoIndisponivel || geoIndisponivel) && (
        <p
          role="status"
          className="absolute left-1/2 top-3 z-[800] max-w-[calc(100%-7rem)] -translate-x-1/2 rounded-md bg-white/95 px-3 py-1.5 text-center text-xs text-app-fg-muted shadow-gov-card"
        >
          {fundoIndisponivel && !geoIndisponivel && 'Fundo do mapa indisponível. Postos e UGRHIs seguem visíveis.'}
          {geoIndisponivel && !fundoIndisponivel && 'Contorno das UGRHIs indisponível. Os postos seguem visíveis.'}
          {fundoIndisponivel && geoIndisponivel && 'Fundo e contornos do mapa indisponíveis. Os postos seguem visíveis.'}
        </p>
      )}

      {dica && <DicaPosto dica={dica} ponto={detalhe} largura={elemento.current?.clientWidth ?? 0} />}
    </div>
  );
}

function codigoDaFeicao(camada: L.Layer): number | undefined {
  return ((camada as L.Polygon).feature?.properties as { codigo?: number } | undefined)?.codigo;
}

function estiloUgrhi(codigo: number, selecionada: UgrhiSelecionada): L.PathOptions {
  if (selecionada === codigo) return { color: '#1E40AF', weight: 2.25, opacity: 0.95, fill: false };
  const haSelecao = typeof selecionada === 'number';
  return {
    color: '#1E3A8A',
    weight: 0.9,
    opacity: haSelecao ? 0.28 : 0.4,
    fill: haSelecao,
    fillColor: COR_FUNDO,
    fillOpacity: 0.55,
  };
}

function BotaoMapa({
  rotulo,
  aoClicar,
  separado = false,
  children,
}: {
  rotulo: string;
  aoClicar: () => void;
  separado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={rotulo}
      title={rotulo}
      className={`grid h-9 w-9 place-items-center text-app-fg-muted transition-colors duration-150 ease-gov-ease hover:bg-app-surface-2 hover:text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul ${
        separado ? 'border-t border-app-border-subtle' : ''
      }`}
    >
      {children}
    </button>
  );
}

function DicaPosto({
  dica,
  ponto,
  largura,
}: {
  dica: Dica;
  ponto: PontoMapaPosto | undefined;
  largura: number;
}) {
  const LARGURA_DICA = 260;
  const esquerda = dica.x + 14 + LARGURA_DICA > largura - 8 ? dica.x - LARGURA_DICA - 14 : dica.x + 14;
  const topo = dica.y < 90 ? dica.y + 14 : dica.y - 14;
  const transformar = dica.y < 90 ? '' : '-translate-y-full';
  const d = dica.ponto;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-[850] w-max max-w-[260px] rounded-md bg-white px-3 py-2 text-xs shadow-gov-card-hover ${transformar}`}
      style={{ left: Math.max(8, esquerda), top: topo }}
    >
      {d.externo ? (
        <>
          <p className="font-semibold text-app-fg">{d.nome ?? d.prefixo}</p>
          <p className="mt-0.5 text-app-fg-muted">Outra rede, fora do cadastro da SP Águas</p>
        </>
      ) : (
        <>
          <p className="font-semibold text-app-fg">
            <span className="tabular-nums">{d.prefixo}</span> {d.nome ?? 'Sem nome'}
          </p>
          {ponto &&
            linhasDeLocal(ponto).map((linha) => (
              <p key={linha} className="mt-0.5 text-app-fg-muted">
                {linha}
              </p>
            ))}
          {ponto?.coordenadaSuspeita && (
            <p className="mt-0.5 font-medium text-amber-900">{AVISO_COORDENADA_SUSPEITA}</p>
          )}
          <p className="mt-1 flex items-center gap-1.5 text-app-fg-muted">
            <GlifoPosto tipo={d.tipo} extinto={d.extinto} tamanho={11} />
            {estiloDoTipo(d.tipo).nome}, {ROTULO_SITUACAO[d.extinto ? 'extinto' : 'em_operacao'].toLocaleLowerCase('pt-BR')}
          </p>
        </>
      )}
    </div>
  );
}
