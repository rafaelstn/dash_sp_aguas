import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { DesconformidadePrefixo } from '@/domain/desconformidade';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import { BotaoMarcarRevisado } from './BotaoMarcarRevisado';

const DESCRICAO_CLASSE: Record<DesconformidadePrefixo['classe'], string> = {
  suspeita_troca_letra_digito: 'Suspeita de inversão entre letra e dígito iniciais',
  placeholder_interrogacao: 'Placeholder com interrogação literal',
  outlier_prefixo: 'Outlier, prefixo fora de qualquer padrão oficial',
};

const colunas: readonly ColunaTabela<DesconformidadePrefixo>[] = [
  {
    chave: 'prefixo',
    cabecalho: 'Prefixo',
    largura: '8rem',
    render: (item) => (
      <span className="mono font-medium text-gov-azul">{item.prefixo}</span>
    ),
  },
  {
    chave: 'classe',
    cabecalho: 'Classe do problema',
    render: (item) => (
      <span className="text-app-fg">{DESCRICAO_CLASSE[item.classe]}</span>
    ),
  },
  {
    chave: 'sugestao',
    cabecalho: 'Sugestão de correção',
    render: (item) =>
      item.sugestao ? (
        <span className="text-app-fg">{item.sugestao}</span>
      ) : (
        <span className="text-app-fg-subtle">Sem sugestão automática.</span>
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
          categoria="PREFIXO_PRINCIPAL"
          statusInicial={item.statusRevisao}
        />
      </div>
    ),
  },
];

export function TabelaPrefixosPrincipais({
  itens,
}: {
  itens: readonly DesconformidadePrefixo[];
}) {
  return (
    <Tabela
      legenda="Postos com prefixo principal fora do padrão oficial. Cada linha apresenta o prefixo atual, a classe do problema, a sugestão textual e as ações de abrir o posto e marcar como revisado."
      colunas={colunas}
      itens={itens}
      densidade="normal"
      chaveItem={(item) => item.id}
      vazio={
        <EstadoVazio
          titulo="Nenhuma desconformidade de prefixo principal"
          descricao="Todos os prefixos principais cadastrados aderem ao padrão oficial."
        />
      }
    />
  );
}
