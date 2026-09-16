'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, Printer } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { listarEtiquetas, type FiltrosEtiquetasUI, type RespostaEtiquetas } from './api';
import { ErroEstoque } from './erros';
import { CodigoBarrasEtiqueta } from './CodigoBarrasEtiqueta';
import type { ItemEtiqueta } from '@/domain/estoque/etiqueta';

interface Props {
  /** Filtros lidos da querystring pela pagina server (mesmos da aba). */
  filtros: FiltrosEtiquetasUI;
}

type Carga =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; dados: RespostaEtiquetas };

/**
 * Visão de impressão das etiquetas de patrimônio do conjunto filtrado. Cada
 * etiqueta traz o código de barras do `codigo` da unidade (pedido do órgão, que
 * lê com leitor USB; simbologia em `@/lib/codigo-barras`), em SVG inline, sem
 * rede, compatível com a CSP. No papel: `@media print` esconde o chrome e
 * imprime só a grade (ver globals.css, classe `etiquetas-print` no body).
 * Leitura: qualquer usuário logado imprime.
 */
export function VisaoEtiquetas({ filtros }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: 'carregando' });

  // Marca o body para o CSS de impressao esconder o chrome e imprimir so a grade.
  useEffect(() => {
    document.body.classList.add('etiquetas-print');
    return () => document.body.classList.remove('etiquetas-print');
  }, []);

  useEffect(() => {
    let ativo = true;
    const c = new AbortController();
    setCarga({ fase: 'carregando' });
    listarEtiquetas(filtros, c.signal)
      .then((dados) => {
        if (ativo) setCarga({ fase: 'ok', dados });
      })
      .catch((e) => {
        if (!ativo || c.signal.aborted) return;
        setCarga({
          fase: 'erro',
          mensagem:
            e instanceof ErroEstoque ? e.message : 'Não foi possível gerar as etiquetas.',
        });
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [filtros]);

  const total = carga.fase === 'ok' ? carga.dados.total : 0;

  return (
    <div className="space-y-4">
      {/* Barra de acoes: fora da impressao. */}
      <div className="no-print flex flex-col gap-3 border-b border-app-border-subtle pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav aria-label="Trilha de navegação" className="mb-1 text-xs text-app-fg-muted">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/estoque" className="text-gov-azul hover:underline">
                  Estoque
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li>Etiquetas</li>
            </ol>
          </nav>
          <h1 className="text-xl font-semibold text-app-fg">Etiquetas de patrimônio</h1>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            {carga.fase === 'ok'
              ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'etiqueta' : 'etiquetas'} no filtro atual.${total > 0 ? ' Imprima e cole no equipamento.' : ''}`
              : 'Gere e imprima as etiquetas com código de barras do conjunto filtrado.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/estoque"
            className="inline-flex items-center gap-1.5 rounded border border-gov-azul bg-app-surface px-3 py-1.5 text-sm font-medium text-gov-azul hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            <Package className="h-4 w-4" aria-hidden="true" />
            Voltar ao Estoque
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={carga.fase !== 'ok' || total === 0}
            className="inline-flex items-center gap-1.5 rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir
          </button>
        </div>
      </div>

      {carga.fase === 'ok' && carga.dados.truncado ? (
        <div className="no-print">
          <Alerta tipo="aviso" titulo="Muitos itens no filtro">
            A geração foi limitada às primeiras {total.toLocaleString('pt-BR')} etiquetas. Refine o
            filtro (unidade, local, situação ou busca) na tela do Estoque para imprimir o conjunto
            completo.
          </Alerta>
        </div>
      ) : null}

      {carga.fase === 'carregando' ? (
        <SkeletonGrupo rotulo="Gerando etiquetas">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded bg-app-border-subtle" />
            ))}
          </div>
        </SkeletonGrupo>
      ) : carga.fase === 'erro' ? (
        <Alerta tipo="erro" titulo="Erro ao gerar etiquetas">
          {carga.mensagem}
        </Alerta>
      ) : carga.dados.itens.length === 0 ? (
        <EstadoVazio
          icone={Package}
          nivelTitulo={2}
          titulo="Nenhum item para etiquetar"
          descricao="Nenhum item serializado corresponde ao filtro atual. Ajuste o filtro na tela do Estoque e gere as etiquetas novamente."
          acao={
            <Link
              href="/estoque"
              className="inline-flex items-center gap-1.5 rounded border border-gov-azul bg-app-surface px-3 py-1.5 text-sm font-medium text-gov-azul hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              <Package className="h-4 w-4" aria-hidden="true" />
              Voltar ao Estoque
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-3 print:gap-2">
          {carga.dados.itens.map((item) => (
            <Etiqueta key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Uma etiqueta imprimível: código de barras do `codigo` + texto legível, com borda. */
function Etiqueta({ item }: { item: ItemEtiqueta }) {
  const patrimonio = item.patDaee ?? item.codigo;

  return (
    <li className="flex break-inside-avoid flex-col gap-2 rounded border border-app-border-input bg-white p-3">
      <CodigoBarrasEtiqueta codigo={item.codigo} />
      <div className="min-w-0 flex-1 text-black">
        <p className="line-clamp-2 text-sm font-semibold leading-tight" title={item.descricao}>
          {item.descricao}
        </p>
        {patrimonio ? (
          <p className="mt-1 text-xs">
            <span className="font-medium">PAT.:</span> <span className="tabular">{patrimonio}</span>
          </p>
        ) : null}
        {item.codigo && item.patDaee && item.codigo !== item.patDaee ? (
          <p className="text-2xs text-neutral-700">
            <span className="font-medium">Cód.:</span> <span className="tabular">{item.codigo}</span>
          </p>
        ) : null}
        {item.numeroSerie ? (
          <p className="text-2xs text-neutral-700">
            <span className="font-medium">Série:</span>{' '}
            <span className="tabular break-all">{item.numeroSerie}</span>
          </p>
        ) : null}
        {[item.marca, item.modelo].filter(Boolean).length > 0 ? (
          <p className="truncate text-2xs text-neutral-700" title={[item.marca, item.modelo].filter(Boolean).join(' · ')}>
            {[item.marca, item.modelo].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {item.localRotulo ? (
          <p className="mt-1 truncate text-2xs text-neutral-600" title={item.localRotulo}>
            {item.localRotulo}
          </p>
        ) : null}
      </div>
    </li>
  );
}
