'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Map as MapIcon, List, SlidersHorizontal, CloudRain } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { FiltrosMonitor, FILTROS_INICIAIS, type ValorFiltros } from './FiltrosMonitor';
import { SeletorTipoHidrologico } from './SeletorTipoHidrologico';
import { ListaEstacoes } from './ListaEstacoes';
import { entidadeDaEstacao, LEGENDA_ENTIDADES } from './paleta-monitor';
import { useComparacao } from './useComparacao';
import { CestaComparacao } from './CestaComparacao';
import { calcularFrescor, descreverIdade } from '@/domain/monitor/frescor-dado';
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

// Visão de comparação carregada sob demanda: também traz o recharts (pesado) e
// só monta quando o usuário abre a comparação.
const PainelComparacao = dynamic(
  () => import('./PainelComparacao').then((m) => m.PainelComparacao),
  { ssr: false },
);

type EstadoCarga =
  | { status: 'carregando' }
  | { status: 'erro'; mensagem: string }
  | { status: 'ok'; estacoes: Estacao[] };

// Teto de linhas renderizadas na lista textual. Com 3690 estações, montar
// todas as <tr> de uma vez pesa no DOM; acima do teto pedimos refinar o filtro.
const TETO_LISTA = 500;

export interface PainelMonitorProps {
  /**
   * Mostra a ação de sincronizar com o SIBH. Resolvido no servidor pelo papel
   * do usuário. É só conveniência de tela: `POST /api/monitor/sync` exige
   * aprovador e responde 403 para quem não é, independentemente disto.
   */
  podeSincronizar?: boolean;
}

export function PainelMonitor({ podeSincronizar = false }: PainelMonitorProps) {
  const [carga, setCarga] = useState<EstadoCarga>({ status: 'carregando' });
  const [confirmandoSync, setConfirmandoSync] = useState(false);
  const [resultadoSync, setResultadoSync] = useState<string | null>(null);
  // Incrementa para forçar nova busca das estações depois de sincronizar.
  const [recarga, setRecarga] = useState(0);
  const [filtros, setFiltros] = useState<ValorFiltros>(FILTROS_INICIAIS);
  const [visao, setVisao] = useState<'mapa' | 'lista'>('mapa');
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);
  // Estação aberta no painel de detalhe. null = painel fechado.
  const [estacaoDetalhe, setEstacaoDetalhe] = useState<Estacao | null>(null);
  // Cesta de comparação multi-estação + visão de comparação aberta.
  const comparacao = useComparacao();
  const [comparacaoAberta, setComparacaoAberta] = useState(false);

  // Se a cesta cair abaixo de 2 estações (remoção/limpeza) com a visão aberta,
  // fecha a visão: a comparação exige ao menos duas estações.
  const totalComparacao = comparacao.total;
  useEffect(() => {
    if (comparacaoAberta && totalComparacao < 2) setComparacaoAberta(false);
  }, [comparacaoAberta, totalComparacao]);

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
  }, [recarga]);

  /**
   * Dispara a sincronização com o SIBH e recarrega o mapa.
   *
   * A sincronização é sob demanda nesta fase: sem alguém acionar, o mapa
   * continua exibindo a última carga por tempo indeterminado (em 18/08/2026 a
   * defasagem chegou a 34 dias). A ação existia apenas como endpoint, sem
   * nenhum lugar na interface, então quem opera o sistema não tinha como
   * atualizar o dado.
   *
   * Erros sobem para o ConfirmDialog, que os exibe e mantém o modal aberto.
   */
  const sincronizar = useCallback(async () => {
    const resp = await fetch('/api/monitor/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ dias: 7 }),
    });

    if (!resp.ok) {
      if (resp.status === 403) {
        throw new Error('A sua conta não tem papel de aprovador para sincronizar.');
      }
      if (resp.status === 429) {
        throw new Error('Sincronização pedida há pouco tempo. Aguarde para repetir.');
      }
      throw new Error(`Falha ao sincronizar com o SIBH (HTTP ${resp.status}).`);
    }

    setConfirmandoSync(false);
    setResultadoSync('Sincronização concluída. O mapa foi recarregado.');
    setRecarga((n) => n + 1);
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

  // Atalho da legenda do mapa: liga/desliga uma entidade no MESMO estado do
  // multiselect de filtros (filtros.entidades). Mantém a regra "vazio = todas":
  // marcar a última faltante volta pra lista vazia, igual ao SelecaoEntidades.
  const alternarEntidade = useCallback(
    (entidade: string) => {
      setFiltros((prev) => {
        const atuais = prev.entidades;
        if (atuais.includes(entidade)) {
          return { ...prev, entidades: atuais.filter((e) => e !== entidade) };
        }
        const proximas = [...atuais, entidade];
        return {
          ...prev,
          entidades:
            proximas.length === entidadesDisponiveis.length ? [] : proximas,
        };
      });
    },
    [entidadesDisponiveis.length],
  );

  /**
   * Estações que passam por todos os filtros EXCETO o de transmissão.
   *
   * Fica separado de propósito: é a partir dele que sabemos quantas estações o
   * filtro "somente transmitindo" está escondendo. Sem esse número, o filtro
   * faria a rede parecer menor do que é, que é justamente o que não pode
   * acontecer numa tela institucional.
   */
  const noEscopo = useMemo(() => {
    const termo = filtros.busca.trim().toLocaleLowerCase('pt-BR');
    const filtraEntidade = filtros.entidades.length > 0;
    return todas.filter((e) => {
      // Tipo hidrológico: sempre um por vez (nunca vazio); mostra só o ativo.
      if (e.tipoEstacao !== filtros.tipoEstacao) return false;
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

  const filtradas = useMemo(
    () => (filtros.somenteOnline ? noEscopo.filter((e) => e.online) : noEscopo),
    [noEscopo, filtros.somenteOnline],
  );

  /**
   * Idade do dado exibido. A sincronização com o SIBH é sob demanda nesta fase,
   * e dado velho é visualmente idêntico a dado novo: sem este aviso, a tela
   * afirmaria que N estações estão transmitindo agora quando o retrato pode ter
   * semanas. Calculado sobre TODAS as estações, não sobre as filtradas, porque
   * é propriedade da carga e não do recorte que o usuário escolheu.
   *
   * Fica aqui, antes de qualquer retorno antecipado, porque hook não pode ser
   * chamado condicionalmente.
   */
  const frescor = useMemo(
    () => calcularFrescor(todas.map((e) => e.ultimaTransmissao), new Date()),
    [todas],
  );

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

  // Quantas das estações filtradas estão transmitindo agora. Reflete o filtro
  // atual (tipo, entidade, busca, UGRHI), pois é derivado de `filtradas`.
  const online = filtradas.filter((e) => e.online).length;

  // Quantas o filtro de transmissão está escondendo dentro do escopo atual.
  const ocultasSemTransmissao = filtros.somenteOnline
    ? noEscopo.length - filtradas.length
    : 0;


  return (
    <div
      className={[
        'flex flex-col gap-3',
        // Reserva espaço pra cesta fixa no rodapé não cobrir o conteúdo final.
        comparacao.total > 0 ? 'pb-28 sm:pb-24' : '',
      ].join(' ')}
    >
      {/* Idade do dado. Só aparece quando há defasagem: em operação normal a
          tela não deve gastar espaço dizendo que está tudo em dia. Quando
          aparece, diz a data e a idade, porque "desatualizado" sozinho não
          permite a ninguém julgar se aquilo ainda serve. */}
      {carga.status === 'ok' && frescor.defasado ? (
        <Alerta tipo="aviso" titulo="O dado exibido não é do momento">
          {frescor.maisRecente ? (
            <>
              A leitura mais recente é de{' '}
              <strong className="tabular">
                {frescor.maisRecente.toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>{' '}
              ({descreverIdade(frescor.idadeHoras)}). A sincronização com o SIBH é executada sob
              demanda nesta fase, então o mapa reflete a última carga, e não o instante atual.
            </>
          ) : (
            <>
              Nenhuma estação tem registro de transmissão nesta carga. O mapa mostra o cadastro das
              estações, sem leitura associada.
            </>
          )}
          {podeSincronizar ? (
            <p className="mt-2">
              <button
                type="button"
                onClick={() => {
                  // Limpa o resultado da execução anterior ao abrir de novo:
                  // sem isso, um sucesso antigo continuaria na tela ao lado do
                  // erro de uma tentativa nova.
                  setResultadoSync(null);
                  setConfirmandoSync(true);
                }}
                className="rounded px-2 py-1 text-sm font-semibold text-gov-azul underline underline-offset-2 hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
              >
                Atualizar agora a partir do SIBH
              </button>
            </p>
          ) : null}
        </Alerta>
      ) : null}

      {resultadoSync ? (
        <Alerta tipo="sucesso" titulo="Dados atualizados">
          {resultadoSync}
        </Alerta>
      ) : null}

      {/* A confirmação existe porque a ação escreve no banco e chama um serviço
          externo: nunca dispara direto no clique. */}
      <ConfirmDialog
        aberto={confirmandoSync}
        titulo="Atualizar os dados do Monitor"
        descricao={
          <>
            Busca no SIBH o cadastro das estações e as leituras dos últimos 7 dias, e grava o
            resultado. Pode levar alguns minutos e não interrompe quem estiver usando o sistema.
          </>
        }
        rotuloConfirmar="Atualizar"
        aoConfirmar={sincronizar}
        aoCancelar={() => setConfirmandoSync(false)}
      />

      {/* Barra de controle: contagem + alternância de visão + filtros (mobile) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-app-fg-muted"
          role="status"
          aria-live="polite"
        >
          <span className="tabular">{contagem}</span>
          {carga.status === 'ok' ? (
            <>
              <span aria-hidden="true" className="text-app-fg-subtle">
                ·
              </span>
              {/* Indicador de status: ponto verde + rótulo textual. O texto
                  "online" carrega o significado, então não dependemos só da cor
                  (WCAG 1.4.1 / e-MAG). O ponto tem anel claro pra destacar sem
                  contar apenas com o preenchimento. */}
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-gov-sucesso ring-2 ring-green-200"
                />
                <span className="font-semibold tabular text-app-fg">
                  {online.toLocaleString('pt-BR')}
                </span>
                {/* "online" só se sustenta com dado do momento. Com a carga
                    defasada, o mesmo número é um retrato antigo, e o rótulo
                    precisa dizer isso em vez de afirmar o presente. */}
                <span>{frescor.defasado ? 'na última carga' : 'online'}</span>
              </span>
              {/* O filtro de transmissão nunca esconde em silêncio: diz quantas
                  ficaram de fora e oferece ver a rede inteira num clique. Sem
                  isto, o mapa faria a rede parecer menor do que é. */}
              {ocultasSemTransmissao > 0 ? (
                <>
                  <span aria-hidden="true" className="text-app-fg-subtle">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="tabular">
                      {ocultasSemTransmissao.toLocaleString('pt-BR')} sem transmissão
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFiltros((prev) => ({ ...prev, somenteOnline: false }))
                      }
                      className="rounded px-1.5 py-0.5 font-semibold text-gov-azul underline underline-offset-2 hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
                    >
                      mostrar todas
                    </button>
                  </span>
                </>
              ) : null}
              {!filtros.somenteOnline ? (
                <>
                  <span aria-hidden="true" className="text-app-fg-subtle">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiltros((prev) => ({ ...prev, somenteOnline: true }))
                    }
                    className="rounded px-1.5 py-0.5 font-semibold text-gov-azul underline underline-offset-2 hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
                  >
                    ver só as que transmitem
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>

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
          <FiltrosMonitor valor={filtros} aoMudar={setFiltros} bacias={bacias} />
        ) : (
          <SkeletonGrupo rotulo="Carregando filtros">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="h-14 animate-pulse rounded bg-app-border-subtle" />
              <div className="h-14 animate-pulse rounded bg-app-border-subtle" />
              <div className="h-14 animate-pulse rounded bg-app-border-subtle" />
            </div>
          </SkeletonGrupo>
        )}
      </div>

      {/* Área principal: mapa ou lista. Altura responsiva preenchendo a tela. */}
      {visao === 'mapa' ? (
        <div className="h-[64vh] min-h-[420px] overflow-hidden rounded-gov-card border border-app-border-subtle bg-app-surface lg:h-[74vh] 2xl:h-[80vh]">
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
            <MapaMonitor
              estacoes={filtradas}
              aoSelecionar={setEstacaoDetalhe}
              entidadesAtivas={filtros.entidades}
              aoAlternarEntidade={alternarEntidade}
              comparacao={{
                estaSelecionada: comparacao.estaSelecionada,
                podeAdicionar: comparacao.podeAdicionar,
                aoAlternar: comparacao.alternar,
              }}
            />
          )}
        </div>
      ) : (
        <ListaTextual
          estacoes={filtradas}
          carregando={carga.status === 'carregando'}
          aoSelecionar={setEstacaoDetalhe}
          comparacao={{
            estaSelecionada: comparacao.estaSelecionada,
            podeAdicionar: comparacao.podeAdicionar,
            aoAlternar: comparacao.alternar,
          }}
        />
      )}

      {/* Seletor de tipo hidrológico, logo abaixo da área do mapa. Aparece nas
          duas visões (mapa e lista) porque controla filtros.tipoEstacao, que
          filtra o dataset inteiro, não só a apresentação de uma delas. */}
      <div className="rounded-gov-card border border-app-border-subtle bg-app-surface px-3 py-3">
        <SeletorTipoHidrologico
          valor={filtros.tipoEstacao}
          aoMudar={(tipoEstacao) =>
            setFiltros((prev) => ({ ...prev, tipoEstacao }))
          }
        />
      </div>

      {/* Painel de detalhe (drawer). Só monta o chunk do recharts quando há
          estação selecionada; ao fechar, volta a null. */}
      {estacaoDetalhe ? (
        <PainelDetalheEstacao
          estacao={estacaoDetalhe}
          aoFechar={() => setEstacaoDetalhe(null)}
          comparacao={{
            selecionada: comparacao.estaSelecionada(estacaoDetalhe.id),
            podeAdicionar: comparacao.podeAdicionar,
            aoAlternar: comparacao.alternar,
          }}
        />
      ) : null}

      {/* Cesta de comparação: barra fixa no rodapé quando há seleção. */}
      <CestaComparacao
        estacoes={comparacao.estacoes}
        maximo={comparacao.maximo}
        aoRemover={comparacao.remover}
        aoLimpar={comparacao.limpar}
        aoComparar={() => setComparacaoAberta(true)}
      />

      {/* Visão de comparação (drawer). Só monta o chunk quando aberta E há ao
          menos 2 estações na cesta (o botão Comparar exige isso). */}
      {comparacaoAberta && comparacao.total >= 2 ? (
        <PainelComparacao
          estacoes={comparacao.estacoes}
          aoFechar={() => setComparacaoAberta(false)}
        />
      ) : null}
    </div>
  );
}

function ListaTextual({
  estacoes,
  carregando,
  aoSelecionar,
  comparacao,
}: {
  estacoes: readonly Estacao[];
  carregando: boolean;
  aoSelecionar: (estacao: Estacao) => void;
  comparacao: import('./ListaEstacoes').ComparacaoLista;
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
      <ListaEstacoes
        estacoes={visiveis}
        aoSelecionar={aoSelecionar}
        comparacao={comparacao}
      />
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
