/**
 * Setup do projeto `componentes` do Vitest: roda só nos arquivos `.test.tsx`,
 * depois do `tests/setup.ts`.
 *
 * O jsdom não é um navegador: ele não tem layout, não tem media query de
 * verdade e não implementa observadores. Os componentes desta tela usam as três
 * coisas, então sem os dublês abaixo o teste quebra na montagem e o defeito de
 * acessibilidade que ele deveria medir nunca chega a ser avaliado.
 *
 * Cada dublê é o MÍNIMO para o componente montar, e nenhum deles finge medir:
 * quem depender de largura real ou de interseção real precisa de navegador, e
 * essa prova é a do Playwright, que não existe neste projeto.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/** Lista de consultas que `matchMedia` deve responder como verdadeiras. */
let consultasVerdadeiras: string[] = [];

/** As listas entregues nesta execução, para avisá-las quando a largura mudar. */
const listasVivas = new Set<ListaDeMidia>();

/**
 * `MediaQueryList` do dublê.
 *
 * O `matches` é lido na hora, e não congelado na criação: quem guarda a lista
 * numa variável (é o que um `useEffect` faz) tem de ver a largura atual.
 *
 * O dublê antigo tinha `addEventListener` vazio. Isso não é neutro: componente
 * que reage a GIRO DE APARELHO ficava indistinguível de componente que mede a
 * largura uma vez na montagem, e o teste dos dois passava. Era exatamente o
 * defeito do achado 1 do QA de 22/09/2026 escondido dentro do instrumento.
 */
class ListaDeMidia extends EventTarget {
  onchange: ((evento: MediaQueryListEvent) => void) | null = null;

  constructor(readonly media: string) {
    super();
    listasVivas.add(this);
  }

  get matches(): boolean {
    return consultasVerdadeiras.includes(this.media);
  }

  /** Formas antigas da API, que o Safari só aposentou na versão 14. */
  addListener(ouvinte: (evento: MediaQueryListEvent) => void): void {
    this.addEventListener('change', ouvinte as EventListener);
  }

  removeListener(ouvinte: (evento: MediaQueryListEvent) => void): void {
    this.removeEventListener('change', ouvinte as EventListener);
  }

  /** Avisa quem ouve, como o navegador faz ao girar o aparelho. */
  notificar(): void {
    const evento = Object.assign(new Event('change'), {
      matches: this.matches,
      media: this.media,
    }) as unknown as MediaQueryListEvent;
    this.onchange?.(evento);
    this.dispatchEvent(evento);
  }
}

/**
 * Liga o `matchMedia` do jsdom para as consultas informadas.
 *
 * Use no teste que precisa do caminho de tela estreita, por exemplo
 * `definirMediaQueries(['(max-width: 767px)'])`. O estado volta ao padrão
 * (tudo falso) no `afterEach`, então nenhum teste herda a largura do vizinho.
 *
 * Chamada DEPOIS da montagem, ela também avisa quem estiver ouvindo, que é o
 * giro do aparelho. Como isso muda estado de componente, o teste chama dentro
 * de `act(...)`.
 */
export function definirMediaQueries(consultas: string[]): void {
  consultasVerdadeiras = consultas;
  for (const lista of listasVivas) lista.notificar();
}

function instalarMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (consulta: string): MediaQueryList =>
      new ListaDeMidia(consulta) as unknown as MediaQueryList,
  });
}

class ObservadorSilencioso {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

instalarMatchMedia();

// `Object.defineProperty` e não `vi.stubGlobal`, de propósito: o que entra por
// `stubGlobal` sai no primeiro `vi.unstubAllGlobals()` de qualquer arquivo, e o
// arquivo que dublasse o `fetch` derrubaria junto os dois observadores. Sem
// eles, o `next/link` quebra na montagem com "IntersectionObserver is not
// defined", num erro que não tem relação nenhuma com o que aquele teste mede.
// Medido em 22/09/2026, no teste da TelaPostos.
Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ObservadorSilencioso,
});
Object.defineProperty(globalThis, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: ObservadorSilencioso,
});

// O jsdom declara `scrollTo` mas joga "Not implemented" ao ser chamado, e o
// ruído esconde a saída do teste.
Object.defineProperty(window, 'scrollTo', { writable: true, value: () => {} });
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  writable: true,
  value: () => {},
});

afterEach(() => {
  // `globals: false` desliga o cleanup automático do Testing Library, que
  // depende do `afterEach` global. Sem esta linha, o segundo teste do arquivo
  // acha dois elementos com o mesmo nome acessível e reprova por engano.
  cleanup();
  consultasVerdadeiras = [];
  // As listas do teste que acabou não recebem o aviso do próximo: ouvinte de
  // componente já desmontado reagindo a uma largura alheia é ruído que só
  // aparece dias depois, num arquivo que não tem relação nenhuma.
  listasVivas.clear();
});
