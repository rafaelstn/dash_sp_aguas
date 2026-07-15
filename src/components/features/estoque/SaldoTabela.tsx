'use client';

import { ArrowLeftRight, Boxes, Pencil } from 'lucide-react';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import { BadgeAbaixoMinimo } from './Badges';
import type { MaterialAgrupado } from './saldos-agrupados';

/** Linha secundaria "marca · modelo" (ponto medio), omitindo campos nulos. */
function marcaModelo(g: MaterialAgrupado): string {
  return [g.marca, g.modelo].filter(Boolean).join(' · ');
}

/** Rotulo acessivel do material: descricao + marca/modelo quando houver. */
function rotuloMaterial(g: MaterialAgrupado): string {
  const detalhe = marcaModelo(g);
  return detalhe ? `${g.descricao} (${detalhe})` : g.descricao;
}

interface Props {
  grupos: readonly MaterialAgrupado[];
  aoAbrir: (materialId: string) => void;
  podeGerenciar: boolean;
  aoMovimentar: (materialId: string) => void;
  aoEditar: (materialId: string) => void;
}

/**
 * Tabela de materiais quantificaveis com saldo por local. Uma linha por
 * material, com total agregado; o detalhe abre a distribuicao por local.
 */
export function SaldoTabela({ grupos, aoAbrir, podeGerenciar, aoMovimentar, aoEditar }: Props) {
  const colunas: ColunaTabela<MaterialAgrupado>[] = [
    {
      chave: 'descricao',
      cabecalho: 'Material',
      largura: '26rem',
      render: (g) => {
        const detalhe = marcaModelo(g);
        return (
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => aoAbrir(g.materialId)}
              className="group block max-w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              <span className="block max-w-full truncate font-medium text-gov-azul group-hover:underline">
                {g.descricao}
              </span>
              {detalhe ? (
                <span className="mt-0.5 block max-w-full truncate text-2xs text-app-fg-muted">
                  {detalhe}
                </span>
              ) : null}
            </button>
            {g.abaixoDoMinimo ? <BadgeAbaixoMinimo minimo={g.quantidadeMinima} /> : null}
          </div>
        );
      },
    },
    {
      chave: 'locais',
      cabecalho: 'Locais',
      alinhar: 'right',
      largura: '6rem',
      render: (g) => <span className="tabular text-app-fg-muted">{g.totalLocais}</span>,
    },
    {
      chave: 'total',
      cabecalho: 'Saldo total',
      alinhar: 'right',
      largura: '7rem',
      render: (g) => (
        <div className="flex flex-col items-end">
          <span
            className={[
              'tabular font-semibold',
              g.abaixoDoMinimo ? 'text-amber-900' : 'text-app-fg',
            ].join(' ')}
          >
            {g.total.toLocaleString('pt-BR')}
          </span>
          {g.quantidadeMinima != null ? (
            <span className="text-2xs text-app-fg-muted tabular">
              mín {g.quantidadeMinima.toLocaleString('pt-BR')}
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  if (podeGerenciar) {
    colunas.push({
      chave: 'acoes',
      cabecalho: 'Ações',
      alinhar: 'right',
      largura: '6rem',
      interativa: true,
      render: (g) => (
        <div className="flex items-center justify-end gap-1">
          <BotaoIcone
            rotulo={`Movimentar ${rotuloMaterial(g)}`}
            onClick={() => aoMovimentar(g.materialId)}
            icone={ArrowLeftRight}
          />
          <BotaoIcone
            rotulo={`Editar ${rotuloMaterial(g)}`}
            onClick={() => aoEditar(g.materialId)}
            icone={Pencil}
          />
        </div>
      ),
    });
  }

  return (
    <Tabela
      legenda="Materiais quantificáveis e saldo por local"
      colunas={colunas}
      itens={grupos}
      chaveItem={(g) => g.materialId}
      densidade="compact"
      vazio={
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-app-fg-muted">
          <Boxes className="h-4 w-4" aria-hidden="true" />
          <span>Nenhum material quantificável no filtro atual.</span>
        </div>
      }
    />
  );
}

function BotaoIcone({
  rotulo,
  onClick,
  icone: Icone,
}: {
  rotulo: string;
  onClick: () => void;
  icone: typeof Pencil;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className="inline-flex h-7 w-7 items-center justify-center rounded border border-app-border-subtle text-app-fg-muted hover:bg-app-surface-2 hover:text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
