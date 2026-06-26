'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import type { Estacao } from './tipos';
import { ROTULO_TIPO } from './tipos';

/**
 * Alternativa textual ao mapa (e-MAG / WCAG: conteúdo gráfico precisa de
 * equivalente acessível). Lista as estações filtradas em tabela navegável por
 * teclado e leitor de tela, com link pra ficha do posto quando vinculada.
 *
 * Não depende de cor pra transmitir o tipo: a coluna "Tipo" é texto.
 */
export function ListaEstacoes({ estacoes }: { estacoes: readonly Estacao[] }) {
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
      chave: 'bacia',
      cabecalho: 'Bacia',
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
  ];

  return (
    <Tabela
      legenda="Estações pluviométricas filtradas: nome, prefixo, bacia, tipo e coordenadas. Estações vinculadas a um posto do catálogo têm link para a ficha."
      colunas={colunas}
      itens={estacoes}
      densidade="compact"
      chaveItem={(e) => e.id}
    />
  );
}
