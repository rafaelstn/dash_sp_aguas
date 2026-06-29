'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { X, ExternalLink, CloudRain } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { ROTULO_TIPO } from './tipos';
import type { Estacao } from './tipos';
import type { PeriodoDias } from './tipos-leituras';
import { PERIODOS } from './tipos-leituras';
import { useLeiturasEstacao } from './useLeiturasEstacao';
import { GraficoChuva } from './GraficoChuva';
import { BotaoComparar } from './BotaoComparar';
import {
  calcularEstatisticas,
  fmtDataLonga,
  fmtMm,
  temLeituraManual,
} from './estatisticas-leituras';

/**
 * Controles de comparação injetados no painel. Opcionais: quando ausentes, o
 * painel não mostra o botão de comparação (mantém o componente reutilizável fora
 * do contexto do Monitor).
 */
export interface ControlesComparacao {
  selecionada: boolean;
  podeAdicionar: boolean;
  aoAlternar: (estacao: Estacao) => void;
}

interface PainelDetalheEstacaoProps {
  /** Estação selecionada. null = painel fechado. */
  estacao: Estacao | null;
  aoFechar: () => void;
  /** Controles da cesta de comparação. Omitido = sem botão de comparação. */
  comparacao?: ControlesComparacao;
}

/**
 * Painel de detalhe da estação (Monitor B3). Drawer lateral em <dialog> nativo:
 * showModal() entrega focus-trap, modalidade e Esc de graça (mesmo padrão do
 * ConfirmDialog do design system), sem montar um trap manual frágil. No mobile
 * vira full-screen.
 *
 * Conteúdo: cabeçalho da estação + seletor de período + gráfico de chuva diária
 * + estatísticas + tabela (alternativa textual acessível ao gráfico, e-MAG /
 * WCAG 1.1.1) + bloco de comparação auto vs manual (com guarda manual=0).
 */
export function PainelDetalheEstacao({
  estacao,
  aoFechar,
  comparacao,
}: PainelDetalheEstacaoProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [periodo, setPeriodo] = useState<PeriodoDias>(30);
  const baseId = useId();
  const tituloId = `${baseId}-titulo`;

  const aberto = estacao !== null;
  const estado = useLeiturasEstacao(estacao?.id ?? null, periodo);

  // Abre/fecha o <dialog> imperativamente: o modo modal só existe via
  // showModal(); o atributo `open` declarativo não dá modalidade nem trap.
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

  // Volta ao período padrão a cada nova estação aberta (evita herdar 90 dias
  // de uma consulta anterior sem o usuário perceber).
  useEffect(() => {
    if (aberto) setPeriodo(30);
  }, [aberto, estacao?.id]);

  // Clique no backdrop fecha (conforto; Esc e o botão X são as vias primárias).
  // Tratado por listener nativo no <dialog> — e não por onClick no JSX — pra
  // não ferir as regras jsx-a11y (o <dialog> não é elemento interativo). O
  // backdrop é o próprio <dialog>; cliques no conteúdo têm outro target.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    function aoClicar(e: MouseEvent) {
      if (e.target === dlg) aoFechar();
    }
    dlg.addEventListener('click', aoClicar);
    return () => dlg.removeEventListener('click', aoClicar);
  }, [aoFechar]);

  if (!estacao) {
    // Mantém o <dialog> no DOM (fechado) pra preservar a referência e a
    // transição de foco; sem conteúdo quando não há estação.
    return <dialog ref={dialogRef} className="hidden" aria-hidden="true" />;
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        // Esc dispara cancel no <dialog>; sincronizamos com o estado React.
        e.preventDefault();
        aoFechar();
      }}
      onClose={() => {
        if (aberto) aoFechar();
      }}
      aria-modal="true"
      aria-labelledby={tituloId}
      // O <dialog> vira a camada full-screen; o painel é o card à direita.
      // backdrop escurece o resto. No mobile o card ocupa a largura toda.
      className="m-0 h-dvh max-h-dvh w-full max-w-full bg-transparent p-0 backdrop:bg-black/40 sm:ml-auto sm:mr-0 sm:h-dvh sm:w-[min(560px,100vw)]"
    >
      <div className="flex h-dvh flex-col bg-app-surface text-app-fg shadow-gov-card-hover">
        <CabecalhoPainel
          estacao={estacao}
          tituloId={tituloId}
          aoFechar={aoFechar}
          comparacao={comparacao}
        />

        <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} />

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {estado.status === 'carregando' || estado.status === 'inativo' ? (
            <ConteudoCarregando />
          ) : estado.status === 'erro' ? (
            <Alerta tipo="erro" titulo="Falha ao carregar as leituras">
              {estado.mensagem} Verifique a conexão e tente novamente em
              instantes.
            </Alerta>
          ) : estado.dados.itens.length === 0 ? (
            <EstadoVazio
              icone={CloudRain}
              titulo="Sem leituras no período"
              descricao="Não há leituras registradas para esta estação no período selecionado. Experimente um período maior."
              nivelTitulo={3}
            />
          ) : (
            <ConteudoLeituras itens={estado.dados.itens} />
          )}
        </div>
      </div>
    </dialog>
  );
}

function CabecalhoPainel({
  estacao,
  tituloId,
  aoFechar,
  comparacao,
}: {
  estacao: Estacao;
  tituloId: string;
  aoFechar: () => void;
  comparacao?: ControlesComparacao;
}) {
  const meta: string[] = [];
  if (estacao.prefixo) meta.push(`Prefixo ${estacao.prefixo}`);
  meta.push(ROTULO_TIPO[estacao.tipo]);
  if (estacao.bacia) meta.push(`Bacia: ${estacao.bacia}`);

  return (
    <header className="flex items-start gap-3 border-b border-app-border-subtle px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <h2 id={tituloId} className="truncate text-lg font-semibold text-app-fg">
          {estacao.nome || 'Sem nome'}
        </h2>
        <p className="mt-0.5 text-sm text-app-fg-muted">{meta.join(' · ')}</p>
        {estacao.postoId && estacao.prefixo ? (
          <Link
            href={`/postos/${encodeURIComponent(estacao.prefixo)}`}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Abrir ficha do posto
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <p className="mt-1.5 text-sm text-app-fg-subtle">
            Sem posto do catálogo vinculado
          </p>
        )}
        {comparacao ? (
          <div className="mt-2.5">
            <BotaoComparar
              estacao={estacao}
              selecionada={comparacao.selecionada}
              podeAdicionar={comparacao.podeAdicionar}
              aoAlternar={comparacao.aoAlternar}
            />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        data-foco-inicial
        onClick={aoFechar}
        aria-label="Fechar painel de detalhe"
        className="shrink-0 rounded p-1.5 text-app-fg-muted hover:bg-app-surface-2 hover:text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </header>
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

function ConteudoCarregando() {
  return (
    <SkeletonGrupo rotulo="Carregando as leituras da estação">
      <div className="space-y-4">
        <div className="h-64 w-full animate-pulse rounded-gov-card bg-app-border-subtle" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-gov-card bg-app-border-subtle"
            />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-7 animate-pulse rounded bg-app-border-subtle"
            />
          ))}
        </div>
      </div>
    </SkeletonGrupo>
  );
}

function ConteudoLeituras({
  itens,
}: {
  itens: readonly import('./tipos-leituras').LeituraDiaria[];
}) {
  const mostrarManual = temLeituraManual(itens);
  const est = calcularEstatisticas(itens);

  return (
    <div className="space-y-5">
      <section aria-label="Gráfico de chuva diária">
        <h3 className="mb-2 text-sm font-semibold text-app-fg">
          Chuva diária (mm)
        </h3>
        <GraficoChuva itens={itens} mostrarManual={mostrarManual} />
      </section>

      <section aria-label="Estatísticas do período">
        <h3 className="mb-2 text-sm font-semibold text-app-fg">
          Estatísticas do período
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <CartaoEstat rotulo="Total" valor={fmtMm(est.totalMm)} />
          <CartaoEstat rotulo="Média diária" valor={fmtMm(est.mediaDiariaMm)} />
          <CartaoEstat
            rotulo="Dias com chuva"
            valor={`${est.diasComChuva.toLocaleString('pt-BR')} de ${itens.length.toLocaleString('pt-BR')}`}
          />
          <CartaoEstat
            rotulo="Dia mais chuvoso"
            valor={
              est.diaMaisChuvoso
                ? fmtMm(est.diaMaisChuvoso.mm)
                : 'Sem chuva no período'
            }
            complemento={
              est.diaMaisChuvoso
                ? fmtDataLonga(est.diaMaisChuvoso.momento)
                : undefined
            }
          />
        </div>
      </section>

      <BlocoComparacao mostrarManual={mostrarManual} />

      <section aria-label="Tabela de leituras">
        <h3 className="mb-2 text-sm font-semibold text-app-fg">
          Leituras do período
        </h3>
        <p className="mb-2 text-xs text-app-fg-muted">
          Tabela equivalente ao gráfico acima, para leitura textual e por leitor
          de tela.
        </p>
        <TabelaLeituras itens={itens} />
      </section>
    </div>
  );
}

function CartaoEstat({
  rotulo,
  valor,
  complemento,
}: {
  rotulo: string;
  valor: string;
  complemento?: string;
}) {
  return (
    <div className="rounded-gov-card border border-app-border-subtle bg-app-surface-2 px-3 py-2.5">
      <dt className="text-xs text-app-fg-muted">{rotulo}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular text-app-fg">
        {valor}
      </dd>
      {complemento ? (
        <dd className="text-xs text-app-fg-subtle tabular">{complemento}</dd>
      ) : null}
    </div>
  );
}

function BlocoComparacao({ mostrarManual }: { mostrarManual: boolean }) {
  // Guarda manual=0: hoje a leitura manual do operador não existe (vem sempre
  // 0). Comparar auto vs manual daria 100% de divergência falsa. Mostramos um
  // aviso; a estrutura de 2 séries + divergência fica pronta para quando o
  // operador começar a registrar (mostrarManual passa a true).
  if (!mostrarManual) {
    return (
      <section aria-label="Comparação automático versus manual">
        <Alerta tipo="info" titulo="Leitura manual ainda não disponível">
          A comparação entre a leitura automática e a manual será exibida quando
          o operador registrar leituras manuais para esta estação. Por enquanto,
          apenas a série automática está disponível.
        </Alerta>
      </section>
    );
  }

  return (
    <section aria-label="Comparação automático versus manual">
      <Alerta tipo="info" titulo="Comparação automático versus manual">
        A estação já possui leituras manuais. O gráfico exibe as duas séries
        lado a lado para comparação visual da divergência.
      </Alerta>
    </section>
  );
}

function TabelaLeituras({
  itens,
}: {
  itens: readonly import('./tipos-leituras').LeituraDiaria[];
}) {
  // Mais recentes primeiro na tabela (a série chega crescente; invertemos para
  // leitura): o operador quer ver o dia de hoje no topo.
  const linhas = [...itens].reverse();
  return (
    <div className="overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface">
      <table className="w-full border-collapse text-sm tabular">
        <caption className="sr-only">
          Leituras diárias de chuva da estação: data, total automático e total
          manual, em milímetros. Equivalente textual do gráfico de barras.
        </caption>
        <thead>
          <tr className="bg-app-surface-2">
            <th
              scope="col"
              className="border-b border-app-border-subtle px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-app-fg-muted"
            >
              Data
            </th>
            <th
              scope="col"
              className="border-b border-app-border-subtle px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-app-fg-muted"
            >
              Automático
            </th>
            <th
              scope="col"
              className="border-b border-app-border-subtle px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-app-fg-muted"
            >
              Manual
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((item) => (
            <tr
              key={item.momento}
              className="border-b border-app-border-subtle last:border-0 even:bg-app-surface-2/40"
            >
              <th
                scope="row"
                className="px-3 py-1.5 text-left font-normal text-app-fg"
              >
                {fmtDataLonga(item.momento)}
              </th>
              <td className="px-3 py-1.5 text-right text-app-fg">
                {fmtMm(item.automaticoMm)}
              </td>
              <td className="px-3 py-1.5 text-right text-app-fg-subtle">
                {fmtMm(item.manualMm)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
