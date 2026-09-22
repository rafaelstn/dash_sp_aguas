/**
 * Montagem de tela do App Router dentro do jsdom.
 *
 * Toda tela desta aplicação lê o recorte da URL por `useSearchParams()`, e fora
 * do servidor do Next esse hook devolve `null`: a tela quebra em `lerEstado`
 * antes de renderizar qualquer coisa, num erro que não tem relação com o que o
 * teste queria medir.
 *
 * O contexto real do Next resolve, e ele vem de um caminho INTERNO
 * (`next/dist/...`), que pode mudar de lugar em qualquer atualização. Por isso o
 * import mora aqui e só aqui: quando o Next mexer, quebra um arquivo, não N.
 * Mock do módulo `next/navigation` seria a alternativa, e é pior: passaria a
 * medir o dublê em vez do hook que a aplicação usa.
 */
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { ReactElement, ReactNode } from 'react';

/**
 * Renderiza com a query informada, no formato da barra de endereços.
 *
 * `renderizarComUrl(<TelaPostos />, 'uf=SP&ugrhi=7')`
 */
export function renderizarComUrl(
  no: ReactElement,
  query = '',
  opcoes?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  const parametros = new URLSearchParams(query);
  const Moldura = ({ children }: { children: ReactNode }) => (
    <SearchParamsContext.Provider value={parametros}>{children}</SearchParamsContext.Provider>
  );
  return render(no, { ...opcoes, wrapper: Moldura });
}
