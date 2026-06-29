'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Map as MapIcon, List, SlidersHorizontal, CloudRain } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { FiltrosMonitor, FILTROS_INICIAIS, type ValorFiltros } from './FiltrosMonitor';
import { ListaEstacoes } from './ListaEstacoes';
import { entidadeDaEstacao, LEGENDA_ENTIDADES } from './paleta-monitor';
import type { Estacao, RespostaEstacoes } from './tipos';

// Mapa carregado só no cliente: Leaflet depende de window. O fallback mostra
// um placeholder enquanto o bundle e o CSS do Leaflet chegam.
const MapaMonitor = dynamic(
  () => import('./MapaMonitor').then((m) => m.MapaMonitor),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-label="Carregando o mapa"
        className="flex h-full w-full items-center justify-center bg-app-surface-2"
      >
        <span className="text-sm text-app-fg-muted">Carregando o mapa…</span>
      </div>
    ),
  },
);

// Painel de detalhe carregado sob demanda: traz o recharts (pesado) e só é
// preciso quando o usuário abre uma estação. Sem fallback visível: o próprio
// painel só monta quando há estação selecionada.
const PainelDetalheEstacao = dynamic(
  () => import('./PainelDetalheEstacao').then((m) => m.PainelDetalheEstacao),
  { ssr: false },
);

type EstadoCarga =
  | { status: 'carregando' }
  | { status: 'erro'; mensagem: string }
  | { status: 'ok'; estacoes: Estacao[] };

// Teto de linhas renderizadas na lista textual. Com 3690 estações, montar
// todas as <tr> de uma vez pesa no DOM; acima do teto pedimos refinar o filtro.
const TETO_LISTA = 500;

export function PainelMonitor() {
  const [carga, setCarga] = useState<EstadoCarga>({ status: 'carregando' });
  const [filtros, setFiltros] = useState<ValorFiltros>(FILTROS_INICIAIS);
  const [visao, setVisao] = useState<'mapa' | 'lista'>('mapa');
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
  // Estação aberta no painel de detalhe. null = painel fechado.
  const [estacaoDetalhe, setEstacaoDetalhe] = useState<Estacao | null>(null);

  useEffect(() => {
    let ativo = true;
    const controlador = new AbortController();

    async function carregar() {
      setCarga({ status: 'carregando' });
      try {
        // Carga única client-side: filtragem por bacia/tipo é feita em memória
        // (3690 itens), instantânea e sem novo round-trip à API.
        const resp = await fetch('/api/monitor/estacoes', {
          signal: controlador.signal,
          headers: { Accept: 'application/json' },
        });
        if (!resp.ok) {
          throw new Error(`Falha ao carregar estações (HTTP ${resp.status}).`);
        }
        const dados = (await resp.json()) as RespostaEstacoes;
        if (!ativo) return;
        setCarga({ status: 'ok', estacoes: dados.itens ?? [] });
      } catch (e) {
        if (!ativo || controlador.signal.aborted) return;
        setCarga({
          status: 'erro',
          mensagem:
            e instanceof Error
              ? e.message
              : 'Não foi possível carregar as estações.',
        });
      }
    }

    carregar();
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, []);

  // Memoizado: referência estável quando a carga não muda, pra não invalidar
  // os useMemo de bacias/filtradas a cada render.
  const todas = useMemo(
    () => (carga.status === 'ok' ? carga.estacoes : []),
    [carga],
  );

  const bacias = useMemo(() => {
    const set = new Set<string>();
    for (const e of todas) if (e.bacia) set.add(e.bacia);
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [todas]);

  // Entidades presentes nos dados, na ordem de relevância da legenda
  // (SP Águas, CEMADEN, ...; "Outros" por último). Só inclui as que existem.
  const entidadesDisponiveis = useMemo(() => {
    const presentes = new Set<string>();
    for (const e of todas) presentes.add(entidadeDaEstacao(e));
    return LEGENDA_ENTIDADES.map((x) => x.nome).filter((nome) =>
      presentes.has(nome),
    );
  }, [todas]);

  const filtradas = useMemo(() => {
    const termo = filtros.busca.trim().toLocaleLowerCase('pt-BR');
    const filtraEntidade = filtros.entidades.length > 0;
    return todas.filter((e) => {
      if (filtros.bacia && e.bacia !== filtros.bacia) return false;
      if (filtros.tipo && e.tipo !== filtros.tipo) return false;
      if (filtraEntidade && !filtros.entidades.includes(entidadeDaEstacao(e)))
        return false;
      if (termo) {
        const nome = (e.nome ?? '').toLocaleLowerCase('pt-BR');
        const prefixo = (e.prefixo ?? '').toLocaleLowerCase('pt-BR');
        if (!nome.includes(termo) && !prefixo.includes(termo)) return false;
      }
      return true;
    });
  }, [todas, filtros]);

  if (carga.status === 'erro') {
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar o mapa">
        {carga.mensagem} Verifique a conexão e tente novamente em instantes.
      </Alerta>
    );
  }

  const contagem =
    carga.status === 'ok'
      ? `${filtradas.length.toLocaleString('pt-BR')} de ${todas.length.toLocaleString(
          'pt-BR',
        )} estações`
      : 'Carregando…';

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de controle: contagem + alternância de visão + filtros (mobile) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="text-sm text-app-fg-muted tabular"
          role="status"
          aria-live="polite"
        >
          {contagem}
        </p>

        <div className="flex items-center gap-2">
          {/* Toggle de filtros só no mobile (no desktop ficam sempre visíveis) */}
          <button
            type="button"
            onClick={() => setFiltrosAbertosMobile((v) => !v)}
            aria-expanded={filtrosAbertosMobile}
            aria-controls="painel-filtros-monitor"
            className="inline-flex items-center gap-1.5 rounded border border-app-border-input px-2.5 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul sm:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filtros
          </button>

          {/* Alternância mapa / lista — radiogroup pra leitor de tela */}
          <div
            role="group"
            aria-label="Forma de visualização"
            className="inline-flex overflow-hidden rounded border border-app-border-input"
          >
            <BotaoVisao
              ativo={visao === 'mapa'}
              onClick={() => setVisao('mapa')}
              icone={MapIcon}
              rotulo="Mapa"
            />
            <BotaoVisao
              ativo={visao === 'lista'}
              onClick={() => setVisao('lista')}
              icone={List}
              rotulo="Lista"
            />
          </div>
        </div>
      </div>

      {/* Filtros: sempre visíveis no desktop; colapsáveis no mobile */}
      <div
        id="painel-filtros-monitor"
        className={[
          'rounded-gov-card border border-app-border-subtle bg-app-surface p-3',
          filtrosAbertosMobile ? 'block' : 'hidden',
          'sm:block',
        ].join(' ')}
      >
        {carga.status === 'ok' ? (
          <FiltrosMonitor
            valor={filtros}
            aoMudar={setFiltros}
            bacias={bacias}
            entidadesDisponiveis={entidadesDisponiveis}
          />
        ) : (
          <SkeletonGrupo rotulo="Carregando filtros">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="h-14 animate-pulse rounded bg-app-border-subtle" />
              <div className="h-14 animate-pulse rounded bg-app-border-subtle" />
              <div className="h-14 animate-pulse rounded bg-app-border-subtle" />
              <div className="h-14 animate-pulse rounded bg-app-border-subtle" />
            </div>
          </SkeletonGrupo>
        )}
      </div>

      {/* Área principal: mapa ou lista. Altura responsiva preenchendo a tela. */}
      {visao === 'mapa' ? (
        <div className="h-[60vh] min-h-[360px] overflow-hidden rounded-gov-card border border-app-border-subtle bg-app-surface lg:h-[70vh]">
          {carga.status === 'carregando' ? (
            <div
              role="status"
              aria-label="Carregando estações"
              className="flex h-full w-full items-center justify-center bg-app-surface-2"
            >
              <span className="text-sm text-app-fg-muted">Carregando estações…</span>
            </div>
          ) : filtradas.length === 0 ? (
            <EstadoVazio
              icone={CloudRain}
              titulo="Nenhuma estação no filtro"
              descricao="Ajuste a busca, a entidade, a UGRHI ou o tipo para ver estações no mapa."
            />
          ) : (
            <MapaMonitor estacoes={filtradas} aoSelecionar={setEstacaoDetalhe} />
          )}
        </div>
      ) : (
        <ListaTextual
          estacoes={filtradas}
          carregando={carga.status === 'carregando'}
          aoSelecionar={setEstacaoDetalhe}
        />
      )}

      {/* Painel de detalhe (drawer). Só monta o chunk do recharts quando há
          estação selecionada; ao fechar, volta a null. */}
      {estacaoDetalhe ? (
        <PainelDetalheEstacao
          estacao={estacaoDetalhe}
          aoFechar={() => setEstacaoDetalhe(null)}
        />
      ) : null}
    </div>
  );
}

function ListaTextual({
  estacoes,
  carregando,
  aoSelecionar,
}: {
  estacoes: readonly Estacao[];
  carregando: boolean;
  aoSelecionar: (estacao: Estacao) => void;
}) {
  if (carregando) {
    return (
      <SkeletonGrupo rotulo="Carregando lista de estações">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-app-border-subtle" />
          ))}
        </div>
      </SkeletonGrupo>
    );
  }
  if (estacoes.length === 0) {
    return (
      <EstadoVazio
        icone={CloudRain}
        titulo="Nenhuma estação no filtro"
        descricao="Ajuste a busca, a entidade, a UGRHI ou o tipo para ver estações na lista."
      />
    );
  }
  const limitada = estacoes.length > TETO_LISTA;
  const visiveis = limitada ? estacoes.slice(0, TETO_LISTA) : estacoes;
  return (
    <div className="space-y-2">
      {limitada ? (
        <Alerta tipo="info" titulo="Lista parcial">
          Mostrando as primeiras {TETO_LISTA.toLocaleString('pt-BR')} de{' '}
          {estacoes.length.toLocaleString('pt-BR')} estações. Refine a busca, a
          entidade, a UGRHI ou o tipo para ver o conjunto completo.
        </Alerta>
      ) : null}
      <ListaEstacoes estacoes={visiveis} aoSelecionar={aoSelecionar} />
    </div>
  );
}

function BotaoVisao({
  ativo,
  onClick,
  icone: Icone,
  rotulo,
}: {
  ativo: boolean;
  onClick: () => void;
  icone: typeof MapIcon;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul',
        ativo
          ? 'bg-gov-azul-claro font-medium text-gov-azul'
          : 'bg-app-surface text-app-fg-muted hover:bg-app-surface-2',
      ].join(' ')}
    >
      <Icone className="h-4 w-4" aria-hidden="true" />
      {rotulo}
    </button>
  );
}
