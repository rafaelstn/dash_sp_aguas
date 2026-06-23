import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { DesconformidadePrefixoAna } from '@/domain/desconformidade';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import { BotaoMarcarRevisado } from './BotaoMarcarRevisado';

const DESCRICAO_CLASSE: Record<DesconformidadePrefixoAna['classe'], string> = {
  faltando_zero_esquerda: 'Faltando zero à esquerda (7 dígitos em vez dos 8 oficiais)',
  outlier_ana: 'Outlier, quantidade de dígitos fora do padrão',
};

const colunas: readonly ColunaTabela<DesconformidadePrefixoAna>[] = [
  {
    chave: 'prefixo',
    cabecalho: 'Prefixo',
    largura: '8rem',
    render: (item) => (
      <span className="mono font-medium text-gov-azul">{item.prefixo}</span>
    ),
  },
  {
    chave: 'anaAtual',
    cabecalho: 'ANA atual',
    render: (item) => (
      <span className="mono text-app-fg">{item.prefixoAnaAtual ?? '—'}</span>
    ),
  },
  {
    chave: 'anaSugerido',
    cabecalho: 'ANA sugerido',
    render: (item) => (
      <span className="mono font-medium text-gov-sucesso">
        {item.prefixoAnaSugerido ?? '—'}
      </span>
    ),
  },
  {
    chave: 'classe',
    cabecalho: 'Classe',
    render: (item) => (
      <span className="text-app-fg">{DESCRICAO_CLASSE[item.classe]}</span>
    ),
  },
  {
    chave: 'acao',
    cabecalho: 'Ações',
    alinhar: 'right',
    interativa: true,
    render: (item) => (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href={`/postos/${encodeURIComponent(item.prefixo)}`}
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          aria-label={`Abrir posto ${item.prefixo}`}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Abrir posto
        </Link>
        <BotaoMarcarRevisado
          tipoEntidade="posto"
          idEntidade={item.prefixo}
          categoria="PREFIXO_ANA"
          statusInicial={item.statusRevisao}
        />
      </div>
    ),
  },
];

export function TabelaPrefixosAna({
  itens,
}: {
  itens: readonly DesconformidadePrefixoAna[];
}) {
  return (
    <Tabela
      legenda="Postos com prefixo ANA fora do padrão oficial de 8 dígitos. Cada linha apresenta o ANA atual, o ANA sugerido, a classe do problema e as ações de abrir o posto e marcar como revisado."
      colunas={colunas}
      itens={itens}
      densidade="normal"
      chaveItem={(item) => item.id}
      vazio={
        <EstadoVazio
          titulo="Nenhuma desconformidade de prefixo ANA"
          descricao="Todos os códigos ANA preenchidos aderem ao padrão oficial de 8 dígitos."
        />
      }
    />
  );
}
