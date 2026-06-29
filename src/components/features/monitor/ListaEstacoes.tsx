'use client';

import Link from 'next/link';
import { ExternalLink, LineChart } from 'lucide-react';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import type { Estacao } from './tipos';
import { ROTULO_TIPO } from './tipos';
import { corDoOwner, entidadeDaEstacao } from './paleta-monitor';
import { BotaoComparar } from './BotaoComparar';

/**
 * Alternativa textual ao mapa (e-MAG / WCAG: conteúdo gráfico precisa de
 * equivalente acessível). Lista as estações filtradas em tabela navegável por
 * teclado e leitor de tela, com link pra ficha do posto quando vinculada.
 *
 * Não depende de cor pra transmitir informação: a entidade aparece como texto
 * (a bolinha colorida é só apoio visual, aria-hidden) e o tipo é texto.
 */
/** Controles de comparação passados para a lista (cesta multi-estação). */
export interface ComparacaoLista {
  estaSelecionada: (id: string) => boolean;
  podeAdicionar: boolean;
  aoAlternar: (estacao: Estacao) => void;
}

export function ListaEstacoes({
  estacoes,
  aoSelecionar,
  comparacao,
}: {
  estacoes: readonly Estacao[];
  /** Abre o painel de detalhe (gráfico de chuva) da estação. */
  aoSelecionar: (estacao: Estacao) => void;
  /** Controles da cesta de comparação. Omitido = sem coluna de comparação. */
  comparacao?: ComparacaoLista;
}) {
  const colunas: readonly ColunaTabela<Estacao>[] = [
    {
      chave: 'nome',
      cabecalho: 'Estação',
      interativa: true,
      render: (e) =>
        e.postoId && e.prefixo ? (
          <Link
            href={`/postos/${encodeURIComponent(e.prefixo)}`}
            className="inline-flex items-center gap-1.5 rounded-sm text-app-fg hover:text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            aria-label={`Abrir ficha do posto ${e.prefixo}, ${e.nome || 'sem nome'}`}
          >
            <span className="text-sm">{e.nome || 'Sem nome'}</span>
            <ExternalLink className="h-3 w-3 shrink-0 text-app-fg-muted" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-sm text-app-fg">{e.nome || 'Sem nome'}</span>
        ),
    },
    {
      chave: 'prefixo',
      cabecalho: 'Prefixo',
      classeCelula: 'mono text-2xs text-app-fg-muted',
      render: (e) => e.prefixo ?? '—',
    },
    {
      chave: 'entidade',
      cabecalho: 'Entidade',
      classeCelula: 'text-app-fg-muted',
      render: (e) => (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-app-border-subtle"
            style={{ backgroundColor: corDoOwner(e.owner) }}
          />
          <span className="text-sm">{entidadeDaEstacao(e)}</span>
        </span>
      ),
    },
    {
      chave: 'bacia',
      cabecalho: 'UGRHI',
      classeCelula: 'text-app-fg-muted',
      render: (e) => e.bacia ?? '—',
    },
    {
      chave: 'tipo',
      cabecalho: 'Tipo',
      classeCelula: 'text-app-fg-muted',
      render: (e) => ROTULO_TIPO[e.tipo],
    },
    {
      chave: 'coordenadas',
      cabecalho: 'Coordenadas',
      alinhar: 'right',
      classeCelula: 'mono tabular text-2xs text-app-fg-subtle',
      render: (e) => `${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}`,
    },
    {
      chave: 'acoes',
      cabecalho: 'Detalhes',
      alinhar: 'right',
      interativa: true,
      render: (e) => (
        <button
          type="button"
          onClick={() => aoSelecionar(e)}
          aria-label={`Ver leituras de ${e.nome || 'estação sem nome'}`}
          className="inline-flex items-center gap-1.5 rounded border border-app-border-input px-2 py-1 text-xs font-medium text-gov-azul hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          <LineChart className="h-3.5 w-3.5" aria-hidden="true" />
          Leituras
        </button>
      ),
    },
    // Coluna de comparação: só quando os controles da cesta foram passados.
    ...(comparacao
      ? [
          {
            chave: 'comparar',
            cabecalho: 'Comparar',
            alinhar: 'right',
            interativa: true,
            render: (e: Estacao) => (
              <BotaoComparar
                estacao={e}
                selecionada={comparacao.estaSelecionada(e.id)}
                podeAdicionar={comparacao.podeAdicionar}
                aoAlternar={comparacao.aoAlternar}
                tamanho="compacto"
              />
            ),
          } satisfies ColunaTabela<Estacao>,
        ]
      : []),
  ];

  return (
    <Tabela
      legenda="Estações pluviométricas filtradas: nome, prefixo, entidade responsável, UGRHI, tipo, coordenadas e ação de detalhes. Estações vinculadas a um posto do catálogo têm link para a ficha; o botão Leituras abre o gráfico de chuva da estação."
      colunas={colunas}
      itens={estacoes}
      densidade="compact"
      chaveItem={(e) => e.id}
    />
  );
}
