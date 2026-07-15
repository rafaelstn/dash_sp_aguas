'use client';

import { ArrowLeftRight, PackageX, Pencil } from 'lucide-react';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import { BadgeEstado, BadgeStatus } from './Badges';
import type { UnidadeDTO } from './dtos';

interface Props {
  unidades: readonly UnidadeDTO[];
  nomeLocal: (id: string | null) => string;
  aoAbrir: (unidade: UnidadeDTO) => void;
  /** Acoes de escrita (admin). Ocultas para papel `user`. */
  podeGerenciar: boolean;
  aoMovimentar: (unidade: UnidadeDTO) => void;
  aoEditar: (unidade: UnidadeDTO) => void;
}

/**
 * Tabela de itens serializados (1 linha = 1 item fisico). Descricao abre o
 * detalhe; acoes de escrita so aparecem para quem pode gerenciar.
 */
export function TabelaUnidades({
  unidades,
  nomeLocal,
  aoAbrir,
  podeGerenciar,
  aoMovimentar,
  aoEditar,
}: Props) {
  const colunas: ColunaTabela<UnidadeDTO>[] = [
    {
      chave: 'descricao',
      cabecalho: 'Descrição',
      largura: '22rem',
      render: (u) => (
        <button
          type="button"
          onClick={() => aoAbrir(u)}
          className="block max-w-full text-left font-medium text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          <span className="block truncate">{u.descricao}</span>
          {(u.marca || u.modelo) && (
            <span className="block truncate text-2xs font-normal text-app-fg-muted">
              {[u.marca, u.modelo].filter(Boolean).join(' · ')}
            </span>
          )}
        </button>
      ),
    },
    {
      chave: 'patrimonio',
      cabecalho: 'Patrimônio',
      render: (u) => (
        <span className="mono text-xs text-app-fg-muted">
          {u.patDaee ?? u.codigoSpaguas ?? u.codigo ?? '—'}
        </span>
      ),
    },
    {
      chave: 'serie',
      cabecalho: 'Série / IMEI',
      render: (u) => <span className="mono text-xs text-app-fg-muted">{u.numeroSerie ?? '—'}</span>,
    },
    {
      chave: 'local',
      cabecalho: 'Local',
      render: (u) => <span className="text-app-fg-muted">{nomeLocal(u.localId)}</span>,
    },
    {
      chave: 'estado',
      cabecalho: 'Estado',
      render: (u) => <BadgeEstado estado={u.estado} />,
    },
    {
      chave: 'status',
      cabecalho: 'Situação',
      render: (u) => <BadgeStatus status={u.status} />,
    },
  ];

  if (podeGerenciar) {
    colunas.push({
      chave: 'acoes',
      cabecalho: 'Ações',
      alinhar: 'right',
      largura: '6rem',
      interativa: true,
      render: (u) => (
        <div className="flex items-center justify-end gap-1">
          <BotaoIcone
            rotulo={`Movimentar ${u.descricao}`}
            onClick={() => aoMovimentar(u)}
            icone={ArrowLeftRight}
          />
          <BotaoIcone
            rotulo={`Editar ${u.descricao}`}
            onClick={() => aoEditar(u)}
            icone={Pencil}
          />
        </div>
      ),
    });
  }

  return (
    <Tabela
      legenda="Itens serializados do estoque"
      colunas={colunas}
      itens={unidades}
      chaveItem={(u) => u.id}
      densidade="compact"
      vazio={
        <EmptyInline
          icone={PackageX}
          texto="Nenhum item serializado no filtro atual."
        />
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

function EmptyInline({ icone: Icone, texto }: { icone: typeof PackageX; texto: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-app-fg-muted">
      <Icone className="h-4 w-4" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}
