'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X, BarChart3, Table2, CloudRain } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import type { Estacao } from './tipos';
import type { PeriodoDias } from './tipos-leituras';
import { PERIODOS } from './tipos-leituras';
import { useLeiturasMultiplas } from './useLeiturasMultiplas';
import { GraficoComparacao } from './GraficoComparacao';
import { TabelaComparacao } from './TabelaComparacao';
import { corComparacao } from './cores-comparacao';
import { estatisticasDaComparacao, fmtMm } from './estatisticas-leituras';

interface PainelComparacaoProps {
  /** Cesta de estações a comparar (ordem define a cor). Vazia = painel fechado. */
  estacoes: readonly Estacao[];
  /** Fecha a visão de comparação (volta para a cesta/mapa). */
  aoFechar: () => void;
}

type Aba = 'grafico' | 'tabela';

/** Rótulo curto da estação para legendas/cartões. */
function rotuloEstacao(e: Estacao): string {
  return e.prefixo || e.nome || 'Estação';
}

/**
 * Visão de comparação multi-estação (Monitor). Drawer em <dialog> nativo, igual
 * ao PainelDetalheEstacao: showModal() entrega focus-trap, modalidade e Esc; no
 * mobile vira full-screen.
 *
 * Conteúdo: seletor de período (7/30/90d) reusando a API, gráfico de barras
 * multi-série + tabela equivalente (alternativa textual acessível), estatísticas
 * por estação e avisos de estações sem dados / com erro de carga.
 */
export function PainelComparacao({ estacoes, aoFechar }: PainelComparacaoProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [periodo, setPeriodo] = useState<PeriodoDias>(30);
  const [aba, setAba] = useState<Aba>('grafico');
  const baseId = useId();
  const tituloId = `${baseId}-titulo`;

  const aberto = estacoes.length > 0;
  const estado = useLeiturasMultiplas(estacoes, periodo);

  // Abre/fecha o <dialog> imperativamente (modo modal só existe via showModal()).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => {
        dlg
          .querySelector<HTMLButtonElement>('button[data-foco-inicial]')
          ?.focus();
      });
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  // Clique no backdrop fecha (Esc e o botão X são as vias primárias). Listener
  // nativo no <dialog> para não ferir jsx-a11y (mesmo padrão do detalhe).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    function aoClicar(e: MouseEvent) {
      if (e.target === dlg) aoFechar();
    }
    dlg.addEventListener('click', aoClicar);
    return () => dlg.removeEventListener('click', aoClicar);
  }, [aoFechar]);

  if (!aberto) {
    return <dialog ref={dialogRef} className="hidden" aria-hidden="true" />;
  }

  const semDados = !estado.carregando && estado.estacoesComDados.length === 0;
  // Estações exibidas no gráfico/tabela: as que carregaram com algum dado,
  // preservando a ordem (e portanto a cor) da cesta.
  const estacoesExibidas = estacoes.filter((e) =>
    estado.estacoesComDados.includes(e.id),
  );
  const estacoesComErro = estacoes.filter((e) =>
    estado.estacoesComErro.includes(e.id),
  );
  // Estações que carregaram, mas sem leitura no período (nem erro).
  const estacoesSemLeitura = estacoes.filter(
    (e) =>
      !estado.estacoesComDados.includes(e.id) &&
      !estado.estacoesComErro.includes(e.id),
  );

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClose={() => {
        if (aberto) aoFechar();
      }}
      aria-modal="true"
      aria-labelledby={tituloId}
      // Drawer largo (a comparação tem gráfico + tabela). Full-screen no mobile.
      className="m-0 h-dvh max-h-dvh w-full max-w-full bg-transparent p-0 backdrop:bg-black/40 sm:ml-auto sm:mr-0 sm:h-dvh sm:w-[min(820px,100vw)]"
    >
      <div className="flex h-dvh flex-col bg-app-surface text-app-fg shadow-gov-card-hover">
        <header className="flex items-start gap-3 border-b border-app-border-subtle px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2
              id={tituloId}
              className="text-lg font-semibold text-app-fg"
            >
              Comparação de estações
            </h2>
            <p className="mt-0.5 text-sm text-app-fg-muted">
              {estacoes.length.toLocaleString('pt-BR')}{' '}
              {estacoes.length === 1 ? 'estação selecionada' : 'estações selecionadas'}
            </p>
          </div>
          <button
            type="button"
            data-foco-inicial
            onClick={aoFechar}
            aria-label="Fechar comparação"
            className="shrink-0 rounded p-1.5 text-app-fg-muted hover:bg-app-surface-2 hover:text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} />

        {/* Chips das estações da cesta (cor + nome em texto). */}
        <div className="border-b border-app-border-subtle px-4 py-3 sm:px-5">
          <ul className="flex flex-wrap gap-1.5" aria-label="Estações em comparação">
            {estacoes.map((e, indice) => (
              <li
                key={e.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-app-border-subtle bg-app-surface-2 px-2.5 py-1 text-xs text-app-fg"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-app-border-subtle"
                  style={{ backgroundColor: corComparacao(indice) }}
                />
                <span className="max-w-[10rem] truncate" title={e.nome || undefined}>
                  {rotuloEstacao(e)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {estado.carregando ? (
            <ConteudoCarregando quantidade={estacoes.length} />
          ) : (
            <div className="space-y-5">
              {/* Avisos tolerantes: erro por estação e estações sem leitura. */}
              {estacoesComErro.length > 0 ? (
                <Alerta tipo="aviso" titulo="Algumas estações não puderam ser carregadas">
                  Não foi possível obter as leituras de{' '}
                  {estacoesComErro.map(rotuloEstacao).join(', ')}. As demais
                  seguem na comparação. Tente novamente em instantes.
                </Alerta>
              ) : null}

              {estacoesSemLeitura.length > 0 ? (
                <Alerta tipo="info" titulo="Estações sem leitura no período">
                  {estacoesSemLeitura.map(rotuloEstacao).join(', ')} não{' '}
                  {estacoesSemLeitura.length === 1 ? 'tem' : 'têm'} leituras no
                  período selecionado. Experimente um período maior.
                </Alerta>
              ) : null}

              {semDados ? (
                <EstadoVazio
                  icone={CloudRain}
                  titulo="Sem dados para comparar"
                  descricao="Nenhuma das estações selecionadas tem leituras no período. Experimente um período maior ou ajuste a seleção."
                  nivelTitulo={3}
                />
              ) : (
                <>
                  <AbasGraficoTabela aba={aba} aoMudar={setAba} />

                  {aba === 'grafico' ? (
                    <section aria-label="Gráfico de comparação de chuva diária">
                      <GraficoComparacao
                        dias={estado.dias}
                        estacoes={estacoesExibidas}
                      />
                      <p className="mt-2 text-xs text-app-fg-muted">
                        Barras agrupadas por dia, uma estação por cor. Os mesmos
                        valores estão na aba Tabela, para leitura textual e por
                        leitor de tela.
                      </p>
                    </section>
                  ) : (
                    <section aria-label="Tabela de comparação de chuva diária">
                      <TabelaComparacao
                        dias={estado.dias}
                        estacoes={estacoesExibidas}
                      />
                    </section>
                  )}

                  <EstatisticasPorEstacao
                    dias={estado.dias}
                    estacoes={estacoesExibidas}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

function SeletorPeriodo({
  periodo,
  aoMudar,
}: {
  periodo: PeriodoDias;
  aoMudar: (p: PeriodoDias) => void;
}) {
  return (
    <div className="border-b border-app-border-subtle px-4 py-3 sm:px-5">
      <div
        role="group"
        aria-label="Período da série de leituras"
        className="inline-flex overflow-hidden rounded border border-app-border-input"
      >
        {PERIODOS.map((p) => {
          const ativo = p.dias === periodo;
          return (
            <button
              key={p.dias}
              type="button"
              onClick={() => aoMudar(p.dias)}
              aria-pressed={ativo}
              aria-label={`Mostrar os últimos ${p.rotulo}`}
              className={[
                'px-3 py-1.5 text-sm transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul',
                ativo
                  ? 'bg-gov-azul-claro font-medium text-gov-azul'
                  : 'bg-app-surface text-app-fg-muted hover:bg-app-surface-2',
              ].join(' ')}
            >
              {p.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AbasGraficoTabela({
  aba,
  aoMudar,
}: {
  aba: Aba;
  aoMudar: (a: Aba) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Forma de exibição da comparação"
      className="inline-flex overflow-hidden rounded border border-app-border-input"
    >
      <BotaoAba
        ativo={aba === 'grafico'}
        onClick={() => aoMudar('grafico')}
        icone={BarChart3}
        rotulo="Gráfico"
      />
      <BotaoAba
        ativo={aba === 'tabela'}
        onClick={() => aoMudar('tabela')}
        icone={Table2}
        rotulo="Tabela"
      />
    </div>
  );
}

function BotaoAba({
  ativo,
  onClick,
  icone: Icone,
  rotulo,
}: {
  ativo: boolean;
  onClick: () => void;
  icone: typeof BarChart3;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
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

function EstatisticasPorEstacao({
  dias,
  estacoes,
}: {
  dias: readonly import('./useLeiturasMultiplas').DiaComparacao[];
  estacoes: readonly Estacao[];
}) {
  if (estacoes.length === 0) return null;

  return (
    <section aria-label="Estatísticas por estação">
      <h3 className="mb-2 text-sm font-semibold text-app-fg">
        Estatísticas do período por estação
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {estacoes.map((e) => {
          const indiceReal = estacoesIndice(estacoes, e.id);
          const est = estatisticasDaComparacao(dias, e.id);
          return (
            <div
              key={e.id}
              className="rounded-gov-card border border-app-border-subtle bg-app-surface-2 px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-app-border-subtle"
                  style={{ backgroundColor: corComparacao(indiceReal) }}
                />
                <p
                  className="truncate text-sm font-semibold text-app-fg"
                  title={e.nome || undefined}
                >
                  {rotuloEstacao(e)}
                </p>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div>
                  <dt className="text-app-fg-muted">Total</dt>
                  <dd className="tabular font-semibold text-app-fg">
                    {fmtMm(est.totalMm)}
                  </dd>
                </div>
                <div>
                  <dt className="text-app-fg-muted">Média diária</dt>
                  <dd className="tabular font-semibold text-app-fg">
                    {fmtMm(est.mediaDiariaMm)}
                  </dd>
                </div>
                <div>
                  <dt className="text-app-fg-muted">Maior dia</dt>
                  <dd className="tabular font-semibold text-app-fg">
                    {fmtMm(est.maiorDiaMm)}
                  </dd>
                </div>
                <div>
                  <dt className="text-app-fg-muted">Dias com dado</dt>
                  <dd className="tabular font-semibold text-app-fg">
                    {est.diasComDado.toLocaleString('pt-BR')}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Índice da estação na lista exibida (= índice de cor). */
function estacoesIndice(estacoes: readonly Estacao[], id: string): number {
  return estacoes.findIndex((e) => e.id === id);
}

function ConteudoCarregando({ quantidade }: { quantidade: number }) {
  return (
    <SkeletonGrupo
      rotulo={`Carregando as leituras de ${quantidade.toLocaleString('pt-BR')} estações`}
    >
      <div className="space-y-4">
        <p className="text-sm text-app-fg-muted">
          Buscando dados de {quantidade.toLocaleString('pt-BR')}{' '}
          {quantidade === 1 ? 'estação' : 'estações'}…
        </p>
        <div className="h-72 w-full animate-pulse rounded-gov-card bg-app-border-subtle sm:h-80" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-gov-card bg-app-border-subtle"
            />
          ))}
        </div>
      </div>
    </SkeletonGrupo>
  );
}
