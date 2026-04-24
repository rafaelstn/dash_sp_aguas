import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

export type Densidade = 'compact' | 'normal';

export interface ColunaTabela<T> {
  chave: string;
  cabecalho: ReactNode;
  render: (item: T, indice: number) => ReactNode;
  largura?: string;
  ordenavel?: boolean;
  alinhar?: 'left' | 'right' | 'center';
  classeCelula?: string;
  classeCabecalho?: string;
  /**
   * Marca a célula como interativa (contém botão, menu, link secundário).
   * Quando a tabela usa `hrefLinha`, a linha inteira vira clicável via
   * stretched link — células interativas precisam ficar acima do overlay
   * pra não serem "engolidas" pelo clique da linha. Sem isto, clicar no
   * botão de favoritar, por exemplo, dispararia a navegação em vez da ação.
   */
  interativa?: boolean;
}

export interface TabelaProps<T> {
  /** Legenda acessível — obrigatório pra WCAG. */
  legenda: string;
  colunas: readonly ColunaTabela<T>[];
  itens: readonly T[];
  chaveItem: (item: T) => string;
  /** Link opcional na primeira célula de cada linha. */
  hrefLinha?: (item: T) => string;
  densidade?: Densidade;
  zebra?: boolean;
  vazio?: ReactNode;
  ordenacao?: { chave: string; direcao: 'asc' | 'desc' };
  urlOrdenacao?: (chave: string, direcaoAtual: 'asc' | 'desc' | null) => string;
}

const alturaLinha: Record<Densidade, string> = {
  compact: 'h-8',
  normal: 'h-10',
};

const paddingCelula: Record<Densidade, string> = {
  compact: 'px-3 py-1.5',
  normal: 'px-3 py-2',
};

export function Tabela<T>({
  legenda,
  colunas,
  itens,
  chaveItem,
  hrefLinha,
  densidade = 'compact',
  zebra = true,
  vazio,
  ordenacao,
  urlOrdenacao,
}: TabelaProps<T>) {
  if (itens.length === 0 && vazio) {
    return <>{vazio}</>;
  }

  return (
    <div className="overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface">
      <table className="w-full border-collapse text-sm tabular">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="sticky top-0 z-10 bg-app-surface-2 shadow-gov-sticky">
            {colunas.map((col) => {
              const ativa = ordenacao?.chave === col.chave;
              const direcao = ativa ? ordenacao?.direcao : null;

              return (
                <th
                  key={col.chave}
                  scope="col"
                  style={col.largura ? { width: col.largura } : undefined}
                  className={[
                    'border-b border-app-border-subtle text-left text-xs font-semibold uppercase tracking-wide text-app-fg-muted',
                    paddingCelula[densidade],
                    col.alinhar === 'right'
                      ? 'text-right'
                      : col.alinhar === 'center'
                        ? 'text-center'
                        : '',
                    col.classeCabecalho ?? '',
                  ].join(' ')}
                  aria-sort={
                    ativa ? (direcao === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {col.ordenavel && urlOrdenacao ? (
                    <Link
                      href={urlOrdenacao(col.chave, direcao ?? null)}
                      scroll={false}
                      className="inline-flex items-center gap-1 rounded-sm hover:text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
                    >
                      <span>{col.cabecalho}</span>
                      <IconeOrdenacao direcao={direcao} />
                    </Link>
                  ) : (
                    <span>{col.cabecalho}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {itens.map((item, i) => {
            const linhaClasse = [
              alturaLinha[densidade],
              zebra ? 'even:bg-app-surface-2/40' : '',
              'border-b border-app-border-subtle last:border-0',
              'hover:bg-app-surface-2',
              'focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-gov-azul',
              'transition-colors motion-safe:duration-100',
              // Ancoragem do stretched link (padrão Bootstrap): o ::before do
              // Link na primeira célula é position:absolute e se expande até
              // os limites deste <tr>. Resultado: clicar em qualquer parte da
              // linha navega, com um único <a> no DOM (semântica preservada).
              hrefLinha ? 'relative cursor-pointer' : '',
            ].join(' ');

            return (
              <tr key={chaveItem(item)} className={linhaClasse}>
                {colunas.map((col, ci) => {
                  const primeira = ci === 0;
                  const conteudo = col.render(item, i);

                  return (
                    <td
                      key={col.chave}
                      className={[
                        paddingCelula[densidade],
                        'align-middle',
                        // Células interativas sobem acima do overlay do Link.
                        col.interativa ? 'relative z-10' : '',
                        col.alinhar === 'right'
                          ? 'text-right'
                          : col.alinhar === 'center'
                            ? 'text-center'
                            : '',
                        col.classeCelula ?? '',
                      ].join(' ')}
                    >
                      {primeira && hrefLinha ? (
                        <Link
                          href={hrefLinha(item)}
                          // -my/-mx recuperam o padding da célula pra área de
                          // clique cobrir a primeira coluna inteira.
                          // before:absolute inset-0 é o stretched link: estica
                          // a área de clique até os limites do <tr relative>.
                          className="-my-1.5 -mx-3 block px-3 py-1.5 focus-visible:outline-none before:absolute before:inset-0 before:content-['']"
                        >
                          {conteudo}
                        </Link>
                      ) : (
                        conteudo
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IconeOrdenacao({ direcao }: { direcao: 'asc' | 'desc' | null | undefined }) {
  const cls = 'h-3 w-3';
  if (direcao === 'asc') return <ArrowUp className={cls} aria-hidden="true" />;
  if (direcao === 'desc') return <ArrowDown className={cls} aria-hidden="true" />;
  return <ArrowUpDown className={`${cls} opacity-40`} aria-hidden="true" />;
}
