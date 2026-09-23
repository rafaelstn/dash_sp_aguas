/**
 * Achado do QA de acabamento de 23/09/2026: alvo de toque menor que o mínimo.
 *
 * Três controles da tela Postos não declaravam altura nenhuma, e por isso tinham
 * a altura da própria linha de texto: `text-sm` neste projeto é 0.8125rem com
 * entrelinha de 1.125rem (`tailwind.config.ts`), ou seja 18 px, e a linha da
 * legenda, em `text-xs`, ficava em 16 px. O mínimo da WCAG 2.2 no SC 2.5.8
 * (nível AA) é 24 px, e a casa mira 44 px onde o dedo alcança. O cliente é órgão
 * público: e-MAG e WCAG são obrigação legal.
 *
 * Os três, e por que cada um importa:
 *
 *   1. "Outras redes (SIBH)", em `LegendaMapa`: é o ÚNICO controle do corpo da
 *      legenda, que no celular abre por cima do mapa e é usada em campo.
 *   2. "Ver todos os postos", em `TelaPostos`: desfaz o recorte de um link
 *      compartilhado, e aparece em todas as larguras, celular incluído.
 *   3. "Limpar filtros", em `FiltrosDesktop`: vive numa faixa de controles de
 *      32 px e era o único sem altura, o que também o deixava desalinhado.
 *
 * Por que a régua é estática e lê a classe: no jsdom não há layout e o CSS do
 * Tailwind não é aplicado, então `getBoundingClientRect()` devolve zero e a regra
 * `target-size` do axe está desligada (o motivo está escrito em
 * `tests/apoio/acessibilidade.ts`). Medir renderizando seria medir a propriedade
 * vizinha. A asserção, ainda assim, é sobre o VALOR em pixels que a classe
 * declara, e não sobre a presença de um texto: trocar `min-h-11` por `min-h-5`
 * continua reprovando.
 *
 * O caso começa provando o aparelho, inclusive com o que ele NÃO deve confundir
 * (`max-h-`) e com o que ele não sabe decidir (`h-full`), e cada controle é
 * localizado pelo texto que aparece na tela: não achar o controle é falha, senão
 * renomear o botão faria a régua aprovar por não ter medido nada.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { MINIMO_ALVO_PX, alturaDeToqueDeclarada } from '../../apoio/alvo-de-toque';

const RAIZ = process.cwd();

/** Controle sob medição: o arquivo, a tag e o texto visível que o identifica. */
interface Controle {
  readonly arquivo: string;
  readonly tag: string;
  readonly texto: string;
}

const CONTROLES: readonly Controle[] = [
  {
    arquivo: 'src/components/features/postos/mapa/LegendaMapa.tsx',
    tag: 'label',
    texto: 'Outras redes (SIBH)',
  },
  {
    arquivo: 'src/components/features/postos/mapa/TelaPostos.tsx',
    tag: 'button',
    texto: 'Ver todos os postos',
  },
  {
    arquivo: 'src/components/features/postos/mapa/FiltrosPostos.tsx',
    tag: 'button',
    texto: 'Limpar filtros',
  },
];

interface Achado {
  readonly linha: number;
  readonly classes: string;
}

/** Junta o texto literal de todo `className` declarado no próprio elemento. */
function classesDoElemento(abre: ts.JsxOpeningLikeElement): string {
  const partes: string[] = [];
  for (const atributo of abre.attributes.properties) {
    if (!ts.isJsxAttribute(atributo) || !ts.isIdentifier(atributo.name)) continue;
    if (atributo.name.text !== 'className') continue;
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
  }
  return partes.join(' ');
}

/**
 * Acha o elemento da tag pedida cujo conteúdo traz aquele texto visível.
 *
 * Devolve o mais interno quando há aninhamento, que é o controle de verdade, e
 * `undefined` quando não acha, para quem chama poder falhar dizendo isso.
 */
function localizar(controle: Controle): Achado | undefined {
  const codigo = readFileSync(path.join(RAIZ, controle.arquivo), 'utf8');
  const fonte = ts.createSourceFile(
    controle.arquivo,
    codigo,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let achado: Achado | undefined;
  const andar = (no: ts.Node): void => {
    if (ts.isJsxElement(no) && no.openingElement.tagName.getText(fonte) === controle.tag) {
      const dentro = no.children.map((c) => c.getText(fonte)).join(' ');
      if (dentro.includes(controle.texto)) {
        achado = {
          linha:
            fonte.getLineAndCharacterOfPosition(no.openingElement.getStart(fonte)).line + 1,
          classes: classesDoElemento(no.openingElement),
        };
      }
    }
    ts.forEachChild(no, andar);
  };
  andar(fonte);
  return achado;
}

describe('o aparelho que lê a altura declarada do alvo', () => {
  it('converte a escala do Tailwind, o arbitrário em px e o em rem', () => {
    expect(alturaDeToqueDeclarada('inline-flex h-11 items-center')).toBe(44);
    expect(alturaDeToqueDeclarada('min-h-[44px]')).toBe(44);
    expect(alturaDeToqueDeclarada('h-[2.75rem]')).toBe(44);
    expect(alturaDeToqueDeclarada('h-px')).toBe(1);
  });

  it('cobra o pior caso entre os breakpoints, e não o primeiro que aparece', () => {
    // O alvo pequeno demais mora justamente no breakpoint esquecido.
    expect(alturaDeToqueDeclarada('flex min-h-11 items-center md:min-h-6')).toBe(24);
    expect(alturaDeToqueDeclarada('md:min-h-6 min-h-11')).toBe(24);
  });

  it('reprova a altura pequena em vez de aprovar por ela existir', () => {
    // Medir a presença da classe aprovaria isto, que é 20 px.
    expect(alturaDeToqueDeclarada('min-h-5')).toBe(20);
    expect(alturaDeToqueDeclarada('h-3.5 w-3.5 accent-gov-azul')).toBe(14);
  });

  it('devolve nada quando a classe não declara altura', () => {
    // O defeito original: nenhuma altura, e o alvo vira a entrelinha da fonte.
    expect(
      alturaDeToqueDeclarada('rounded px-1.5 text-sm font-medium text-gov-azul'),
    ).toBeNull();
    expect(alturaDeToqueDeclarada('')).toBeNull();
  });

  it('não confunde outra propriedade com altura, nem chuta o indecidível', () => {
    expect(alturaDeToqueDeclarada('max-h-11 w-11 overflow-hidden')).toBeNull();
    expect(alturaDeToqueDeclarada('h-full md:h-screen')).toBeNull();
    expect(alturaDeToqueDeclarada('md:h-[max(34rem,calc(100dvh-15rem))]')).toBeNull();
  });
});

describe('alvos de toque da tela Postos', () => {
  for (const controle of CONTROLES) {
    it(`"${controle.texto}" declara altura de alvo de pelo menos ${MINIMO_ALVO_PX} px`, () => {
      const achado = localizar(controle);
      // Âncora de presença: sem o controle na mão não há medição nenhuma, e a
      // régua passaria em silêncio se o botão fosse renomeado ou removido.
      expect(
        achado,
        `não achei <${controle.tag}> com o texto "${controle.texto}" em ${controle.arquivo}`,
      ).toBeDefined();

      const altura = alturaDeToqueDeclarada((achado as Achado).classes);
      expect(
        altura,
        `${controle.arquivo}:${(achado as Achado).linha} <${controle.tag}> "${controle.texto}" ` +
          `não declara altura nenhuma, então o alvo fica com a altura da linha de texto ` +
          `(18 px em text-sm, 16 px em text-xs), abaixo dos ${MINIMO_ALVO_PX} px do WCAG 2.2 2.5.8`,
      ).not.toBeNull();
      expect(
        altura as number,
        `${controle.arquivo}:${(achado as Achado).linha} <${controle.tag}> "${controle.texto}" ` +
          `declara ${altura} px de alvo, abaixo dos ${MINIMO_ALVO_PX} px do WCAG 2.2 2.5.8`,
      ).toBeGreaterThanOrEqual(MINIMO_ALVO_PX);
    });
  }
});
