'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { Package, Printer } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { listarEtiquetas, type FiltrosEtiquetasUI, type RespostaEtiquetas } from './api';
import { ErroEstoque } from './erros';
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
 * Visao de impressao das etiquetas/QR de patrimonio do conjunto filtrado. Cada
 * etiqueta traz um QR que aponta para a pagina do item no proprio sistema
 * (`/estoque/patrimonio/<id>`), lido pela camera nativa do celular. O QR e SVG
 * inline (qrcode.react), sem rede, compativel com a CSP. No papel: `@media
 * print` esconde o chrome e imprime so a grade (ver globals.css, classe
 * `etiquetas-print` no body). Leitura: qualquer usuario logado imprime.
 */
export function VisaoEtiquetas({ filtros }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: 'carregando' });
  // origin resolvido no cliente (deploy atual). Vazio no 1o paint (SSR) para
  // nao divergir na hidratacao; o QR so renderiza quando ja temos o origin.
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
              ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'etiqueta' : 'etiquetas'} no filtro atual. Imprima e cole no equipamento; o QR abre a ficha do item.`
              : 'Gere e imprima as etiquetas com QR do conjunto filtrado.'}
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
            <Etiqueta key={item.id} item={item} origin={origin} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Uma etiqueta imprimivel: QR (link para a ficha) + texto legivel, com borda. */
function Etiqueta({ item, origin }: { item: ItemEtiqueta; origin: string }) {
  const url = origin ? `${origin}/estoque/patrimonio/${item.id}` : '';
  const patrimonio = item.patDaee ?? item.codigo;
  const rotuloAcessivel = [
    'QR do item',
    item.descricao,
    patrimonio ? `patrimônio ${patrimonio}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className="flex break-inside-avoid items-center gap-3 rounded border border-app-border-input bg-white p-3">
      <div className="shrink-0">
        {url ? (
          <QRCodeSVG
            value={url}
            size={112}
            level="M"
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#000000"
            title={rotuloAcessivel}
            role="img"
            aria-label={rotuloAcessivel}
          />
        ) : (
          // Placeholder ate resolver o origin (evita QR vazio/invalido no 1o paint).
          <div
            className="h-[112px] w-[112px] rounded bg-app-surface-2"
            aria-hidden="true"
          />
        )}
      </div>
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
