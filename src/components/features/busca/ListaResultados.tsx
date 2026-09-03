import type { Posto } from '@/domain/posto';
import { formatarValor } from '@/lib/format';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { Paginador } from '@/components/ui/Paginador';
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
  /** Página atual (1-indexed). Se ausente, paginador não aparece. */
  pagina?: number;
  /** Itens por página (mesma constante usada no use case `buscarPostos`). */
  porPagina?: number;
  /**
   * Constrói URL pra cada página preservando filtros atuais. Recebe número
   * da página, retorna o link absoluto. Quando ausente, paginador some.
   */
  hrefPagina?: (pagina: number) => string;
}

export function ListaResultados({
  itens,
  total,
  termo,
  prefixosFavoritos,
  autenticado = false,
  pagina,
  porPagina,
  hrefPagina,
}: ListaResultadosProps) {
  const favoritos = prefixosFavoritos ?? new Set<string>();

  const colunas: ColunaTabela<Posto>[] = [
    {
      chave: 'prefixo',
      cabecalho: 'Prefixo',
      // 14ch acomoda os prefixos mais longos do cadastro (ex.: "4C-509Z",
      // "4D-006M") com folga — sem o aumento, fonte monospace + bold quebra
      // o texto em duas linhas. `whitespace-nowrap` é defensivo caso largura
      // venha a apertar de novo no futuro.
      largura: '14ch',
      render: (p) => (
        <span className="mono whitespace-nowrap font-semibold text-gov-azul">
          {p.prefixo}
        </span>
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
    // A coluna era "Cadastro", com três pílulas de sigla (FD / FI / TEL).
    // Duas saíram: `fichaDescritiva` e `fichaInspecao` não existem no cadastro
    // do órgão e renderizariam "não" em todas as linhas, o que numa tabela é
    // lido como fato sobre o posto, e não como ausência de dado.
    //
    // `telemetrico` ficou, porque tem dado real (149 postos). Com um indicador
    // só, a sigla perdeu a razão de existir: ela comprimia três rótulos num
    // espaço apertado, e agora o cabeçalho já diz "Telemetria" por extenso,
    // então "TEL" na célula seria a mesma palavra duas vezes. A célula passa a
    // responder a pergunta que o cabeçalho faz: "Sim" ou travessão.
    //
    // Só o SIM ganha peso visual. O atributo aparece em 2,6% da base, e pílula
    // cinza nas outras 97,4% seria ruído em cima da linha inteira; o travessão
    // mantém a coluna legível e faz o punhado de postos telemétricos saltar.
    // A ausência continua anunciada por leitor de tela, porque célula muda é
    // ambígua para quem não vê o padrão da coluna.
    {
      chave: 'telemetria',
      cabecalho: 'Telemetria',
      largura: '12ch',
      render: (p) =>
        (p.telemetrico ?? '').trim().length > 0 ? (
          <span
            title="Telemetria — sim"
            className="inline-flex h-5 items-center justify-center rounded border border-gov-azul/30 bg-gov-azul-claro px-2 text-2xs font-semibold text-gov-azul"
          >
            Sim
          </span>
        ) : (
          <>
            <span aria-hidden="true" className="text-app-fg-subtle">
              —
            </span>
            <span className="sr-only">Telemetria — não</span>
          </>
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

      {pagina !== undefined && porPagina !== undefined && hrefPagina ? (
        <Paginador
          pagina={pagina}
          porPagina={porPagina}
          total={total}
          hrefPagina={hrefPagina}
          rotuloAria="Paginação dos resultados de postos"
        />
      ) : null}
    </section>
  );
}
