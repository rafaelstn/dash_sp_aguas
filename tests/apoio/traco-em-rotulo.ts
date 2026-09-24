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
 *
 * Em 23/09/2026 o extrator ganhou a segunda fonte, e por um motivo concreto: o
 * formulário de posto deixou de escrever `label="Nome da estação"` e passou a
 * derivar o rótulo de `ROTULOS_CAMPO_POSTO` (`src/lib/rotulos-posto.ts`), para
 * o histórico de alterações não ter uma segunda lista dos mesmos nomes. Se a
 * régua continuasse olhando só o JSX, ela aprovaria aquele arquivo por não ter
 * mais nada para ler, e os trinta rótulos sairiam do alcance dela caladamente.
 * Régua que perde o alvo quando o produto muda de lugar não protege nada.
 *
 * A segunda fonte é o vocabulário que o projeto já usa, e não uma lista à mão:
 * constante cujo nome começa por `ROTULO`, medida no dia em 29 arquivos de
 * `src/`. Entram os valores de texto fixo do objeto, e também o literal solto
 * (`ROTULO_ORIGEM_DBFCH = 'Dbfch'`).
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

/** Constante que guarda rótulo de tela, pela convenção de nome do projeto. */
const NOME_DE_MAPA_DE_ROTULO = /^ROTULO/;

/**
 * Tira `as const`, `satisfies` e parênteses de cima do valor.
 *
 * `ROTULOS_CAMPO_POSTO` é declarado como `{...} as const satisfies
 * Record<string, string>`, e sem desembrulhar isso o objeto não é alcançado: a
 * régua aprovaria trinta rótulos que nunca leu.
 */
function desembrulhar(no: ts.Expression): ts.Expression {
  let atual = no;
  while (
    ts.isAsExpression(atual) ||
    ts.isSatisfiesExpression(atual) ||
    ts.isParenthesizedExpression(atual)
  ) {
    atual = atual.expression;
  }
  return atual;
}

/** Percorre a árvore entregando cada rótulo de texto fixo que virá em tela. */
function paraCadaRotulo(
  codigo: string,
  arquivo: string,
  visitar: (atributo: string, texto: string, linha: number) => void,
): void {
  /*
    O dialeto sai da EXTENSÃO, e não fixo em TSX. Parsear um `.ts` como TSX faz
    o TypeScript ler `<T>(x) => x` como abertura de elemento, e aí o arquivo que
    guarda os rótulos entra na varredura só de nome: a árvore sai errada e o
    extrator não acha nada, que é o pior resultado possível numa régua.
  */
  const fonte = ts.createSourceFile(
    arquivo,
    codigo,
    ts.ScriptTarget.Latest,
    true,
    arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const naLinha = (no: ts.Node): number =>
    fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1;

  const andar = (no: ts.Node): void => {
    if (ts.isJsxAttribute(no)) {
      const nome = no.name.getText(fonte);
      const texto = ATRIBUTOS_DE_ROTULO.test(nome) ? textoDe(no.initializer) : null;
      if (texto !== null) visitar(nome, texto, naLinha(no));
    }
    if (
      ts.isVariableDeclaration(no) &&
      ts.isIdentifier(no.name) &&
      NOME_DE_MAPA_DE_ROTULO.test(no.name.text) &&
      no.initializer
    ) {
      const constante = no.name.text;
      const valor = desembrulhar(no.initializer);
      if (ts.isStringLiteral(valor) || ts.isNoSubstitutionTemplateLiteral(valor)) {
        visitar(constante, valor.text, naLinha(no));
      } else if (ts.isObjectLiteralExpression(valor)) {
        for (const prop of valor.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const dentro = desembrulhar(prop.initializer);
          if (!ts.isStringLiteral(dentro) && !ts.isNoSubstitutionTemplateLiteral(dentro)) {
            continue;
          }
          visitar(`${constante}.${prop.name.getText(fonte)}`, dentro.text, naLinha(prop));
        }
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
