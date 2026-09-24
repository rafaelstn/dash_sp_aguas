/**
 * Altura de alvo de toque que um controle DECLARA nas suas classes, e a
 * varredura que acha todo controle interativo de `src/` para julgar.
 *
 * Por que não se mede renderizando: no jsdom não há layout, e o CSS do Tailwind
 * não é aplicado, de modo que `getBoundingClientRect()` devolve zero para tudo e
 * a regra `target-size` do axe está desligada de propósito em
 * `tests/apoio/acessibilidade.ts`. O único lugar onde a altura do alvo existe,
 * sem navegador, é a classe que o controle carrega.
 *
 * Então a leitura é da classe, mas a asserção é sobre o VALOR em pixels, e não
 * sobre a presença de um texto: `min-h-5` continua declarando altura e continua
 * reprovando, porque 20 px é menos que o mínimo.
 *
 * Em 23/09/2026 este apoio ganhou duas coisas, porque a régua deixou de julgar
 * três controles escritos à mão e passou a varrer `src/` inteiro:
 *
 *   1. A altura que vem do PREENCHIMENTO vertical mais a entrelinha. Antes ela
 *      ficava de fora, e um controle como `px-3 py-2 text-sm` (34 px de caixa
 *      real) devolvia "não declarou". Numa lista de três controles isso não
 *      aparecia; varrendo o app inteiro, ela reprovaria dezenas de controles
 *      legítimos e a única forma de calar a régua seria inflar tela, que é pior
 *      que a régua reprovando. A tabela de entrelinha e de corpo de fonte sai do
 *      `tailwind.config.ts` deste projeto, e não de um padrão genérico.
 *   2. O extrator de controles interativos por AST, com o recorte da exceção
 *      "alvo em linha de texto" do próprio SC 2.5.8.
 *
 * O que continua fora, de propósito: a LARGURA do alvo. O SC 2.5.8 cobra as duas
 * dimensões, e largura em classe é muito mais frequentemente `w-full`, `flex-1`
 * ou herdada do contêiner, o que é indecidível sem layout. Medir a largura aqui
 * seria medir a propriedade vizinha, e a prova dela é visual (`docs/qa/qa-visual.md`).
 */
import ts from 'typescript';

/** Mínimo de alvo de toque em pixels, WCAG 2.2 SC 2.5.8 (nível AA). */
export const MINIMO_ALVO_PX = 24;

/** Um passo da escala de espaçamento do Tailwind vale 4 px (`h-11` = 44 px). */
const PASSO_PX = 4;

/**
 * Espaçamento com nome, acrescentado pelo projeto em `tailwind.config.ts`.
 *
 * `h-header` é altura de verdade, e sem esta tabela o cabeçalho do painel virava
 * "altura indecidível" e reprovava por cegueira da régua, não por defeito de
 * tela. O caso de teste confere a tabela contra o config a cada execução.
 */
export const ESPACO_COM_NOME: Readonly<Record<string, number>> = {
  header: 48,
  sidenav: 224,
};

/**
 * Entrelinha de cada tamanho da escala, em pixels, lida de `tailwind.config.ts`.
 *
 * Copiar número de config em régua é o que envelhece, então o caso de teste
 * `tests/unit/componentes/alvo-de-toque.test.ts` confere esta tabela contra o
 * `tailwind.config.ts` a cada execução: mexer na escala sem mexer aqui reprova.
 */
export const ENTRELINHA_PX: Readonly<Record<string, number>> = {
  '2xs': 16,
  xs: 16,
  sm: 18,
  base: 20,
  md: 24,
  lg: 24,
  xl: 28,
  '2xl': 32,
  display: 32,
};

/** Corpo de cada tamanho da escala, em pixels, para `leading-` relativo. */
export const CORPO_PX: Readonly<Record<string, number>> = {
  '2xs': 11,
  xs: 12,
  sm: 13,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  display: 28,
};

/** Multiplicador das entrelinhas nomeadas do Tailwind. */
const ENTRELINHA_RELATIVA: Readonly<Record<string, number>> = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
};

/**
 * Entrelinha assumida quando o controle não declara tamanho de fonte.
 *
 * O corpo vem por herança, e herança não se lê na classe do elemento. Em vez de
 * chutar o valor do `body` (16 px de fonte com entrelinha 1.5, ou 24 px), a
 * régua assume a MENOR entrelinha que o projeto define, que é 1rem em `2xs` e
 * `xs`. Assumir o menor faz a régua reprovar mais, nunca menos, que a realidade.
 */
const MENOR_ENTRELINHA_PX = 16;

/**
 * Valor de espaçamento que se converte em pixels, inclusive os nomeados do
 * projeto: `11`, `3.5`, `px`, `[44px]`, `[2.75rem]`, `header`, `sidenav`.
 *
 * Montado a partir de `ESPACO_COM_NOME` em vez de escrito à mão duas vezes: uma
 * lista a mais é uma lista a mais para divergir.
 */
const VALOR = `(?:\\[[^\\]\\s]+\\]|[0-9]+(?:\\.[0-9]+)?|px|${Object.keys(ESPACO_COM_NOME).join('|')})`;

/** Prefixo de variante, como `md:`, `hover:`, `sm:hover:`. */
const VARIANTE = '(?:[a-z0-9-]+:)*';

/** `h-11`, `min-h-6`, `md:min-h-9`, `h-3.5`, `min-h-[44px]`, `h-header`. */
const ALTURA = new RegExp(`(?:^|\\s)${VARIANTE}(min-)?h-(${VALOR})(?=\\s|$)`, 'g');

/**
 * Qualquer classe de altura, inclusive a que não se converte em pixels.
 *
 * `ALTURA` só casa com o que é decidível, e por isso `h-full` não casa com nada
 * e é indistinguível de "não declarou altura". Para a varredura essa diferença
 * importa: "não declarou" se julga pelo preenchimento, e `h-full` é altura que
 * existe e vale o que o pai valer, ou seja, indecidível, que reprova para
 * decisão humana em vez de aprovar em silêncio.
 */
const QUALQUER_ALTURA = new RegExp(`(?:^|\\s)${VARIANTE}(min-)?h-([^\\s]+)`, 'g');

/** Só `h-N`, sem `min-`: caixa de altura fixa. */
const SO_ALTURA_FIXA = new RegExp(`(?:^|\\s)${VARIANTE}h-(${VALOR})(?=\\s|$)`, 'g');

/** Só `min-h-N`: piso de altura. */
const SO_ALTURA_MINIMA = new RegExp(`(?:^|\\s)${VARIANTE}min-h-(${VALOR})(?=\\s|$)`, 'g');

/** `py-2`, `pt-1.5`, `p-3`, `sm:py-0.5`, `py-[6px]`. Nunca `px-`, `pl-`, `pr-`. */
const PREENCHIMENTO = new RegExp(`(?:^|\\s)${VARIANTE}(p|py|pt|pb)-(${VALOR})(?=\\s|$)`, 'g');

/** Tamanho de fonte da escala do projeto, como `text-sm` ou `md:text-xs`. */
const TAMANHO_DE_FONTE = new RegExp(
  `(?:^|\\s)${VARIANTE}text-(${Object.keys(ENTRELINHA_PX).join('|')})(?=\\s|$)`,
  'g',
);

/** Entrelinha, como `leading-tight`, `leading-none`, `leading-5`. */
const ENTRELINHA = new RegExp(`(?:^|\\s)${VARIANTE}leading-([A-Za-z0-9.[\\]-]+)(?=\\s|$)`, 'g');

/** Converte o valor de uma classe de altura em pixels, ou `null` se não der. */
function emPixels(valor: string): number | null {
  if (valor === 'px') return 1;
  if (ESPACO_COM_NOME[valor] !== undefined) return ESPACO_COM_NOME[valor] as number;
  if (!valor.startsWith('[')) {
    const passos = Number(valor);
    return Number.isFinite(passos) ? passos * PASSO_PX : null;
  }

  const cru = valor.slice(1, -1);
  const px = /^(-?[0-9]+(?:\.[0-9]+)?)px$/.exec(cru);
  if (px?.[1]) return Number(px[1]);
  const rem = /^(-?[0-9]+(?:\.[0-9]+)?)rem$/.exec(cru);
  if (rem?.[1]) return Number(rem[1]) * 16;
  // `calc(...)`, `100dvh`, `full`, `screen`: não é decidível aqui.
  return null;
}

/** A menor ocorrência decidível de um padrão de classe, em pixels. */
function menorValor(classes: string, padrao: RegExp, grupo: number): number | null {
  let menor: number | null = null;
  for (const casou of ` ${classes} `.matchAll(padrao)) {
    const px = emPixels(casou[grupo] as string);
    if (px === null) continue;
    if (menor === null || px < menor) menor = px;
  }
  return menor;
}

/**
 * A MENOR altura que as classes declaram, em pixels, ou `null` se não declaram.
 *
 * A menor, e não a primeira: `min-h-11 md:min-h-6` é 44 px no celular e 24 px no
 * desktop, e o alvo pequeno demais estaria justamente no breakpoint esquecido.
 * Quem passa a largura de tela no `md:` é quem decide onde cada valor vale; a
 * régua cobra o pior caso, que é o que uma pessoa real encontra em alguma tela.
 */
export function alturaDeToqueDeclarada(classes: string): number | null {
  return menorValor(classes, ALTURA, 2);
}

/** Classes de altura que existem e não se convertem, como `h-full`. */
export function alturasIndecidiveis(classes: string): string[] {
  const achadas: string[] = [];
  for (const casou of ` ${classes} `.matchAll(QUALQUER_ALTURA)) {
    if (emPixels(casou[2] as string) !== null) continue;
    achadas.push(`${casou[1] ?? ''}h-${casou[2] as string}`);
  }
  return achadas;
}

/**
 * Entrelinha em pixels que as classes permitem afirmar, no pior caso.
 *
 * `null` quando um `leading-` relativo aparece sem tamanho de fonte declarado no
 * mesmo elemento: aí a entrelinha depende do corpo herdado, e o que não se sabe
 * não se aprova.
 */
export function entrelinhaEmPixels(classes: string): number | null {
  const cercado = ` ${classes} `;

  let menorCorpo: number | null = null;
  let menorEntrelinhaDaEscala: number | null = null;
  for (const casou of cercado.matchAll(TAMANHO_DE_FONTE)) {
    const nome = casou[1] as string;
    const corpo = CORPO_PX[nome] as number;
    const entrelinha = ENTRELINHA_PX[nome] as number;
    if (menorCorpo === null || corpo < menorCorpo) menorCorpo = corpo;
    if (menorEntrelinhaDaEscala === null || entrelinha < menorEntrelinhaDaEscala) {
      menorEntrelinhaDaEscala = entrelinha;
    }
  }

  let menorDeclarada: number | null = null;
  let indecidivel = false;
  for (const casou of cercado.matchAll(ENTRELINHA)) {
    const valor = casou[1] as string;
    const relativa = ENTRELINHA_RELATIVA[valor];
    let px: number | null;
    if (relativa !== undefined) {
      px = menorCorpo === null ? null : relativa * menorCorpo;
    } else {
      px = emPixels(valor);
    }
    if (px === null) {
      indecidivel = true;
      continue;
    }
    if (menorDeclarada === null || px < menorDeclarada) menorDeclarada = px;
  }

  if (menorDeclarada !== null) return menorDeclarada;
  if (indecidivel) return null;
  return menorEntrelinhaDaEscala ?? MENOR_ENTRELINHA_PX;
}

/**
 * Altura da caixa vinda do preenchimento vertical mais a entrelinha.
 *
 * Preenchimento de cima e de baixo saem do menor valor entre `p-`, `py-` e o
 * lado específico, porque breakpoint que reduz o preenchimento é onde o alvo
 * encolhe. Sem nenhuma classe de preenchimento o valor é zero, e a caixa fica
 * com a altura da linha de texto, que é exatamente o defeito original.
 */
export function alturaPorPreenchimento(classes: string): number | null {
  const entrelinha = entrelinhaEmPixels(classes);
  if (entrelinha === null) return null;

  const cercado = ` ${classes} `;
  let cima: number | null = null;
  let baixo: number | null = null;
  for (const casou of cercado.matchAll(PREENCHIMENTO)) {
    const lado = casou[1] as string;
    const px = emPixels(casou[2] as string);
    if (px === null) continue;
    if (lado === 'p' || lado === 'py' || lado === 'pt') {
      if (cima === null || px < cima) cima = px;
    }
    if (lado === 'p' || lado === 'py' || lado === 'pb') {
      if (baixo === null || px < baixo) baixo = px;
    }
  }
  return (cima ?? 0) + (baixo ?? 0) + entrelinha;
}

/**
 * A altura de alvo que as classes permitem afirmar, ou `null` se indecidível.
 *
 * A ordem segue o que o navegador faz com `box-sizing: border-box`, que é o
 * padrão do preflight do Tailwind:
 *
 *   1. `h-8` fixa a caixa em 32 px, e o preenchimento não a aumenta: vale a fixa.
 *   2. `min-h-11` é piso, então a caixa é o maior entre o piso e o conteúdo.
 *   3. `h-8 min-h-11` é 44 px, porque `min-height` vence `height`.
 *   4. sem nenhuma das duas, a caixa é o preenchimento mais a entrelinha.
 *
 * Classe de altura que existe e não se converte (`h-full`, `h-[calc(...)]`)
 * devolve `null`: a altura vem do pai, e isso não se decide sem layout.
 */
export function alturaDeToqueEfetiva(classes: string): number | null {
  if (alturasIndecidiveis(classes).length > 0) return null;

  const fixa = menorValor(classes, SO_ALTURA_FIXA, 1);
  const minima = menorValor(classes, SO_ALTURA_MINIMA, 1);

  if (fixa !== null) return minima === null ? fixa : Math.max(fixa, minima);

  const preenchimento = alturaPorPreenchimento(classes);
  if (minima === null) return preenchimento;
  if (preenchimento === null) return minima;
  return Math.max(minima, preenchimento);
}

/* ------------------------------------------------------------------------- *
 * Varredura dos controles interativos
 * ------------------------------------------------------------------------- */

/** Tag de controle interativo que a régua julga. */
const TAGS_DE_CONTROLE = /^(button|a|select|summary)$/;

/**
 * `Link` do Next entra junto com `<a>`, e não é exceção de conveniência: ele
 * renderiza uma âncora, e é o controle de navegação que o produto realmente usa
 * (medido em 23/09/2026: 90 ocorrências de `<Link` em `src/`). Deixar de fora
 * seria voltar à lista à mão por outro caminho, com a régua aprovando o app por
 * não ter olhado a navegação.
 */
const TAGS_DE_LINK = /^(a|Link)$/;

/**
 * Classe com que o autor declara uma CAIXA própria para o controle.
 *
 * Divide as duas metades do SC 2.5.8 neste projeto. O critério dispensa o alvo
 * "numa frase, ou cujo tamanho é limitado pela entrelinha do texto que não é
 * alvo", e a justificativa do W3C é a leitura: inflar um link no meio de texto
 * corrido atrapalha a linha, e a entrelinha legível vale mais que o tamanho do
 * alvo. Quem já desenhou uma caixa (`inline-flex`, `block`, preenchimento,
 * largura) não está nesse aperto: dar altura àquela caixa não mexe em texto
 * nenhum, e por isso ela continua tendo que declarar os 24 px.
 */
const DECLARA_CAIXA = new RegExp(
  `(?:^|\\s)${VARIANTE}(?:block|inline-block|flex|inline-flex|grid|inline-grid|table-cell|absolute|fixed|(?:p|px|py|pt|pb|pl|pr)-[^\\s]+|w-[^\\s]+|h-[^\\s]+|min-h-[^\\s]+|size-[^\\s]+)(?=\\s|$)`,
);

/** Tag que corre na linha do texto, e por isso pode CARREGAR o texto vizinho. */
const TAG_EM_LINHA = /^(span|small|strong|em|b|i|code|abbr|time|sup|sub|label)$/;

/** Classe que põe os filhos em fila, um ao lado do outro. */
const EM_FILA = new RegExp(`(?:^|\\s)${VARIANTE}(?:flex|inline-flex)(?=\\s|$)`);

/** Classe que faz o elemento ocupar a linha inteira, empilhando com o vizinho. */
const BLOCO = new RegExp(`(?:^|\\s)${VARIANTE}(?:block|grid|table)(?=\\s|$)`);

/** Classe que empilha os filhos, e portanto tira o irmão da mesma linha. */
const EMPILHA = new RegExp(
  `(?:^|\\s)${VARIANTE}(?:flex-col|grid|space-y-[^\\s]+|divide-y[^\\s]*)(?=\\s|$)`,
);

/** Classe que estica o elemento na altura do pai posicionado. */
const ESTICA_NA_ALTURA_DO_PAI = new RegExp(
  `(?:^|\\s)${VARIANTE}(?:inset-y-0|inset-0)(?=\\s|$)`,
);

/** Classe que tira o elemento do fluxo, e com ela a altura do pai não vale. */
const FORA_DO_FLUXO = new RegExp(`(?:^|\\s)${VARIANTE}(?:absolute|fixed)(?=\\s|$)`);

/** Classe que esconde o elemento de quem vê, mas o mantém para o leitor de tela. */
const INVISIVEL = new RegExp(`(?:^|\\s)${VARIANTE}(?:sr-only|hidden)(?=\\s|$)`);

/** Motivo pelo qual um controle reprovou, ou `null` quando ele passa. */
export type RazaoDeReprova =
  | 'abaixo-do-minimo'
  | 'altura-indecidivel'
  | null;

/** Um controle interativo achado na varredura, já julgado. */
export interface ControleDeToque {
  readonly arquivo: string;
  /** Linha da abertura do elemento, base 1. */
  readonly linha: number;
  /** Tag como está escrita no JSX (`button`, `a`, `Link`, `select`, ...). */
  readonly tag: string;
  /** Texto curto que identifica o controle para quem lê a falha. */
  readonly rotulo: string;
  /** Todo `className` de texto fixo declarado no próprio elemento. */
  readonly classes: string;
  /** Altura afirmável em pixels, ou `null` quando indecidível. */
  readonly alturaPx: number | null;
  /** Se cai na exceção de alvo em linha de texto do SC 2.5.8. */
  readonly emLinhaDeTexto: boolean;
  /** Classes do elemento que envolve o controle, que dizem se ele é item de fila. */
  readonly classesDoPai: string;
  readonly aprovado: boolean;
  readonly razao: RazaoDeReprova;
}

/**
 * Constantes de texto declaradas no arquivo, por nome.
 *
 * Sem isto a varredura de 23/09/2026 reprovava dezenas de controles legítimos:
 * o projeto escreve `className={CLASSE_SELECT}` e `className={classeAcaoPrimaria}`
 * para não repetir a mesma lista de classes em oito lugares, e uma régua que só
 * lê literal dentro do JSX media string vazia e reprovava a altura que estava
 * declarada uma linha acima. Reprovar por cegueira do extrator é o pior
 * resultado possível numa régua: gasta a credibilidade dela e empurra para
 * inflar tela.
 */
function constantesDoArquivo(fonte: ts.SourceFile): Map<string, ts.Expression> {
  const mapa = new Map<string, ts.Expression>();
  const andar = (no: ts.Node): void => {
    if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.initializer) {
      mapa.set(no.name.text, no.initializer);
    }
    /*
      Função de um único `return` entra junto com a constante, porque é assim que
      o projeto escreve o campo de formulário: `className={cls()}`, e `cls()`
      devolve as classes do input (`src/components/features/fichas/FormularioFicha.tsx`).
      Sem isto a régua reprovava um `select` que declara `px-3 py-2 text-sm`, ou
      seja 34 px, e o conserto seria inflar um campo que já está correto.
    */
    if (ts.isFunctionDeclaration(no) && no.name && no.body) {
      const retornos = no.body.statements.filter(ts.isReturnStatement);
      const unico = retornos.length === 1 ? retornos[0]?.expression : undefined;
      if (unico) mapa.set(no.name.text, unico);
    }
    ts.forEachChild(no, andar);
  };
  andar(fonte);
  return mapa;
}

/** De onde cada nome importado vem, para seguir a constante até o outro arquivo. */
function importacoesDoArquivo(fonte: ts.SourceFile): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const declaracao of fonte.statements) {
    if (!ts.isImportDeclaration(declaracao) || !declaracao.importClause) continue;
    if (!ts.isStringLiteral(declaracao.moduleSpecifier)) continue;
    const de = declaracao.moduleSpecifier.text;
    const nomes = declaracao.importClause.namedBindings;
    if (nomes && ts.isNamedImports(nomes)) {
      for (const elemento of nomes.elements) mapa.set(elemento.name.text, de);
    }
  }
  return mapa;
}

/**
 * Abre um módulo importado, para a régua seguir a constante de classe até ele.
 *
 * Quem implementa decide como resolver caminho e alias, porque isso é do projeto
 * e não do critério da WCAG. A régua de `tests/unit/componentes/alvo-de-toque.test.ts`
 * implementa com `node:fs`, e o caso sintético não implementa nada.
 */
export type LeitorDeModulo = (
  especificador: string,
  deArquivo: string,
) => { readonly arquivo: string; readonly codigo: string } | null;

/** Um arquivo já parseado, com o que a resolução de classe precisa dele. */
interface ArquivoLido {
  readonly fonte: ts.SourceFile;
  readonly constantes: Map<string, ts.Expression>;
  readonly importacoes: Map<string, string>;
}

function lerArquivo(codigo: string, arquivo: string): ArquivoLido {
  /*
    O dialeto sai da EXTENSÃO. Parsear um `.ts` como TSX faz o TypeScript ler
    `<T>(x) => x` como abertura de elemento, e o arquivo entra na varredura só
    de nome: a árvore sai errada e nada é achado, que é o pior resultado
    possível numa régua.
  */
  const fonte = ts.createSourceFile(
    arquivo,
    codigo,
    ts.ScriptTarget.Latest,
    true,
    arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return {
    fonte,
    constantes: constantesDoArquivo(fonte),
    importacoes: importacoesDoArquivo(fonte),
  };
}

/**
 * Resolve texto de classe dentro de um arquivo, seguindo constante importada.
 *
 * Sem isto a varredura de 23/09/2026 reprovava dezenas de controles legítimos:
 * o projeto escreve `className={CLASSE_SELECT}` no mesmo arquivo e
 * `className={classeAcaoPrimaria}` importado de `./ListaPostos`, para não
 * repetir a mesma lista de classes em oito lugares. Régua que só lê literal
 * dentro do JSX media string vazia e reprovava a altura que estava declarada
 * uma linha acima, ou um import acima. Reprovar por cegueira do extrator é o
 * pior resultado possível: gasta a credibilidade da régua e empurra para
 * inflar tela.
 */
class Resolvedor {
  private readonly lidos = new Map<string, ArquivoLido>();

  constructor(private readonly leitor: LeitorDeModulo | null) {}

  registrar(arquivo: string, lido: ArquivoLido): void {
    this.lidos.set(arquivo, lido);
  }

  /** O valor de uma constante declarada NO arquivo, para seguir JSX guardado. */
  declaracaoLocal(nome: string, arquivo: string): ts.Expression | null {
    return this.lidos.get(arquivo)?.constantes.get(nome) ?? null;
  }

  /**
   * Junta o texto fixo de um valor de `className`.
   *
   * Ramo de condicional entra JUNTO, e de propósito: `cond ? 'h-11' : 'h-5'`
   * vira `h-11 h-5`, e como a altura é medida pelo MENOR valor, o ramo pequeno
   * reprova. A união com o pior caso é conservadora; escolher um ramo seria
   * sortear.
   */
  texto(no: ts.Node, arquivo: string, visitados: Set<string>): string {
    const partes: string[] = [];
    const colher = (atual: ts.Node): void => {
      if (ts.isStringLiteral(atual) || ts.isNoSubstitutionTemplateLiteral(atual)) {
        partes.push(atual.text);
      } else if (ts.isTemplateExpression(atual)) {
        partes.push(atual.head.text);
        for (const span of atual.templateSpans) partes.push(span.literal.text);
      } else if (ts.isIdentifier(atual)) {
        const chave = `${arquivo}#${atual.text}`;
        if (!visitados.has(chave)) {
          visitados.add(chave);
          partes.push(this.doNome(atual.text, arquivo, visitados));
        }
      }
      ts.forEachChild(atual, colher);
    };
    colher(no);
    return partes.join(' ');
  }

  private doNome(nome: string, arquivo: string, visitados: Set<string>): string {
    const lido = this.lidos.get(arquivo);
    if (!lido) return '';
    const local = lido.constantes.get(nome);
    if (local) return this.texto(local, arquivo, visitados);

    const de = lido.importacoes.get(nome);
    if (!de || !this.leitor) return '';
    const outro = this.leitor(de, arquivo);
    if (!outro) return '';
    if (!this.lidos.has(outro.arquivo)) {
      this.registrar(outro.arquivo, lerArquivo(outro.codigo, outro.arquivo));
    }
    return this.doNome(nome, outro.arquivo, visitados);
  }
}

/** Junta o texto de todo `className` declarado no próprio elemento. */
function classesDoElemento(
  abre: ts.JsxOpeningLikeElement,
  arquivo: string,
  resolvedor: Resolvedor,
): string {
  const partes: string[] = [];
  for (const atributo of abre.attributes.properties) {
    if (!ts.isJsxAttribute(atributo) || !ts.isIdentifier(atributo.name)) continue;
    if (atributo.name.text !== 'className') continue;
    if (atributo.initializer) {
      partes.push(resolvedor.texto(atributo.initializer, arquivo, new Set()));
    }
  }
  return partes.join(' ');
}

/** Valor em pixels de uma medida de CSS em linha: `44`, `'44px'`, `'2.75rem'`. */
function medidaEmPixels(no: ts.Expression): number | null {
  if (ts.isNumericLiteral(no)) return Number(no.text);
  if (!ts.isStringLiteral(no) && !ts.isNoSubstitutionTemplateLiteral(no)) return null;
  const cru = no.text.trim();
  const px = /^(-?[0-9]+(?:\.[0-9]+)?)(px)?$/.exec(cru);
  if (px?.[1]) return Number(px[1]);
  const rem = /^(-?[0-9]+(?:\.[0-9]+)?)rem$/.exec(cru);
  if (rem?.[1]) return Number(rem[1]) * 16;
  return null;
}

/**
 * Altura de alvo declarada em `style={{ ... }}`, ou `null` se não houver estilo.
 *
 * Existe por um caso concreto, e não por completude: `src/app/global-error.tsx`
 * é a tela de erro que roda quando o próprio layout falhou, e por isso ela não
 * pode contar com a folha de estilo do Tailwind. Os dois controles dela estão em
 * `style` em linha. Uma régua que só lê `className` diria que eles não têm alvo,
 * e o conserto seria inventar uma altura numa tela que já está correta.
 *
 * A conta é a mesma da classe: preenchimento de cima mais o de baixo mais a
 * entrelinha, com a entrelinha assumida igual ao CORPO da fonte, que é menos que
 * qualquer `line-height` real e portanto reprova mais, nunca menos.
 */
function alturaPorEstiloEmLinha(abre: ts.JsxOpeningLikeElement): number | null {
  let estilo: ts.ObjectLiteralExpression | null = null;
  for (const atributo of abre.attributes.properties) {
    if (!ts.isJsxAttribute(atributo) || !ts.isIdentifier(atributo.name)) continue;
    if (atributo.name.text !== 'style') continue;
    const valor = atributo.initializer;
    if (valor && ts.isJsxExpression(valor) && valor.expression) {
      const dentro = valor.expression;
      if (ts.isObjectLiteralExpression(dentro)) estilo = dentro;
    }
  }
  if (!estilo) return null;

  let altura: number | null = null;
  let minima: number | null = null;
  let cima: number | null = null;
  let baixo: number | null = null;
  let corpo: number | null = null;
  for (const prop of estilo.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const nome = prop.name.getText().replace(/['"]/g, '');
    const px = medidaEmPixels(prop.initializer);
    if (nome === 'height') altura = px;
    else if (nome === 'minHeight') minima = px;
    else if (nome === 'fontSize') corpo = px;
    else if (nome === 'paddingTop') cima = px;
    else if (nome === 'paddingBottom') baixo = px;
    else if (nome === 'padding') {
      // `padding: '0.5rem 1rem'` tem o vertical na primeira posição.
      const texto =
        ts.isStringLiteral(prop.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(prop.initializer)
          ? prop.initializer.text.trim().split(/\s+/)[0]
          : null;
      const vertical =
        texto !== null && texto !== undefined
          ? medidaEmPixels(ts.factory.createStringLiteral(texto))
          : px;
      if (vertical !== null) {
        if (cima === null) cima = vertical;
        if (baixo === null) baixo = vertical;
      }
    }
  }

  const doPreenchimento =
    cima !== null || baixo !== null || corpo !== null
      ? (cima ?? 0) + (baixo ?? 0) + (corpo ?? MENOR_ENTRELINHA_PX)
      : null;
  const candidatos = [altura, minima, doPreenchimento].filter(
    (valor): valor is number => valor !== null,
  );
  return candidatos.length === 0 ? null : Math.max(...candidatos);
}

/** Valor de texto fixo de um atributo, ou `null`. */
function atributoDeTexto(abre: ts.JsxOpeningLikeElement, nome: string): string | null {
  for (const atributo of abre.attributes.properties) {
    if (!ts.isJsxAttribute(atributo)) continue;
    if (atributo.name.getText() !== nome) continue;
    const valor = atributo.initializer;
    if (!valor) return null;
    if (ts.isStringLiteral(valor)) return valor.text;
    if (ts.isJsxExpression(valor) && valor.expression) {
      const dentro = valor.expression;
      if (ts.isStringLiteral(dentro) || ts.isNoSubstitutionTemplateLiteral(dentro)) {
        return dentro.text;
      }
    }
    return null;
  }
  return null;
}

/** Abertura de um elemento JSX, seja ele com filhos ou autofechado. */
function abertura(no: ts.Node): ts.JsxOpeningLikeElement | null {
  if (ts.isJsxElement(no)) return no.openingElement;
  if (ts.isJsxSelfClosingElement(no)) return no;
  return null;
}

/** Texto visível do controle, recortado para caber na mensagem da falha. */
function rotuloDe(no: ts.Node, abre: ts.JsxOpeningLikeElement, fonte: ts.SourceFile): string {
  if (ts.isJsxElement(no)) {
    const literal = no.children
      .filter((filho): filho is ts.JsxText => ts.isJsxText(filho))
      .map((filho) => filho.text.trim())
      .filter((texto) => texto !== '')
      .join(' ');
    if (literal !== '') return literal.replace(/\s+/g, ' ').slice(0, 60);
  }
  for (const nome of ['aria-label', 'title', 'aria-labelledby', 'name', 'id', 'href']) {
    const valor = atributoDeTexto(abre, nome);
    if (valor !== null && valor !== '') return `${nome}="${valor.slice(0, 60)}"`;
  }
  return 'sem texto fixo';
}

/** Se o elemento tem, em algum nível, uma caixa de seleção ou um botão de rádio. */
function embrulhaCaixaDeSelecao(no: ts.Node, fonte: ts.SourceFile): boolean {
  let achou = false;
  const andar = (atual: ts.Node): void => {
    const abre = abertura(atual);
    if (abre && abre.tagName.getText(fonte) === 'input') {
      const tipo = atributoDeTexto(abre, 'type');
      if (tipo === 'checkbox' || tipo === 'radio') achou = true;
    }
    ts.forEachChild(atual, andar);
  };
  ts.forEachChild(no, andar);
  return achou;
}

/**
 * Nó que não interrompe a frase: a condicional, o `&&`, o `{}` e o fragmento.
 *
 * Existe porque o JSX real de frase quase nunca é plano. Em
 * `src/app/(dashboard)/inventario-ana/page.tsx` a frase "Já fechadas neste lote:"
 * carrega três `<Link>`, cada um embrulhado num ternário, então entre o link e o
 * `<p>` há um `JsxExpression` e um `ConditionalExpression`. Subir por esses nós é
 * o que separa "a máquina não enxergou a frase" de "não é frase": sem isso a
 * varredura de 23/09/2026 achou 3 alvos em linha em 316 controles, número baixo
 * demais para o produto que eu tenho na mão.
 *
 * Chamada de função e função de seta NÃO entram nesta lista, de propósito:
 * `{lista.map((item) => <a .../>)}` é lista de itens e não frase, e ali o alvo
 * tem que declarar altura.
 */
function atravessaFrase(no: ts.Node): boolean {
  return (
    ts.isJsxExpression(no) ||
    ts.isConditionalExpression(no) ||
    ts.isParenthesizedExpression(no) ||
    ts.isBinaryExpression(no) ||
    ts.isJsxFragment(no)
  );
}

/** O que a varredura precisa saber do arquivo em que está trabalhando. */
interface Contexto {
  readonly fonte: ts.SourceFile;
  readonly arquivo: string;
  readonly resolvedor: Resolvedor;
}

/** Se a tag é de algum controle interativo, para o texto dele não contar. */
function ehTagDeControle(tag: string): boolean {
  return TAGS_DE_CONTROLE.test(tag) || TAGS_DE_LINK.test(tag) || tag === 'label';
}

/** O elemento JSX que envolve o nó, atravessando ternário, `&&` e `{}`. */
function elementoPai(no: ts.Node): ts.JsxElement | null {
  let atual: ts.Node = no;
  let pai = atual.parent;
  while (pai && atravessaFrase(pai)) {
    atual = pai;
    pai = atual.parent;
  }
  return pai && ts.isJsxElement(pai) ? pai : null;
}

/**
 * Texto de tela do nó, SEM contar o que está dentro de outro controle.
 *
 * A distinção é a do critério: a exceção fala de "texto que não é alvo". Numa
 * lista de links empilhados cada item tem texto, mas todo esse texto é alvo, e
 * aprovar ali seria dispensar justamente o caso que o critério quer pegar.
 */
function textoNaoAlvo(no: ts.Node, ctx: Contexto): string {
  const raiz = abertura(no);
  if (raiz && ehTagDeControle(raiz.tagName.getText(ctx.fonte))) return '';
  let saida = '';
  const andar = (atual: ts.Node): void => {
    if (atual !== no) {
      const abre = abertura(atual);
      if (abre && ehTagDeControle(abre.tagName.getText(ctx.fonte))) return;
    }
    if (ts.isJsxText(atual)) saida += ` ${atual.text}`;
    else if (ts.isJsxExpression(atual) && atual.expression) {
      const dentro = atual.expression;
      if (ts.isStringLiteral(dentro) || ts.isNoSubstitutionTemplateLiteral(dentro)) {
        // `{'texto'}` e `{' '}` são texto igual, só escritos com chaves.
        saida += ` ${dentro.text}`;
      }
    }
    ts.forEachChild(atual, andar);
  };
  andar(no);
  return saida;
}

/**
 * Se corre, na MESMA linha de TEXTO do controle, texto que não é alvo.
 *
 * Conta o texto solto do próprio pai (`<p>Comece pela <Link/> do posto</p>`) e o
 * texto de irmão que corre na linha (`<span>`, `<strong>`, `<code>`), que é o
 * caso em que o navegador quebra o parágrafo junto com o alvo.
 *
 * Duas portas ficam fechadas de propósito, e a segunda foi a decisão mais difícil
 * desta régua:
 *
 *   1. Pai que EMPILHA os filhos: ali o irmão não divide a linha com o controle,
 *      e a altura dele não limita nada.
 *   2. Pai em FILA (`flex`, `inline-flex`): faixa de controles não é texto
 *      corrido. O filho de um contêiner flex é blocado pelo próprio navegador,
 *      então dar altura a ele não mexe na entrelinha de nada e não obriga a
 *      inflar texto, que é o aperto real que a exceção do SC 2.5.8 descreve.
 *      Isso põe de volta sob a régua a trilha de navegação
 *      (`<ol class="flex"><li><Link/></li><li aria-hidden>›</li>`), o rodapé com
 *      "Voltar para o posto" empurrado por `ml-auto` e o botão "Tentar de novo"
 *      dentro de uma faixa de status: nove controles medidos em 23/09/2026. Nos
 *      que ficam em linha dentro do `<li>`, a correção é `py-1` no próprio link,
 *      que cresce a ÁREA de clique sem mover a linha, ou seja conformidade sem
 *      mudança de desenho.
 */
function textoNaMesmaLinha(pai: ts.JsxElement, filho: ts.Node, ctx: Contexto): boolean {
  const classesPai = classesDoElemento(pai.openingElement, ctx.arquivo, ctx.resolvedor);
  if (EMPILHA.test(classesPai)) return false;
  if (EM_FILA.test(classesPai)) return false;
  for (const irmao of pai.children) {
    if (irmao === filho) continue;
    if (ts.isJsxText(irmao) || ts.isJsxExpression(irmao)) {
      if (textoNaoAlvo(irmao, ctx).trim() !== '') return true;
      continue;
    }
    const abre = abertura(irmao);
    if (!abre) continue;
    if (!TAG_EM_LINHA.test(abre.tagName.getText(ctx.fonte))) continue;
    if (textoNaoAlvo(irmao, ctx).trim() !== '') return true;
  }
  return false;
}

/**
 * Se o controle é alvo em linha de texto, pelo critério que a máquina decide.
 *
 * Este é o recorte que a WCAG 2.2 chama de exceção "inline" no SC 2.5.8: alvo
 * dentro de uma frase, ou cujo tamanho é determinado pela entrelinha do texto em
 * volta, está fora da obrigação dos 24 px. O motivo é de produto, não de régua:
 * engordar um link no meio de um parágrafo desalinha a linha e piora a leitura,
 * então cobrar altura ali faria a régua mandar estragar a tela.
 *
 * O critério, e as três condições valem JUNTAS:
 *
 *   1. a tag é âncora, `Link` ou botão, que é o que aparece dentro de frase;
 *   2. o controle NÃO declara caixa própria (`DECLARA_CAIXA`): quem já tem
 *      caixa dá altura a ela sem mexer em texto nenhum;
 *   3. corre texto que não é alvo na mesma linha (`textoNaMesmaLinha`), no pai
 *      ou, quando o pai é só um embrulho sem texto, um nível acima.
 *
 * A terceira condição é o que separa "link dentro de frase" de "link sozinho na
 * célula": `<p>Veja o <a>manual</a> do posto</p>` passa, e o link que é o único
 * conteúdo de um `<td>` continua tendo que declarar alvo, o que está certo, ali
 * ele é o alvo da célula e o dedo precisa acertá-lo.
 *
 * Irmão que é expressão de valor (`{contagem}`) não conta como frase: pode ser
 * número, ícone ou nada, e o que não se sabe reprova em vez de aprovar calado.
 *
 * O que fica FORA do alcance desta régua, e é decisão humana: a exceção de
 * espaçamento do mesmo critério, que dispensa alvo pequeno quando um círculo de
 * 24 px centrado nele não encosta em outro alvo. Isso depende da caixa
 * renderizada e da posição dos vizinhos, que não existem em medição estática.
 */
function ehAlvoEmLinha(no: ts.Node, tag: string, classes: string, ctx: Contexto): boolean {
  if (!TAGS_DE_LINK.test(tag) && tag !== 'button') return false;
  if (DECLARA_CAIXA.test(classes)) return false;

  let atual: ts.Node = no;
  for (let nivel = 0; nivel <= 1; nivel += 1) {
    const pai = elementoPai(atual);
    if (!pai) return false;
    // O nó julgado é o topo da cadeia transparente, para o irmão certo ser visto.
    let topo: ts.Node = atual;
    while (topo.parent && topo.parent !== pai) topo = topo.parent;
    if (textoNaMesmaLinha(pai, topo, ctx)) return true;
    /*
      Embrulho sem texto próprio não interrompe a linha: na trilha de navegação
      o link mora num `<li>` sozinho, e o separador está no `<li>` vizinho.
    */
    if (!TAG_EM_LINHA.test(pai.openingElement.tagName.getText(ctx.fonte))) return false;
    atual = pai;
  }
  return false;
}

/** O maior valor entre duas medições do mesmo alvo, ou `null` se nenhuma decidiu. */
function maiorDe(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** Os elementos filhos diretos, atravessando ternário, `&&`, `{}` e fragmento. */
function filhosElemento(no: ts.Node, ctx: Contexto): ts.Node[] {
  if (!ts.isJsxElement(no) && !ts.isJsxFragment(no)) return [];
  const saida: ts.Node[] = [];
  const andar = (atual: ts.Node): void => {
    if (ts.isJsxElement(atual) || ts.isJsxSelfClosingElement(atual)) {
      saida.push(atual);
      return;
    }
    if (ts.isIdentifier(atual)) {
      /*
        `{conteudo}` é como o projeto guarda o cartão inteiro antes de decidir se
        ele vira link (`src/components/features/painel/CardKPI.tsx`). Sem seguir
        a constante, a régua mediria um link que envolve um cartão de 100 px como
        se ele tivesse a altura de uma linha de texto.
      */
      const declarado = ctx.resolvedor.declaracaoLocal(atual.text, ctx.arquivo);
      if (declarado) andar(declarado);
      return;
    }
    if (atravessaFrase(atual)) {
      ts.forEachChild(atual, andar);
      return;
    }
  };
  for (const filho of no.children) andar(filho);
  return saida;
}

/**
 * Altura que o CONTEÚDO garante ao controle, quando ele não declara a própria.
 *
 * Um container é pelo menos tão alto quanto o filho em fluxo mais alto, e o
 * projeto usa isso o tempo todo: `<Link className="block">` envolvendo um cartão
 * inteiro, `<button className="flex items-center p-0.5">` envolvendo um avatar de
 * 32 px. Sem esta conta a régua reprovaria alvo grande por não ter olhado o que
 * tem dentro, e o conserto seria declarar altura onde ela já existe.
 *
 * Filho fora do fluxo (`absolute`, `fixed`) e filho invisível (`sr-only`,
 * `hidden`) não entram: eles não sustentam a altura de ninguém.
 */
function alturaPorConteudo(no: ts.Node, ctx: Contexto, profundidade = 0): number | null {
  if (profundidade > 3) return null;
  const abreProprio = abertura(no);
  const classesProprias = abreProprio
    ? classesDoElemento(abreProprio, ctx.arquivo, ctx.resolvedor)
    : '';
  const emFila = EM_FILA.test(classesProprias) && !EMPILHA.test(classesProprias);

  let maior: number | null = null;
  let soma = 0;
  let empilhados = 0;
  for (const filho of filhosElemento(no, ctx)) {
    const abre = abertura(filho);
    if (!abre) continue;
    const classes = classesDoElemento(abre, ctx.arquivo, ctx.resolvedor);
    if (FORA_DO_FLUXO.test(classes) || INVISIVEL.test(classes)) continue;
    const altura = maiorDe(
      alturaDeToqueEfetiva(classes),
      alturaPorConteudo(filho, ctx, profundidade + 1),
    );
    maior = maiorDe(maior, altura);
    /*
      Filho que empilha SOMA, e é o que salva o botão de duas linhas da tabela de
      saldo (`src/components/features/estoque/SaldoTabela.tsx`), que tem duas
      linhas de texto e por isso passa dos 24 px sem declarar altura nenhuma.
      Só soma quem realmente empilha: dentro de um container em fila os mesmos
      filhos ficam lado a lado, e somar ali inventaria altura que não existe.
    */
    if (!emFila && (EMPILHA.test(classesProprias) || BLOCO.test(classes))) {
      soma += altura ?? 0;
      empilhados += 1;
    }
  }
  return maiorDe(maior, empilhados > 1 ? soma : null);
}

/**
 * Altura de controle esticado na altura do pai, como `absolute inset-y-0`.
 *
 * É o botão de mostrar e ocultar senha (`src/components/ui/InputSenha.tsx`), que
 * não declara altura porque ele COPIA a altura do campo: `inset-y-0` amarra o
 * topo e o rodapé no pai posicionado. A altura verdadeira dele é a do campo ao
 * lado, e é essa que a régua mede.
 */
function alturaDoPaiEsticado(no: ts.Node, ctx: Contexto): number | null {
  const pai = elementoPai(no);
  if (!pai) return null;
  const classes = classesDoElemento(pai.openingElement, ctx.arquivo, ctx.resolvedor);
  return maiorDe(alturaDeToqueEfetiva(classes), alturaPorConteudo(pai, ctx));
}

/**
 * Todo controle interativo de um arquivo, já julgado contra o mínimo.
 *
 * O `leitor` é opcional e serve para a régua seguir constante de classe até o
 * arquivo que a exporta. Sem ele a medição continua valendo, só fica mais
 * pessimista: constante importada vira classe vazia e o controle reprova por
 * altura indecidível, com a razão escrita, nunca aprovado em silêncio.
 */
export function controlesDeToque(
  codigo: string,
  arquivo: string,
  leitor: LeitorDeModulo | null = null,
): ControleDeToque[] {
  const lido = lerArquivo(codigo, arquivo);
  const fonte = lido.fonte;
  const resolvedor = new Resolvedor(leitor);
  resolvedor.registrar(arquivo, lido);
  const ctx: Contexto = { fonte, arquivo, resolvedor };

  const achados: ControleDeToque[] = [];
  const andar = (no: ts.Node): void => {
    const abre = abertura(no);
    if (abre) {
      const tag = abre.tagName.getText(fonte);
      const ehControle =
        TAGS_DE_CONTROLE.test(tag) ||
        TAGS_DE_LINK.test(tag) ||
        (tag === 'label' && embrulhaCaixaDeSelecao(no, fonte));
      if (ehControle) {
        const classes = classesDoElemento(abre, arquivo, resolvedor);
        const emLinhaDeTexto = ehAlvoEmLinha(no, tag, classes, ctx);
        /*
          As duas fontes descrevem o MESMO alvo, e a régua fica com a maior.
          Medido em 23/09/2026: os únicos controles do projeto com altura em
          `style` estão em `src/app/global-error.tsx`, que roda sem a folha do
          Tailwind, e nenhum deles tem `className`. Quem misturar as duas fontes
          precisa saber que esta régua não resolve especificidade de CSS.
        */
        let alturaPx = maiorDe(alturaDeToqueEfetiva(classes), alturaPorEstiloEmLinha(abre));
        alturaPx = maiorDe(alturaPx, alturaPorConteudo(no, ctx));
        if (ESTICA_NA_ALTURA_DO_PAI.test(classes)) {
          alturaPx = maiorDe(alturaPx, alturaDoPaiEsticado(no, ctx));
        }
        let razao: RazaoDeReprova = null;
        if (!emLinhaDeTexto) {
          if (alturaPx === null) razao = 'altura-indecidivel';
          else if (alturaPx < MINIMO_ALVO_PX) razao = 'abaixo-do-minimo';
        }
        achados.push({
          arquivo,
          linha: fonte.getLineAndCharacterOfPosition(abre.getStart(fonte)).line + 1,
          tag,
          rotulo: rotuloDe(no, abre, fonte),
          classes,
          alturaPx,
          emLinhaDeTexto,
          classesDoPai: (() => {
            const pai = elementoPai(no);
            return pai
              ? classesDoElemento(pai.openingElement, arquivo, resolvedor)
              : '';
          })(),
          aprovado: razao === null,
          razao,
        });
      }
    }
    ts.forEachChild(no, andar);
  };
  andar(fonte);
  return achados;
}
