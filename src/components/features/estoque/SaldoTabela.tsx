'use client';

import { ArrowLeftRight, Boxes, Pencil } from 'lucide-react';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import type { MaterialAgrupado } from './saldos-agrupados';

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
      render: (g) => (
        <button
          type="button"
          onClick={() => aoAbrir(g.materialId)}
          className="block max-w-full truncate text-left font-medium text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          {g.descricao}
        </button>
      ),
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
        <span className="tabular font-semibold text-app-fg">
          {g.total.toLocaleString('pt-BR')}
        </span>
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
            rotulo={`Movimentar ${g.descricao}`}
            onClick={() => aoMovimentar(g.materialId)}
            icone={ArrowLeftRight}
          />
          <BotaoIcone
            rotulo={`Editar ${g.descricao}`}
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
