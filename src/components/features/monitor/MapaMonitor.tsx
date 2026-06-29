'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  WMSTileLayer,
  LayersControl,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import type { Estacao } from './tipos';
import { ROTULO_TIPO } from './tipos';
import {
  estiloDaEstacao,
  entidadeDaEstacao,
  ehVinculada,
  LEGENDA_ENTIDADES,
} from './paleta-monitor';

/**
 * GeoServer oficial do DAEE. As camadas são WMS (não há GeoJSON publicado),
 * o Leaflet reprojeta pro CRS do mapa. Mantidas com opacidade baixa pra
 * contextualizar sem competir com os pontos.
 */
const WMS_DAEE = 'https://geodados.daee.sp.gov.br/geoserver/geonode/wms';

// SP aproximado (lat -25.31..-19.78, lng -53.10..-44.16). Centro e zoom que
// enquadram o estado inteiro na carga inicial.
const CENTRO_SP: [number, number] = [-22.5, -48.6];
const ZOOM_SP = 7;

interface MapaMonitorProps {
  estacoes: readonly Estacao[];
  /** Abre o painel de detalhe da estação (botão "Ver leituras" do popup). */
  aoSelecionar: (estacao: Estacao) => void;
}

/**
 * Mapa Leaflet do Monitor pluviométrico. Client-only (depende de window);
 * a página o carrega via next/dynamic ssr:false.
 *
 * Performance: ~3690 pontos. NÃO usamos um componente React <CircleMarker> por
 * estação (montaria milhares de nós e popups). Desenhamos os círculos pela API
 * imperativa do Leaflet num único L.layerGroup sobre um renderer L.canvas(),
 * que aguenta milhares de vetores. Popup é criado sob demanda (bindPopup com
 * HTML escapado), não montado de antemão.
 */
export function MapaMonitor({ estacoes, aoSelecionar }: MapaMonitorProps) {
  return (
    <MapContainer
      center={CENTRO_SP}
      zoom={ZOOM_SP}
      preferCanvas
      scrollWheelZoom
      // O contêiner pai controla a altura; o mapa preenche 100%.
      className="h-full w-full"
      // O Leaflet expõe a área do mapa como região; rótulo p/ leitor de tela.
      // A lista textual (alternativa acessível) vive fora deste componente.
      aria-label="Mapa das estações pluviométricas de São Paulo"
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Mapa base (OpenStreetMap)">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>

        <LayersControl.Overlay checked name="Bacias / UGRHIs (DAEE)">
          <WMSTileLayer
            url={WMS_DAEE}
            params={{
              layers: 'geonode:ugrhis',
              format: 'image/png',
              transparent: true,
            }}
            opacity={0.35}
          />
        </LayersControl.Overlay>

        <LayersControl.Overlay name="Municípios (DAEE)">
          <WMSTileLayer
            url={WMS_DAEE}
            params={{
              layers: 'geonode:municipios_sp',
              format: 'image/png',
              transparent: true,
            }}
            opacity={0.3}
          />
        </LayersControl.Overlay>

        <LayersControl.Overlay name="Hidrografia (DAEE)">
          <WMSTileLayer
            url={WMS_DAEE}
            params={{
              layers: 'geonode:hidrografia_completa',
              format: 'image/png',
              transparent: true,
            }}
            opacity={0.45}
          />
        </LayersControl.Overlay>
      </LayersControl>

      <CamadaEstacoes estacoes={estacoes} aoSelecionar={aoSelecionar} />
      <Legenda />
    </MapContainer>
  );
}

/**
 * Escapa texto pra interpolar com segurança no HTML do popup. O conteúdo vem
 * do banco (nome/bacia de estação), então tratamos como não confiável.
 */
function esc(valor: string | null | undefined): string {
  if (valor == null) return '';
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlPopup(e: Estacao): string {
  const linhas: string[] = [];
  linhas.push(
    `<strong style="font-size:13px">${esc(e.nome) || 'Sem nome'}</strong>`,
  );
  const meta: string[] = [];
  if (e.prefixo) meta.push(`Prefixo ${esc(e.prefixo)}`);
  meta.push(ROTULO_TIPO[e.tipo]);
  if (e.bacia) meta.push(`UGRHI: ${esc(e.bacia)}`);
  linhas.push(
    `<div style="margin-top:4px;color:#4B5563;font-size:12px">${meta.join(' · ')}</div>`,
  );
  // Entidade responsável: bolinha colorida (mesma cor do ponto) + nome em texto.
  // A cor nunca é a única pista; o nome textual garante WCAG 1.4.1.
  const corEntidade = estiloDaEstacao(e).cor;
  linhas.push(
    `<div style="margin-top:4px;display:flex;align-items:center;gap:6px;color:#374151;font-size:12px"><span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:${corEntidade};border:1px solid #FFFFFF;box-shadow:0 0 0 1px #D1D5DB"></span>Entidade: ${esc(
      entidadeDaEstacao(e),
    )}</div>`,
  );
  // Botão data-ver-leituras: abre o painel de detalhe (gráfico de chuva) desta
  // estação. Disponível para toda estação (o painel não depende de posto).
  linhas.push(
    `<div style="margin-top:6px"><button type="button" data-ver-leituras="${esc(
      e.id,
    )}" style="font-size:12px;font-weight:600;color:#1E40AF;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline">Ver leituras</button></div>`,
  );
  // Status de vínculo SEMPRE em texto (não depende de cor nem forma do ponto).
  if (ehVinculada(e)) {
    linhas.push(
      `<div style="margin-top:4px;font-size:12px;color:#166534;font-weight:600">Vinculada a posto do catálogo</div>`,
    );
    if (e.prefixo) {
      // Botão data-prefixo: o handler de clique do popup navega via router
      // (SPA), evitando reload. Confirmado: rota real /postos/[prefixo].
      linhas.push(
        `<div style="margin-top:2px"><button type="button" data-prefixo="${esc(
          e.prefixo,
        )}" style="font-size:12px;font-weight:600;color:#1E40AF;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline">Abrir ficha do posto</button></div>`,
      );
    }
  } else {
    linhas.push(
      `<div style="margin-top:4px;font-size:12px;color:#5F6572">Sem posto vinculado</div>`,
    );
  }
  return `<div style="min-width:160px">${linhas.join('')}</div>`;
}

/**
 * Desenha os pontos no mapa via API imperativa (canvas). Reage a mudanças em
 * `estacoes` recriando o layerGroup. O clique no botão "Abrir ficha" navega
 * pelo router do Next (delegação de evento no contêiner do popup).
 */
function CamadaEstacoes({
  estacoes,
  aoSelecionar,
}: {
  estacoes: readonly Estacao[];
  aoSelecionar: (estacao: Estacao) => void;
}) {
  const map = useMap();
  const router = useRouter();
  const grupoRef = useRef<L.LayerGroup | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);
  // Ref ao callback: usado dentro do handler de popup sem recriar o layerGroup
  // (que é caro com milhares de pontos) quando só a identidade do callback muda.
  const aoSelecionarRef = useRef(aoSelecionar);
  aoSelecionarRef.current = aoSelecionar;

  useEffect(() => {
    if (!rendererRef.current) {
      rendererRef.current = L.canvas({ padding: 0.5 });
    }
    const renderer = rendererRef.current;

    const grupo = L.layerGroup();
    // Índice por id pra resolver a estação do botão "Ver leituras" no popup.
    const porId = new Map<string, Estacao>();
    for (const e of estacoes) {
      porId.set(e.id, e);
    }
    for (const e of estacoes) {
      if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) continue;
      const estilo = estiloDaEstacao(e);
      const marcador = L.circleMarker([e.lat, e.lng], {
        renderer,
        radius: estilo.raio,
        color: estilo.corBorda,
        weight: estilo.espessuraBorda,
        fillColor: estilo.cor,
        fillOpacity: 0.9,
        // Rótulo textual p/ tecnologia assistiva que lê o canvas; o mapa não é
        // a única via de acesso (a lista textual cumpre a alternativa e-MAG).
      });
      const partes = [e.nome || 'Sem nome'];
      if (e.prefixo) partes.push(`prefixo ${e.prefixo}`);
      partes.push(`entidade ${entidadeDaEstacao(e)}`);
      if (e.bacia) partes.push(`UGRHI ${e.bacia}`);
      partes.push(ROTULO_TIPO[e.tipo]);
      if (ehVinculada(e)) partes.push('vinculada a posto do catálogo');
      marcador.bindPopup(() => htmlPopup(e));
      marcador.bindTooltip(partes.join(', '));
      grupo.addLayer(marcador);
    }

    grupo.addTo(map);
    grupoRef.current = grupo;

    // Delegação: clique nos botões dentro de qualquer popup. "Abrir ficha"
    // navega via router; "Ver leituras" abre o painel de detalhe.
    function aoAbrirPopup(ev: L.PopupEvent) {
      const el = ev.popup.getElement();
      if (!el) return;

      const btnFicha = el.querySelector<HTMLButtonElement>('button[data-prefixo]');
      if (btnFicha) {
        btnFicha.addEventListener(
          'click',
          () => {
            const prefixo = btnFicha.getAttribute('data-prefixo');
            if (prefixo) router.push(`/postos/${encodeURIComponent(prefixo)}`);
          },
          { once: true },
        );
      }

      const btnLeituras = el.querySelector<HTMLButtonElement>(
        'button[data-ver-leituras]',
      );
      if (btnLeituras) {
        btnLeituras.addEventListener(
          'click',
          () => {
            const id = btnLeituras.getAttribute('data-ver-leituras');
            const estacao = id ? porId.get(id) : undefined;
            if (estacao) {
              map.closePopup();
              aoSelecionarRef.current(estacao);
            }
          },
          { once: true },
        );
      }
    }
    map.on('popupopen', aoAbrirPopup);

    return () => {
      map.off('popupopen', aoAbrirPopup);
      grupo.remove();
      grupoRef.current = null;
    };
  }, [estacoes, map, router]);

  return null;
}

/**
 * Legenda fixa no canto inferior esquerdo. Comunica:
 *  - COR por entidade responsável (uma linha por órgão, "Outros" por último);
 *  - FORMA do vínculo (ponto maior com anel branco grosso = vinculada), com
 *    rótulo textual próprio (a forma nunca é a única pista; WCAG 1.4.1).
 *
 * Recolhível no mobile pra não cobrir o mapa em telas pequenas.
 */
function Legenda() {
  const map = useMap();
  const entidades = useMemo(() => LEGENDA_ENTIDADES, []);

  useEffect(() => {
    const control = new L.Control({ position: 'bottomleft' });
    control.onAdd = () => {
      const div = L.DomUtil.create('div');
      div.setAttribute('role', 'group');
      div.setAttribute('aria-label', 'Legenda do mapa: entidade responsável e vínculo a posto');
      div.style.cssText =
        'background:#fff;padding:8px 10px;border-radius:8px;border:1px solid #E5E7EB;box-shadow:0 1px 3px rgba(0,0,0,.12);font-size:12px;line-height:1.4;max-width:200px';

      const linhasEntidade = entidades
        .map((i) => {
          const ponto = `display:inline-block;width:12px;height:12px;border-radius:9999px;background:${i.cor};border:1px solid #FFFFFF;box-shadow:0 0 0 1px #D1D5DB;margin-right:6px;vertical-align:middle;flex-shrink:0`;
          return `<div style="display:flex;align-items:center;margin:2px 0"><span aria-hidden="true" style="${ponto}"></span><span style="color:#111827">${i.rotulo}</span></div>`;
        })
        .join('');

      // Forma do vínculo: ponto maior, anel branco grosso, contornado em cinza
      // pra leitura sobre fundo claro. Texto explica a pista de forma.
      const pontoVinculo =
        'display:inline-block;width:15px;height:15px;border-radius:9999px;background:#6B7280;border:3px solid #FFFFFF;box-shadow:0 0 0 1px #9CA3AF;margin-right:6px;vertical-align:middle;flex-shrink:0';

      // innerHTML aqui é seguro: 100% literal de código (rótulos estáticos da
      // paleta), sem dado de usuário/banco. Conteúdo não confiável só aparece
      // no popup, com esc() antes da interpolação.
      div.innerHTML =
        `<details open><summary style="font-weight:600;color:#111827;cursor:pointer;list-style:none;margin-bottom:4px">Entidade responsável</summary>` +
        linhasEntidade +
        `<div style="height:1px;background:#E5E7EB;margin:6px 0"></div>` +
        `<div style="font-weight:600;color:#111827;margin-bottom:2px">Vínculo</div>` +
        `<div style="display:flex;align-items:center;margin:2px 0"><span aria-hidden="true" style="${pontoVinculo}"></span><span style="color:#111827">Vinculada a posto (ponto maior)</span></div>` +
        `</details>`;

      // Não capturar arrasto/scroll do mapa ao interagir com a legenda.
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map, entidades]);

  return null;
}
