'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Link2, Search, X } from 'lucide-react';
import {
  TIPOS_POSTO_MAPA,
  UF_DO_ESTADO,
  atendeFiltros,
  contarFacetas,
  type PontoMapaPosto,
} from '@/domain/mapa-postos';
import { Skeleton, SkeletonGrupo } from '@/components/ui/Skeleton';
import { CestaComparacao } from '@/components/features/monitor/CestaComparacao';
import { useComparacao } from '@/components/features/monitor/useComparacao';
import type { Estacao } from '@/components/features/monitor/tipos';
import {
  ESTADO_PADRAO,
  casaBusca,
  filtrosDoEstado,
  lerEstado,
  normalizarBusca,
  parametrosDaApi,
  serializarEstado,
  temEscopo,
  type EstadoTela,
} from './estado-url';
import { useMapaPostos } from './useMapaPostos';
import { FiltrosCelular, FiltrosDesktop, ChipsTipo, type MudancaFiltros } from './FiltrosPostos';
import { LegendaMapa, type EstadoOutrasRedes } from './LegendaMapa';
import { ListaPostos, classeAcaoPrimaria, classeAcaoSecundaria } from './ListaPostos';
import { DetalhePosto, type ComparacaoChuva } from './DetalhePosto';
import type { ControleMapa, EstacaoOutraRede, LimitesMapa } from './MapaPostos';

/**
 * Tela única de Postos: mapa, lista e detalhe na mesma página.
 *
 * A lista inteira vem numa chamada e tudo o que é classificação filtra aqui,
 * no navegador. A URL guarda o estado (filtros, UGRHI e posto aberto) para o
 * link colado no chat abrir exatamente a mesma tela.
 */

const MapaPostos = dynamic(() => import('./MapaPostos').then((m) => m.MapaPostos), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-app-surface-2" aria-hidden="true" />,
});

const PainelComparacao = dynamic(
  () => import('@/components/features/monitor/PainelComparacao').then((m) => m.PainelComparacao),
  { ssr: false },
);

type CargaEstacoes =
  | { readonly situacao: 'ociosa' }
  | { readonly situacao: 'carregando' }
  | { readonly situacao: 'erro' }
  | { readonly situacao: 'pronta'; readonly estacoes: readonly Estacao[] };

const fmt = (n: number) => n.toLocaleString('pt-BR');

function dentro(p: PontoMapaPosto, l: LimitesMapa): boolean {
  return (
    p.lat !== null &&
    p.lon !== null &&
    p.lat >= l.sul &&
    p.lat <= l.norte &&
    p.lon >= l.oeste &&
    p.lon <= l.leste
  );
}

// Um Collator só: `localeCompare` com opções monta um a cada comparação, e
// ordenar 5.790 postos assim custava centenas de milissegundos por filtro.
const COLACAO = new Intl.Collator('pt-BR', { numeric: true });

function ordemDaLista(a: PontoMapaPosto, b: PontoMapaPosto): number {
  if (a.situacao !== b.situacao) return a.situacao === 'em_operacao' ? -1 : 1;
  return COLACAO.compare(a.prefixo, b.prefixo);
}

export function TelaPostos() {
  const parametros = useSearchParams();
  const [estado, setEstado] = useState<EstadoTela>(() => lerEstado(parametros));
  const { carga, recarregar } = useMapaPostos(parametrosDaApi(estado.escopo));
  const [limites, setLimites] = useState<LimitesMapa | null>(null);
  const [realce, setRealce] = useState<string | null>(null);
  const controle = useRef<ControleMapa | null>(null);
  const origemFoco = useRef<HTMLElement | null>(null);
  const painel = useRef<HTMLDivElement>(null);
  const regiaoMapa = useRef<HTMLDivElement>(null);
  const [avisoCopia, setAvisoCopia] = useState('');
  const [cargaEstacoes, setCargaEstacoes] = useState<CargaEstacoes>({ situacao: 'ociosa' });
  const [outrasRedesLigada, setOutrasRedesLigada] = useState(false);
  const comparacao = useComparacao();
  const [comparacaoAberta, setComparacaoAberta] = useState(false);

  // URL acompanha o estado sem nova navegação: o Next 15 integra
  // `history.replaceState` ao roteador. O primeiro argumento TEM de ser
  // `null`: com `window.history.state` (que carrega `__NA`) o Next trata a
  // chamada como interna, não atualiza a URL do roteador, e o primeiro refresh
  // do roteador devolve a página para `/` sem filtro nem posto (medido).
  useEffect(() => {
    const qs = serializarEstado(estado);
    const alvo = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (alvo !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', alvo);
    }
  }, [estado]);

  const mudar = useCallback((m: MudancaFiltros) => setEstado((e) => ({ ...e, ...m })), []);
  const limparFiltros = useCallback(
    () =>
      setEstado((e) => ({
        ...e,
        tipos: ESTADO_PADRAO.tipos,
        situacoes: ESTADO_PADRAO.situacoes,
        transmissoes: [],
        vazao: null,
        ugrhi: null,
        uf: ESTADO_PADRAO.uf,
      })),
    [],
  );

  // Filtragem sobre o valor adiado: digitar na busca não espera o redesenho.
  const adiado = useDeferredValue(estado);
  const dadosPontos = carga.situacao === 'pronto' ? carga.dados.pontos : null;
  // Ordena uma vez por carga; filtrar preserva a ordem.
  const pontos = useMemo(() => (dadosPontos ? [...dadosPontos].sort(ordemDaLista) : null), [dadosPontos]);

  const derivado = useMemo(() => {
    if (!pontos) return null;
    const termo = normalizarBusca(adiado.q);
    const filtros = filtrosDoEstado(adiado);
    const porBusca = termo ? pontos.filter((p) => casaBusca(p, termo)) : pontos;
    const visiveis = porBusca.filter((p) => atendeFiltros(p, filtros));
    const facetas = contarFacetas(porBusca, filtros);
    const comCoordenada: PontoMapaPosto[] = [];
    const semCoordenada: PontoMapaPosto[] = [];
    for (const p of visiveis) (p.lat !== null && p.lon !== null ? comCoordenada : semCoordenada).push(p);
    return { visiveis, comCoordenada, semCoordenada, facetas };
  }, [pontos, adiado]);

  const naArea = useMemo(() => {
    if (!derivado) return [];
    return limites ? derivado.comCoordenada.filter((p) => dentro(p, limites)) : derivado.comCoordenada;
  }, [derivado, limites]);

  const porPrefixo = useMemo(() => {
    const m = new Map<string, PontoMapaPosto>();
    for (const p of pontos ?? []) m.set(p.prefixo, p);
    return m;
  }, [pontos]);

  const aberto = estado.posto ? porPrefixo.get(estado.posto) ?? null : null;

  // Estações do SIBH: uma carga só, compartilhada entre a camada "outras redes"
  // e o botão de comparar chuva.
  const estacoesPedidas = useRef(false);
  const carregarEstacoes = useCallback(() => {
    if (estacoesPedidas.current) return;
    estacoesPedidas.current = true;
    setCargaEstacoes({ situacao: 'carregando' });
    fetch('/api/monitor/estacoes', { headers: { Accept: 'application/json' } })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const corpo = (await r.json()) as { itens?: Estacao[] };
        if (!Array.isArray(corpo.itens)) throw new Error('corpo');
        setCargaEstacoes({ situacao: 'pronta', estacoes: corpo.itens });
      })
      .catch(() => {
        // Falha libera nova tentativa ao religar a camada ou abrir outro posto.
        estacoesPedidas.current = false;
        setCargaEstacoes({ situacao: 'erro' });
      });
  }, []);

  const outrasRedes = useMemo<EstacaoOutraRede[] | null>(() => {
    if (!outrasRedesLigada || cargaEstacoes.situacao !== 'pronta') return null;
    return cargaEstacoes.estacoes
      .filter((e) => !e.vinculadoAPosto && Number.isFinite(e.lat) && Number.isFinite(e.lng))
      .map((e) => ({
        prefixo: e.prefixo ?? e.nome,
        nome: e.nome,
        lat: e.lat,
        lon: e.lng,
        tipoHidrologico: e.tipoEstacao,
      }));
  }, [outrasRedesLigada, cargaEstacoes]);

  const estadoOutrasRedes: EstadoOutrasRedes = !outrasRedesLigada
    ? 'desligada'
    : cargaEstacoes.situacao === 'pronta'
      ? 'ligada'
      : cargaEstacoes.situacao === 'erro'
        ? 'erro'
        : 'carregando';

  const alternarOutrasRedes = useCallback(() => {
    if (!outrasRedesLigada) carregarEstacoes();
    setOutrasRedesLigada(!outrasRedesLigada);
  }, [outrasRedesLigada, carregarEstacoes]);

  // Comparar chuva só existe para posto com estação pluviométrica do SIBH de
  // mesmo prefixo: a comparação do Monitor lê a chuva do SIBH.
  const precisaEstacoes = aberto?.tipo === 'plu';
  useEffect(() => {
    if (precisaEstacoes) carregarEstacoes();
  }, [precisaEstacoes, carregarEstacoes]);

  const chuvaPorPrefixo = useMemo(() => {
    const m = new Map<string, Estacao>();
    if (cargaEstacoes.situacao !== 'pronta') return m;
    for (const e of cargaEstacoes.estacoes) {
      if (e.prefixo && e.tipoEstacao === 'pluviometrico') m.set(e.prefixo, e);
    }
    return m;
  }, [cargaEstacoes]);

  let comparacaoChuva: ComparacaoChuva = { situacao: 'indisponivel' };
  if (aberto?.tipo === 'plu') {
    if (cargaEstacoes.situacao === 'carregando' || cargaEstacoes.situacao === 'ociosa') {
      comparacaoChuva = { situacao: 'carregando' };
    } else {
      const estacao = chuvaPorPrefixo.get(aberto.prefixo);
      if (estacao) {
        comparacaoChuva = {
          situacao: 'pronta',
          estacao,
          naCesta: comparacao.estaSelecionada(estacao.id),
          podeAdicionar: comparacao.podeAdicionar,
          alternar: () => comparacao.alternar(estacao),
        };
      }
    }
  }

  const abrir = useCallback(
    (prefixo: string, origem: HTMLElement | null, centralizar: boolean) => {
      origemFoco.current = origem;
      setEstado((e) => ({ ...e, posto: prefixo }));
      const p = porPrefixo.get(prefixo);
      if (centralizar && p && p.lat !== null && p.lon !== null) {
        controle.current?.centralizarPosto({ lat: p.lat, lon: p.lon });
      }
    },
    [porPrefixo],
  );

  const fechar = useCallback(() => {
    const prefixo = estado.posto;
    setEstado((e) => ({ ...e, posto: null }));
    const origem = origemFoco.current;
    origemFoco.current = null;
    requestAnimationFrame(() => {
      if (origem?.isConnected) {
        origem.focus();
        return;
      }
      const item = prefixo
        ? painel.current?.querySelector<HTMLElement>(`[data-prefixo="${CSS.escape(prefixo)}"]`)
        : null;
      (item ?? regiaoMapa.current?.querySelector<HTMLElement>('.leaflet-container'))?.focus();
    });
  }, [estado.posto]);

  useEffect(() => {
    if (!estado.posto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      fechar();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [estado.posto, fechar]);

  const [mapaPronto, setMapaPronto] = useState(false);

  // Enquadramento. Em SP (o padrão) é sempre o contorno do estado, e nunca a
  // extensão dos pontos: os postos de SP na margem dos rios de divisa e os
  // poucos com coordenada errada no cadastro não podem afastar o mapa. Com
  // outra UF, ou todas, o mapa vai até os pontos que passam no filtro.
  const comCoordenada = derivado?.comCoordenada;
  const enquadrar = useCallback(() => {
    const c = controle.current;
    if (!c) return;
    if (typeof estado.ugrhi === 'number') c.enquadrarUgrhi(estado.ugrhi);
    else if (estado.uf === UF_DO_ESTADO) c.enquadrarEstado();
    else c.enquadrarPontos(comCoordenada ?? []);
  }, [estado.ugrhi, estado.uf, comCoordenada]);

  // Mudança de UGRHI feita pela pessoa enquadra o mapa. A do link se enquadra
  // sozinha quando o contorno termina de carregar.
  const ugrhiAnterior = useRef(estado.ugrhi);
  useEffect(() => {
    if (ugrhiAnterior.current === estado.ugrhi) return;
    ugrhiAnterior.current = estado.ugrhi;
    enquadrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.ugrhi]);

  // UF: espera a lista filtrada da UF nova (o filtro roda sobre o valor
  // adiado) e o mapa montado. Vale também para o link que abre em outra UF.
  const ufEnquadrada = useRef<string | null>(UF_DO_ESTADO);
  useEffect(() => {
    if (!mapaPronto || !comCoordenada || adiado.uf !== estado.uf) return;
    const chave = estado.uf ?? '';
    if (ufEnquadrada.current === chave) return;
    ufEnquadrada.current = chave;
    if (typeof estado.ugrhi !== 'number') enquadrar();
  }, [mapaPronto, comCoordenada, adiado.uf, estado.uf, estado.ugrhi, enquadrar]);

  // Posto vindo do link: centraliza uma vez, quando mapa e dados estiverem prontos.
  const centralizouLink = useRef(false);
  useEffect(() => {
    if (centralizouLink.current || !mapaPronto || !aberto) return;
    centralizouLink.current = true;
    if (aberto.lat !== null && aberto.lon !== null) {
      controle.current?.centralizarPosto({ lat: aberto.lat, lon: aberto.lon });
    }
  }, [mapaPronto, aberto]);

  const copiarLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setAvisoCopia('Link copiado');
    } catch {
      setAvisoCopia('Não foi possível copiar. Copie o endereço da barra do navegador.');
    }
    window.setTimeout(() => setAvisoCopia(''), 4000);
  }, []);

  const avisoVazao = estado.vazao !== null && !estado.tipos.includes('flu');
  const incluirFluviometricos = useCallback(
    () =>
      setEstado((e) => ({
        ...e,
        tipos: TIPOS_POSTO_MAPA.filter((t) => t === 'flu' || e.tipos.includes(t)),
      })),
    [],
  );

  const totalFiltrado = derivado?.visiveis.length ?? 0;
  const facetas = derivado?.facetas ?? null;

  return (
    <div className={`space-y-3 ${comparacao.total > 0 ? 'pb-28 sm:pb-24' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <form role="search" className="relative min-w-0 basis-full sm:max-w-md sm:flex-1 sm:basis-auto" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="busca-postos" className="sr-only">
            Buscar posto por prefixo, nome ou município
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-fg-subtle"
            aria-hidden="true"
          />
          <input
            id="busca-postos"
            type="search"
            value={estado.q}
            maxLength={60}
            autoComplete="off"
            placeholder="Prefixo, nome ou município"
            onChange={(e) => setEstado((s) => ({ ...s, q: e.target.value }))}
            className="h-10 w-full rounded border border-app-border-input bg-app-surface pl-9 pr-9 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gov-azul [&::-webkit-search-cancel-button]:hidden"
          />
          {estado.q && (
            <button
              type="button"
              onClick={() => setEstado((s) => ({ ...s, q: '' }))}
              aria-label="Limpar busca"
              className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-app-fg-muted hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </form>

        <FiltrosCelular
          estado={estado}
          facetas={facetas}
          totalFiltrado={totalFiltrado}
          aoMudar={mudar}
          aoLimpar={limparFiltros}
        />

        <p className="text-sm tabular-nums text-app-fg-muted" aria-live="polite">
          {carga.situacao === 'pronto' ? (
            <>
              <span className="font-semibold text-app-fg">{fmt(totalFiltrado)}</span> de{' '}
              {fmt(carga.dados.total)} postos
            </>
          ) : carga.situacao === 'carregando' ? (
            'Carregando postos'
          ) : null}
        </p>

        <div className="ml-auto flex items-center gap-2">
          <span role="status" className="text-xs text-app-fg-muted">
            {avisoCopia}
          </span>
          <button type="button" onClick={copiarLink} className={classeAcaoSecundaria}>
            <Link2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Copiar link</span>
            <span className="sr-only sm:hidden">Copiar link</span>
          </button>
        </div>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden" aria-label="Tipo de posto" role="group">
        <ChipsTipo estado={estado} facetas={facetas} aoMudar={mudar} />
      </div>

      <FiltrosDesktop
        estado={estado}
        facetas={facetas}
        totalFiltrado={totalFiltrado}
        aoMudar={mudar}
        aoLimpar={limparFiltros}
      />

      {temEscopo(estado.escopo) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-gov-azul-claro/50 px-3 py-2 text-sm text-app-fg">
          <span>
            Recorte do link:{' '}
            {[
              estado.escopo.municipio && `município ${estado.escopo.municipio}`,
              estado.escopo.bacia && `bacia ${estado.escopo.bacia}`,
              estado.escopo.mantenedor && `mantenedor ${estado.escopo.mantenedor}`,
              estado.escopo.favoritos && 'só favoritos',
            ]
              .filter(Boolean)
              .join('; ')}
          </span>
          <button
            type="button"
            onClick={() => setEstado((e) => ({ ...e, escopo: ESTADO_PADRAO.escopo }))}
            className="rounded px-1.5 text-sm font-medium text-gov-azul underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
          >
            Ver todos os postos
          </button>
        </div>
      )}

      <div className="isolate grid gap-3 md:h-[max(34rem,calc(100dvh-15rem))] md:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div ref={regiaoMapa} className="relative h-[56dvh] min-h-[20rem] overflow-hidden rounded-gov-card shadow-gov-card md:h-full">
          <MapaPostos
            pontos={derivado?.comCoordenada ?? []}
            outrasRedes={outrasRedes}
            selecionado={estado.posto}
            realce={realce}
            ugrhi={estado.ugrhi}
            rotuloEnquadrar={
              typeof estado.ugrhi === 'number'
                ? 'Enquadrar a UGRHI'
                : estado.uf === UF_DO_ESTADO
                  ? 'Enquadrar o estado'
                  : 'Enquadrar os postos do filtro'
            }
            aoEnquadrar={enquadrar}
            aoSelecionar={(prefixo) => abrir(prefixo, null, false)}
            aoRealcar={setRealce}
            aoMudarLimites={setLimites}
            aoPronto={(c) => {
              controle.current = c;
              setMapaPronto(true);
            }}
          />
          {carga.situacao === 'pronto' && (
            <LegendaMapa
              estado={estado}
              naArea={naArea}
              outrasRedes={estadoOutrasRedes}
              totalOutrasRedes={outrasRedes?.length ?? 0}
              aoAlternarOutrasRedes={alternarOutrasRedes}
            />
          )}
          {carga.situacao === 'carregando' && (
            <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center">
              <p role="status" className="rounded-md bg-white/95 px-3 py-2 text-sm text-app-fg shadow-gov-card">
                Carregando postos
              </p>
            </div>
          )}
          {carga.situacao === 'erro' && (
            <div className="absolute inset-0 z-[900] flex items-center justify-center bg-app-bg/70 p-4">
              <div role="alert" className="max-w-sm space-y-3 rounded-gov-card bg-app-surface p-4 shadow-gov-card-hover">
                <p className="text-base font-semibold text-app-fg">Não foi possível carregar os postos</p>
                <p className="text-sm text-app-fg-muted">{carga.mensagem}</p>
                {carga.status !== 401 ? (
                  <button type="button" onClick={recarregar} className={classeAcaoPrimaria}>
                    Tentar de novo
                  </button>
                ) : (
                  <a href="/login" className={classeAcaoPrimaria}>
                    Entrar
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          ref={painel}
          className="min-h-0 overflow-hidden rounded-gov-card bg-app-surface shadow-gov-card md:h-full"
        >
          {carga.situacao === 'carregando' ? (
            <SkeletonGrupo rotulo="Carregando lista de postos" className="space-y-3 p-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton variante="texto" className="w-3/4" />
                  <Skeleton variante="texto" className="h-3 w-1/3" />
                </div>
              ))}
            </SkeletonGrupo>
          ) : carga.situacao === 'erro' ? (
            <p className="p-4 text-sm text-app-fg-muted">A lista aparece quando os postos carregarem.</p>
          ) : estado.posto && aberto ? (
            <DetalhePosto ponto={aberto} comparacao={comparacaoChuva} aoVoltar={fechar} />
          ) : estado.posto ? (
            <div className="space-y-3 p-4">
              <p role="alert" className="text-sm text-app-fg">
                O posto {estado.posto} não está no cadastro carregado.
              </p>
              <button type="button" onClick={fechar} className={classeAcaoSecundaria}>
                Voltar à lista
              </button>
            </div>
          ) : (
            <ListaPostos
              naArea={naArea}
              semCoordenada={derivado?.semCoordenada ?? []}
              totalFiltrado={totalFiltrado}
              selecionado={estado.posto}
              aoAbrir={(prefixo, el) => abrir(prefixo, el, true)}
              aoRealcar={setRealce}
              aoLimparFiltros={limparFiltros}
              aoEnquadrar={enquadrar}
              avisoVazao={avisoVazao}
              aoIncluirFluviometricos={incluirFluviometricos}
            />
          )}
        </div>
      </div>

      <CestaComparacao
        estacoes={comparacao.estacoes}
        maximo={comparacao.maximo}
        aoRemover={comparacao.remover}
        aoLimpar={comparacao.limpar}
        aoComparar={() => setComparacaoAberta(true)}
      />
      {comparacaoAberta && comparacao.total >= 2 ? (
        <PainelComparacao estacoes={comparacao.estacoes} aoFechar={() => setComparacaoAberta(false)} />
      ) : null}
    </div>
  );
}
