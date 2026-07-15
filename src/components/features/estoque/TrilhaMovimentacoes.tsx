import { History } from 'lucide-react';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { BadgeTipoMov } from './Badges';
import { ROTULO_STATUS, formatarDataHora, rotuloEstado } from './rotulos';
import type { MovimentacaoTrilhaDTO } from './dtos';

interface TrilhaProps {
  movimentacoes: readonly MovimentacaoTrilhaDTO[];
  /** Resolve o rotulo legivel de um local a partir do id. */
  nomeLocal: (id: string | null) => string;
}

/**
 * Trilha de auditoria (ledger) de um item, em tabela acessivel. Append-only no
 * backend: cada linha e um evento imutavel (quem, quando, de/para, motivo).
 */
export function TrilhaMovimentacoes({ movimentacoes, nomeLocal }: TrilhaProps) {
  if (movimentacoes.length === 0) {
    return (
      <EstadoVazio
        icone={History}
        nivelTitulo={3}
        titulo="Sem movimentação registrada"
        descricao="Ainda não há eventos na trilha de auditoria deste item."
      />
    );
  }

  const colunas: readonly ColunaTabela<MovimentacaoTrilhaDTO>[] = [
    {
      chave: 'data',
      cabecalho: 'Data e hora',
      largura: '10.5rem',
      render: (m) => (
        <span className="whitespace-nowrap text-app-fg-muted">{formatarDataHora(m.criadoEm)}</span>
      ),
    },
    {
      chave: 'tipo',
      cabecalho: 'Tipo',
      render: (m) => <BadgeTipoMov tipo={m.tipo} />,
    },
    {
      chave: 'qtd',
      cabecalho: 'Qtd.',
      alinhar: 'right',
      largura: '4rem',
      render: (m) => <span className="tabular">{m.quantidade.toLocaleString('pt-BR')}</span>,
    },
    {
      chave: 'movimento',
      cabecalho: 'Origem e destino',
      render: (m) => {
        const origem = m.localOrigemId ? nomeLocal(m.localOrigemId) : null;
        const destino = m.localDestinoId ? nomeLocal(m.localDestinoId) : null;
        if (!origem && !destino) return <span className="text-app-fg-subtle">—</span>;
        return (
          <span className="text-app-fg-muted">
            {origem ?? '—'} {'→'} {destino ?? '—'}
          </span>
        );
      },
    },
    {
      chave: 'situacao',
      cabecalho: 'Situação',
      render: (m) => {
        const partes: string[] = [];
        if (m.statusAnterior || m.statusNovo) {
          const de = m.statusAnterior ? ROTULO_STATUS[m.statusAnterior] : '—';
          const para = m.statusNovo ? ROTULO_STATUS[m.statusNovo] : '—';
          if (de !== para) partes.push(`Situação: ${de} → ${para}`);
        }
        if (m.estadoAnterior || m.estadoNovo) {
          const de = rotuloEstado(m.estadoAnterior);
          const para = rotuloEstado(m.estadoNovo);
          if (de !== para) partes.push(`Estado: ${de} → ${para}`);
        }
        if (partes.length === 0) return <span className="text-app-fg-subtle">—</span>;
        return <span className="text-app-fg-muted">{partes.join(' · ')}</span>;
      },
    },
    {
      chave: 'operador',
      cabecalho: 'Operador',
      largura: '11rem',
      render: (m) =>
        m.operador ? (
          <span className="block max-w-[11rem] truncate text-app-fg-muted" title={m.operador}>
            {m.operador}
          </span>
        ) : (
          <span className="text-app-fg-subtle">—</span>
        ),
    },
    {
      chave: 'motivo',
      cabecalho: 'Motivo',
      render: (m) =>
        m.motivo ? (
          <span className="text-app-fg">{m.motivo}</span>
        ) : (
          <span className="text-app-fg-subtle">—</span>
        ),
    },
  ];

  return (
    <Tabela
      legenda="Trilha de movimentação do item"
      colunas={colunas}
      itens={movimentacoes}
      chaveItem={(m) => m.id}
      densidade="compact"
    />
  );
}
