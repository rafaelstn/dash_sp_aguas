/**
 * Acha traço usado como separador em rótulo de controle.
 *
 * O padrão da casa proíbe travessão, meia-risca e hífen solto como conector ou
 * separador: o lugar do separador é a vírgula, o dois-pontos ou o parêntese.
 * O defeito real, achado em 23/09/2026 no formulário de edição de posto
 * (`src/components/features/postos/FormularioEditarPosto.tsx`), eram doze
 * rótulos no formato "Escala — início", que o próprio projeto já escrevia como
 * "Escala (início)" nos schemas de ficha.
 *
 * A varredura é por AST e não por substring por dois motivos medidos no
 * repositório: travessão aparece em 221 dos 545 arquivos de `src/`, quase
 * sempre em comentário ou como marcador de valor vazio, e uma busca textual
 * colheria os dois como se fossem rótulo. Lendo o JSX, só entram os atributos
 * que viram texto de tela, e o template literal não vira porta dos fundos.
 */
import ts from 'typescript';

/** Atributo cujo valor é lido pelo usuário como rótulo curto de um controle. */
const ATRIBUTOS_DE_ROTULO =
  /^(label|titulo|rotulo|legenda|placeholder|title|aria-label)$/;

/** Travessão, meia-risca e hífen cercado de espaço. */
const TRACO_SEPARADOR = /—|–|(?<= )-(?= )/;

/**
 * Nome do produto, que carrega hífen por ser nome próprio e não separador.
 *
 * "SP Águas - DMO" é como o órgão escreve o sistema, e aparece no título de
 * toda página e em dois `aria-label` de navegação. Sai do texto antes do
 * julgamento em vez de virar exceção por arquivo, que envelheceria.
 */
const NOME_DO_PRODUTO = /SP Águas - DMO/g;

/** Marcador de valor ausente: o traço é o conteúdo, não o separador. */
const SO_O_MARCADOR = /^[—–-]$/;

/** Rótulo que usa traço onde o padrão da casa pede pontuação. */
export type TracoEmRotulo = {
  /** Nome do atributo, como aparece no JSX. */
  atributo: string;
  /** Linha do atributo, base 1, para a mensagem da falha. */
  linha: number;
  /** O texto do rótulo inteiro, para quem lê a falha reconhecer a tela. */
  valor: string;
};

/** Junta o que um valor de atributo tem de texto fixo, ou devolve null. */
function textoDe(valor: ts.JsxAttributeValue | undefined): string | null {
  if (!valor) return null;
  if (ts.isStringLiteral(valor)) return valor.text;
  if (!ts.isJsxExpression(valor) || !valor.expression) return null;
  const dentro = valor.expression;
  if (ts.isStringLiteral(dentro) || ts.isNoSubstitutionTemplateLiteral(dentro)) {
    return dentro.text;
  }
  // Template com interpolação: julga só as partes fixas, que é onde o
  // separador é escrito. `${x}` não se sabe, e o que não se sabe não reprova.
  if (ts.isTemplateExpression(dentro)) {
    return (
      dentro.head.text + dentro.templateSpans.map((s) => s.literal.text).join(' ')
    );
  }
  return null;
}

/** Percorre a árvore entregando cada atributo de rótulo com texto fixo. */
function paraCadaRotulo(
  codigo: string,
  arquivo: string,
  visitar: (atributo: string, texto: string, linha: number) => void,
): void {
  const fonte = ts.createSourceFile(
    arquivo,
    codigo,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const andar = (no: ts.Node): void => {
    if (ts.isJsxAttribute(no)) {
      const nome = no.name.getText(fonte);
      const texto = ATRIBUTOS_DE_ROTULO.test(nome) ? textoDe(no.initializer) : null;
      if (texto !== null) {
        const { line } = fonte.getLineAndCharacterOfPosition(no.getStart(fonte));
        visitar(nome, texto, line + 1);
      }
    }
    ts.forEachChild(no, andar);
  };
  andar(fonte);
}

/**
 * Quantos rótulos com texto fixo o extrator enxergou.
 *
 * Âncora de presença: aprovação sobre zero rótulo lido é cegueira do parser,
 * não conformidade da tela.
 */
export function rotulosLidos(codigo: string, arquivo: string): number {
  let lidos = 0;
  paraCadaRotulo(codigo, arquivo, () => {
    lidos += 1;
  });
  return lidos;
}

/** Os rótulos que usam traço como separador. */
export function tracosEmRotulo(codigo: string, arquivo: string): TracoEmRotulo[] {
  const achados: TracoEmRotulo[] = [];
  paraCadaRotulo(codigo, arquivo, (atributo, texto, linha) => {
    if (SO_O_MARCADOR.test(texto.trim())) return;
    if (!TRACO_SEPARADOR.test(texto.replace(NOME_DO_PRODUTO, ''))) return;
    achados.push({ atributo, linha, valor: texto });
  });
  return achados;
}
