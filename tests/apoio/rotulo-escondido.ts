/**
 * Acha controle que esconde o próprio rótulo num breakpoint e fica sem nome.
 *
 * O defeito que este aparelho procura não é visível no jsdom: `hidden sm:inline`
 * é classe do Tailwind, e num teste de renderização o CSS não está aplicado, de
 * modo que o texto continua no DOM e o axe aprova. Só a leitura do JSX denuncia.
 *
 * A varredura é por AST e não por substring: `className` montado por template
 * literal, por `clsx` ou por variável tem porta dos fundos numa busca textual,
 * e é justamente onde a classe se esconde. A busca textual também colheria a
 * classe citada dentro de comentário, que não é marcação nenhuma.
 */
import ts from 'typescript';

/** Elemento que esconde o rótulo sem oferecer nome acessível em troca. */
export type RotuloSemNome = {
  /** Nome da tag do elemento interativo, como aparece no JSX. */
  tag: string;
  /** Linha do elemento interativo, base 1, para a mensagem da falha. */
  linha: number;
  /** A classe que esconde o rótulo, por exemplo `hidden sm:inline`. */
  classeQueEsconde: string;
  /** O breakpoint em que o rótulo desaparece, por exemplo `sm`. */
  breakpoint: string;
};

/**
 * Tags que recebem nome acessível e por isso precisam de rótulo.
 *
 * Componente da casa entra pela convenção de nome (`Botao...`, `...Button`,
 * `Link`), porque quem escreve `<BotaoAcao>` espera um botão no fim.
 */
const INTERATIVAS = /^(button|a|summary|Link|.*Botao.*|.*Button.*|.*Link)$/;

/** `hidden sm:inline`, `hidden md:block`, `hidden lg:flex` e parentes. */
const ESCONDE =
  /\bhidden\b[^"'`]*?\b(sm|md|lg|xl|2xl):(inline|inline-block|inline-flex|block|flex|grid)\b/;

/** A contraparte correta: o mesmo texto, só para leitor de tela, no mesmo bp. */
function contraparteDe(breakpoint: string): RegExp {
  return new RegExp(`\\bsr-only\\b[^"'\`]*?\\b${breakpoint}:hidden\\b`);
}

/** Atributos que dão nome acessível ao próprio elemento interativo. */
const ATRIBUTOS_QUE_NOMEIAM = new Set(['aria-label', 'aria-labelledby', 'title']);

function abreDe(no: ts.Node): ts.JsxOpeningLikeElement | undefined {
  if (ts.isJsxElement(no)) return no.openingElement;
  if (ts.isJsxSelfClosingElement(no)) return no;
  return undefined;
}

function tagDe(abre: ts.JsxOpeningLikeElement): string {
  return abre.tagName.getText(abre.getSourceFile());
}

function nomeDoAtributo(atributo: ts.JsxAttributeLike): string {
  return ts.isJsxAttribute(atributo) && ts.isIdentifier(atributo.name)
    ? atributo.name.text
    : '';
}

/**
 * Junta todo texto literal que um atributo `className` pode produzir.
 *
 * Pega string simples, template literal e os argumentos literais de qualquer
 * chamada (`clsx`, `cn`, `twMerge`), que é como a casa monta classe condicional.
 * O que não for literal fica de fora de propósito: classe que só existe em
 * tempo de execução não pode ser julgada aqui.
 */
function classesLiteraisDe(atributo: ts.JsxAttribute): string {
  const partes: string[] = [];

  const colher = (no: ts.Node): void => {
    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) {
      partes.push(no.text);
    } else if (ts.isTemplateExpression(no)) {
      partes.push(no.head.text);
      for (const span of no.templateSpans) partes.push(span.literal.text);
    }
    ts.forEachChild(no, colher);
  };

  if (atributo.initializer) colher(atributo.initializer);
  return partes.join(' ');
}

/**
 * Todas as listas de classe declaradas dentro de um elemento, ele incluído.
 *
 * Devolve uma entrada por atributo `className`, sem juntar tudo num texto só:
 * `hidden` de um span com `sm:hidden` de outro não formam a contraparte, e
 * juntar esconderia o defeito.
 */
function classesDentroDe(no: ts.Node): string[] {
  const listas: string[] = [];

  const varrer = (dentro: ts.Node): void => {
    for (const atributo of abreDe(dentro)?.attributes.properties ?? []) {
      if (nomeDoAtributo(atributo) !== 'className') continue;
      if (!ts.isJsxAttribute(atributo)) continue;
      listas.push(classesLiteraisDe(atributo));
    }
    ts.forEachChild(dentro, varrer);
  };

  varrer(no);
  return listas;
}

/** O elemento tem `aria-label`, `aria-labelledby` ou `title` preenchido. */
function temNomePorAtributo(abre: ts.JsxOpeningLikeElement): boolean {
  return abre.attributes.properties.some((atributo) => {
    if (!ATRIBUTOS_QUE_NOMEIAM.has(nomeDoAtributo(atributo))) return false;
    // `aria-label` sem valor não nomeia nada: exige inicializador.
    return ts.isJsxAttribute(atributo) && atributo.initializer !== undefined;
  });
}

function parsear(codigo: string, arquivo: string): ts.SourceFile {
  return ts.createSourceFile(
    arquivo,
    codigo,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

/** Percorre a árvore chamando `visitar` em todo elemento JSX interativo. */
function paraCadaInterativo(
  fonte: ts.SourceFile,
  visitar: (no: ts.Node, abre: ts.JsxOpeningLikeElement) => void,
): void {
  const andar = (no: ts.Node): void => {
    const abre = abreDe(no);
    if (abre && INTERATIVAS.test(tagDe(abre))) visitar(no, abre);
    ts.forEachChild(no, andar);
  };
  andar(fonte);
}

/** O breakpoint em que o rótulo deste controle desaparece, se desaparecer. */
function esconderijoDe(
  classes: readonly string[],
): { classe: string; breakpoint: string } | undefined {
  for (const lista of classes) {
    const casou = ESCONDE.exec(lista);
    if (casou?.[1]) return { classe: casou[0], breakpoint: casou[1] };
  }
  return undefined;
}

/**
 * Varre um arquivo TSX e devolve os controles que perdem o nome num breakpoint.
 *
 * Um controle entra na lista quando, entre seus descendentes, existe classe que
 * esconde texto a partir de um breakpoint e NÃO existe nem a contraparte
 * `sr-only <bp>:hidden` nem atributo que nomeie o controle.
 */
export function rotulosSemNome(codigo: string, arquivo: string): RotuloSemNome[] {
  const fonte = parsear(codigo, arquivo);
  const achados: RotuloSemNome[] = [];

  paraCadaInterativo(fonte, (no, abre) => {
    const classes = classesDentroDe(no);
    const esconde = esconderijoDe(classes);
    if (!esconde) return;
    const contraparte = contraparteDe(esconde.breakpoint);
    if (classes.some((lista) => contraparte.test(lista))) return;
    if (temNomePorAtributo(abre)) return;

    achados.push({
      tag: tagDe(abre),
      linha: fonte.getLineAndCharacterOfPosition(abre.getStart(fonte)).line + 1,
      classeQueEsconde: esconde.classe,
      breakpoint: esconde.breakpoint,
    });
  });

  return achados;
}

/**
 * Conta os controles que escondem rótulo, com ou sem defeito.
 *
 * É o piso da varredura: se este número vier zero num `src/` que tem o padrão,
 * o extrator quebrou e a régua estaria aprovando por cegueira.
 */
export function controlesQueEscondemRotulo(codigo: string, arquivo: string): number {
  const fonte = parsear(codigo, arquivo);
  let total = 0;

  paraCadaInterativo(fonte, (no) => {
    if (esconderijoDe(classesDentroDe(no))) total += 1;
  });

  return total;
}
