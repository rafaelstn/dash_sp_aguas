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
import { estiloDaEstacao, LEGENDA } from './paleta-monitor';

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
export function MapaMonitor({ estacoes }: MapaMonitorProps) {
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

      <CamadaEstacoes estacoes={estacoes} />
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
  if (e.bacia) meta.push(`Bacia: ${esc(e.bacia)}`);
  linhas.push(
    `<div style="margin-top:4px;color:#4B5563;font-size:12px">${meta.join(' · ')}</div>`,
  );
  if (e.postoId && e.prefixo) {
    // Botão data-prefixo: o handler de clique do popup navega via router
    // (SPA), evitando reload. Confirmado: rota real /postos/[prefixo].
    linhas.push(
      `<div style="margin-top:6px"><button type="button" data-prefixo="${esc(
        e.prefixo,
      )}" style="font-size:12px;font-weight:600;color:#1E40AF;background:none;border:none;padding:0;cursor:pointer;text-decoration:underline">Abrir ficha do posto</button></div>`,
    );
  } else if (e.prefixo) {
    linhas.push(
      `<div style="margin-top:6px;font-size:12px;color:#5F6572">Sem posto vinculado</div>`,
    );
  }
  return `<div style="min-width:160px">${linhas.join('')}</div>`;
}

/**
 * Desenha os pontos no mapa via API imperativa (canvas). Reage a mudanças em
 * `estacoes` recriando o layerGroup. O clique no botão "Abrir ficha" navega
 * pelo router do Next (delegação de evento no contêiner do popup).
 */
function CamadaEstacoes({ estacoes }: { estacoes: readonly Estacao[] }) {
  const map = useMap();
  const router = useRouter();
  const grupoRef = useRef<L.LayerGroup | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);

  useEffect(() => {
    if (!rendererRef.current) {
      rendererRef.current = L.canvas({ padding: 0.5 });
    }
    const renderer = rendererRef.current;

    const grupo = L.layerGroup();
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
      if (e.bacia) partes.push(`bacia ${e.bacia}`);
      partes.push(ROTULO_TIPO[e.tipo]);
      marcador.bindPopup(() => htmlPopup(e));
      marcador.bindTooltip(partes.join(', '));
      grupo.addLayer(marcador);
    }

    grupo.addTo(map);
    grupoRef.current = grupo;

    // Delegação: clique no botão dentro de qualquer popup navega via router.
    function aoAbrirPopup(ev: L.PopupEvent) {
      const el = ev.popup.getElement();
      const botao = el?.querySelector<HTMLButtonElement>('button[data-prefixo]');
      if (!botao) return;
      botao.addEventListener(
        'click',
        () => {
          const prefixo = botao.getAttribute('data-prefixo');
          if (prefixo) router.push(`/postos/${encodeURIComponent(prefixo)}`);
        },
        { once: true },
      );
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

/** Legenda fixa no canto inferior esquerdo. Comunica cor E forma (raio/anel). */
function Legenda() {
  const map = useMap();
  const itens = useMemo(() => LEGENDA, []);

  useEffect(() => {
    const control = new L.Control({ position: 'bottomleft' });
    control.onAdd = () => {
      const div = L.DomUtil.create('div');
      div.setAttribute('role', 'group');
      div.setAttribute('aria-label', 'Legenda dos tipos de estação');
      div.style.cssText =
        'background:#fff;padding:8px 10px;border-radius:8px;border:1px solid #E5E7EB;box-shadow:0 1px 3px rgba(0,0,0,.12);font-size:12px;line-height:1.5';
      const linhas = itens
        .map((i) => {
          const tamanho = Math.round(i.raio * 2);
          const ponto = `display:inline-block;width:${tamanho}px;height:${tamanho}px;border-radius:9999px;background:${i.cor};border:${i.espessuraBorda}px solid ${i.corBorda};margin-right:6px;vertical-align:middle`;
          return `<div style="display:flex;align-items:center;margin:2px 0"><span style="${ponto}"></span><span style="color:#111827">${i.rotulo}</span></div>`;
        })
        .join('');
      // innerHTML aqui é seguro: o conteúdo é 100% literal de código (rótulos
      // estáticos da paleta em paleta-monitor.ts), sem nenhum dado de usuário
      // ou do banco. Conteúdo não confiável (nome/bacia da estação) só aparece
      // no popup, onde passa por esc() antes da interpolação.
      div.innerHTML = `<div style="font-weight:600;margin-bottom:4px;color:#111827">Tipos de estação</div>${linhas}`;
      // Não capturar arrasto/scroll do mapa ao interagir com a legenda.
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map, itens]);

  return null;
}
