import type { Posto } from '@/domain/posto';
import { formatarValor } from '@/lib/format';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import { BotaoFavoritar } from '@/components/features/favoritos/BotaoFavoritar';

export interface ListaResultadosProps {
  itens: Posto[];
  total: number;
  termo: string;
  /** Prefixos favoritos do usuário atual — render inicial do botão. */
  prefixosFavoritos?: Set<string>;
  /** Usuário autenticado? — se não, botão favoritar manda pra /login. */
  autenticado?: boolean;
}

/** Pílula mini para indicadores FD/FI/Telem — 3 cards por linha. */
function PilulaIndicador({ rotulo, ativo }: { rotulo: string; ativo: boolean }) {
  return (
    <span
      aria-label={`${rotulo}: ${ativo ? 'sim' : 'não'}`}
      title={`${rotulo}: ${ativo ? 'sim' : 'não'}`}
      className={[
        'mono inline-flex h-5 min-w-[2rem] items-center justify-center rounded border px-1.5 text-2xs font-semibold',
        ativo
          ? 'border-gov-azul/30 bg-gov-azul-claro text-gov-azul'
          : 'border-app-border-subtle bg-app-surface-2 text-app-fg-subtle',
      ].join(' ')}
    >
      {rotulo}
    </span>
  );
}

export function ListaResultados({
  itens,
  total,
  termo,
  prefixosFavoritos,
  autenticado = false,
}: ListaResultadosProps) {
  const favoritos = prefixosFavoritos ?? new Set<string>();

  const colunas: ColunaTabela<Posto>[] = [
    {
      chave: 'prefixo',
      cabecalho: 'Prefixo',
      largura: '10ch',
      render: (p) => (
        <span className="mono font-semibold text-gov-azul">{p.prefixo}</span>
      ),
    },
    {
      chave: 'nome',
      cabecalho: 'Nome da estação',
      render: (p) => (
        <span className="font-medium text-app-fg">
          {formatarValor(p.nomeEstacao)}
        </span>
      ),
    },
    {
      chave: 'municipio',
      cabecalho: 'Município',
      largura: '20ch',
      render: (p) => (
        <span className="text-app-fg-muted">{formatarValor(p.municipio)}</span>
      ),
    },
    {
      chave: 'ugrhi',
      cabecalho: 'UGRHI',
      largura: '18ch',
      render: (p) => (
        <span className="text-app-fg-muted">{formatarValor(p.ugrhiNome)}</span>
      ),
    },
    {
      chave: 'tipo',
      cabecalho: 'Tipo',
      largura: '12ch',
      render: (p) => (
        <span className="text-app-fg-muted">{formatarValor(p.tipoPosto)}</span>
      ),
    },
    {
      chave: 'indicadores',
      cabecalho: 'Cadastro',
      largura: '140px',
      render: (p) => (
        <div className="flex items-center gap-1">
          <PilulaIndicador rotulo="FD" ativo={Boolean(p.fichaDescritiva)} />
          <PilulaIndicador rotulo="FI" ativo={Boolean(p.fichaInspecao)} />
          <PilulaIndicador rotulo="TEL" ativo={Boolean(p.telemetrico)} />
        </div>
      ),
    },
    {
      chave: 'favorito',
      cabecalho: <span className="sr-only">Favoritar</span>,
      largura: '48px',
      alinhar: 'center',
      // Célula interativa — o botão estrela precisa ficar acima do stretched
      // link da linha, senão clicar na estrela navegaria pra ficha.
      interativa: true,
      render: (p) => (
        <BotaoFavoritar
          prefixo={p.prefixo}
          favoritadoInicial={favoritos.has(p.prefixo)}
          autenticado={autenticado}
        />
      ),
    },
  ];

  return (
    <section
      aria-label={`Resultados da busca: ${total} posto(s) encontrado(s)`}
      className="space-y-2"
    >
      <p className="text-xs text-app-fg-muted" aria-live="polite">
        <span className="tabular font-medium text-app-fg">
          {total.toLocaleString('pt-BR')}
        </span>{' '}
        {total === 1 ? 'posto' : 'postos'}
        {termo ? (
          <>
            {' '}para{' '}
            <span className="font-medium text-app-fg">&ldquo;{termo}&rdquo;</span>
          </>
        ) : null}
      </p>
      <Tabela
        legenda={`Postos hidrológicos encontrados (${total})`}
        colunas={colunas}
        itens={itens}
        chaveItem={(p) => p.id}
        hrefLinha={(p) => `/postos/${encodeURIComponent(p.prefixo)}`}
        densidade="compact"
        vazio={
          <EstadoVazio
            titulo="Nenhum posto encontrado"
            descricao={
              termo
                ? `Nenhum resultado para "${termo}". Revise o termo ou tente pelo prefixo.`
                : 'Nenhum posto corresponde aos filtros aplicados. Ajuste os filtros ou limpe-os para ver todos os resultados.'
            }
          />
        }
      />
    </section>
  );
}
