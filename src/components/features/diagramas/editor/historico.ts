/**
 * Histórico de desfazer/refazer (undo/redo) do editor de diagramas.
 *
 * Helper PURO: opera sobre um estado imutável formado por duas pilhas (passado
 * e futuro) e o estado atual (o array de elementos). Sem React e sem I/O, para
 * ser testável em isolamento. O editor client mantém este `Historico<T>` num
 * `useRef`/estado e chama as funções abaixo.
 *
 * Modelo:
 *   - `presente`: o estado atual.
 *   - `passado`: estados anteriores (topo = mais recente). `desfazer` move o
 *     presente para o futuro e puxa o topo do passado para presente.
 *   - `futuro`: estados desfeitos, disponíveis para `refazer`.
 *
 * `empilhar` registra um novo estado significativo: empurra o presente atual
 * para o passado, define o novo presente e LIMPA o futuro (um novo caminho
 * invalida o redo, comportamento padrão de editores).
 *
 * O limite `MAX` evita que o passado cresça sem fim em sessões longas; ao
 * estourar, descarta o estado mais antigo.
 */

const MAX = 100;

/** Estado imutável do histórico para um valor do tipo `T`. */
export interface Historico<T> {
  readonly passado: ReadonlyArray<T>;
  readonly presente: T;
  readonly futuro: ReadonlyArray<T>;
}

/** Cria um histórico inicial com o estado dado e pilhas vazias. */
export function criarHistorico<T>(inicial: T): Historico<T> {
  return { passado: [], presente: inicial, futuro: [] };
}

/**
 * Registra um novo estado. Se for igual ao presente (mesma referência), não
 * empilha — evita ruído de ações que não mudaram nada.
 */
export function empilhar<T>(historico: Historico<T>, proximo: T): Historico<T> {
  if (proximo === historico.presente) return historico;
  const passado = [...historico.passado, historico.presente];
  if (passado.length > MAX) passado.shift();
  return { passado, presente: proximo, futuro: [] };
}

/** Há estado anterior para desfazer? */
export function podeDesfazer<T>(historico: Historico<T>): boolean {
  return historico.passado.length > 0;
}

/** Há estado desfeito para refazer? */
export function podeRefazer<T>(historico: Historico<T>): boolean {
  return historico.futuro.length > 0;
}

/**
 * Desfaz: o presente vai para o topo do futuro e o topo do passado vira
 * presente. Sem passado, devolve o histórico inalterado.
 */
export function desfazer<T>(historico: Historico<T>): Historico<T> {
  if (!podeDesfazer(historico)) return historico;
  const passado = historico.passado.slice(0, -1);
  const presente = historico.passado[historico.passado.length - 1]!;
  const futuro = [historico.presente, ...historico.futuro];
  return { passado, presente, futuro };
}

/**
 * Refaz: o topo do futuro vira presente e o presente atual volta ao passado.
 * Sem futuro, devolve o histórico inalterado.
 */
export function refazer<T>(historico: Historico<T>): Historico<T> {
  if (!podeRefazer(historico)) return historico;
  const presente = historico.futuro[0]!;
  const futuro = historico.futuro.slice(1);
  const passado = [...historico.passado, historico.presente];
  return { passado, presente, futuro };
}
