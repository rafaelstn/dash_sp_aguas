/**
 * Alvo de toque de 24 px em TODO controle interativo de `src/`.
 *
 * Achado 1 do QA de acabamento de 23/09/2026. A primeira versão desta régua
 * media três controles da tela Postos, por uma lista escrita à mão, e uma lista
 * à mão só protege o que alguém lembrou de escrever nela: no mesmo dia a
 * varredura achou 41 controles abaixo do mínimo em 26 arquivos, nenhum deles na
 * lista. Agora a régua VARRE o código, e os três de origem continuam cobertos
 * por nome logo abaixo, como âncora de presença.
 *
 * O mínimo é o SC 2.5.8 da WCAG 2.2 (Target Size Minimum, nível AA), que a casa
 * mira em 44 px onde o dedo alcança. O cliente é órgão público: e-MAG e WCAG são
 * obrigação legal, não acabamento.
 *
 * Por que a régua é estática e lê a classe: no jsdom não há layout e o CSS do
 * Tailwind não é aplicado, então `getBoundingClientRect()` devolve zero e a regra
 * `target-size` do axe está desligada (o motivo está escrito em
 * `tests/apoio/acessibilidade.ts`). Medir renderizando seria medir a propriedade
 * vizinha. A asserção é sobre o VALOR em pixels que a classe declara, e não sobre
 * a presença de um texto: trocar `min-h-11` por `min-h-5` continua reprovando.
 *
 * O RECORTE da exceção em linha do SC 2.5.8, que é a parte que a máquina decide
 * e por isso está escrita aqui e em `ehAlvoEmLinha`: link dentro de frase está
 * fora da obrigação, porque engordar um link no meio de um parágrafo desalinha a
 * leitura, e a régua não existe para mandar estragar a tela. As três condições
 * valem juntas: a tag é âncora, `Link` ou botão; o controle NÃO declara caixa
 * própria; e corre texto que não é alvo na mesma linha dele. Faixa de controles
 * em `flex` está FORA da exceção de propósito: ali o navegador já bloca o filho,
 * então dar altura não mexe em entrelinha nenhuma e não obriga a inflar nada.
 *
 * O que esta régua NÃO mede, e continua sendo decisão humana: a LARGURA do alvo,
 * e a exceção de espaçamento do mesmo critério, que dispensa alvo pequeno quando
 * um círculo de 24 px centrado nele não encosta em outro alvo. As duas dependem
 * da caixa renderizada e da posição dos vizinhos, que não existem em medição
 * estática.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  CORPO_PX,
  ENTRELINHA_PX,
  ESPACO_COM_NOME,
  MINIMO_ALVO_PX,
  type ControleDeToque,
  type LeitorDeModulo,
  alturaDeToqueDeclarada,
  alturaDeToqueEfetiva,
  controlesDeToque,
} from '../../apoio/alvo-de-toque';

const RAIZ = process.cwd();

/* ------------------------------------------------------------------ aparelho */

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

  it('soma preenchimento vertical com entrelinha, que é a altura real do alvo', () => {
    // O caso que aparece em quase toda correção: `text-xs` é 16 px de linha, e
    // `py-1` põe 4 px de cada lado, fechando exatamente o mínimo.
    expect(alturaDeToqueEfetiva('rounded px-2 py-1 text-xs')).toBe(24);
    expect(alturaDeToqueEfetiva('rounded px-2 py-0.5 text-xs')).toBe(20);
    expect(alturaDeToqueEfetiva('px-3 py-2 text-sm')).toBe(34);
    // Altura declarada manda quando é maior que a soma.
    expect(alturaDeToqueEfetiva('min-h-11 py-1 text-xs')).toBe(44);
  });

  it('lê o espaçamento com nome do projeto, em vez de chamar de indecidível', () => {
    expect(alturaDeToqueEfetiva('flex h-header items-center')).toBe(ESPACO_COM_NOME.header);
    expect(alturaDeToqueEfetiva('w-sidenav h-8')).toBe(32);
  });

  it('confere as tabelas de escala contra o tailwind.config.ts, e não contra si', () => {
    /*
      Número de config copiado para dentro de régua é o que envelhece calado: se
      a escala tipográfica mudar e esta tabela ficar parada, a régua passa a
      medir uma tela que não existe mais. Então a tabela se confere contra a
      fonte a cada execução, e o config é lido por REGEX porque importar o
      arquivo aqui arrastaria o plugin do Tailwind para dentro do teste.
    */
    const config = readFileSync(path.join(RAIZ, 'tailwind.config.ts'), 'utf8');
    const escala = /^\s*'?([\w-]+)'?:\s*\['([\d.]+)rem',\s*\{\s*lineHeight:\s*'([\d.]+)rem'/gm;
    const lidos: string[] = [];
    for (const achado of config.matchAll(escala)) {
      const nome = achado[1] as string;
      const corpo = Number(achado[2]) * 16;
      const entrelinha = Number(achado[3]) * 16;
      lidos.push(nome);
      expect(ENTRELINHA_PX[nome], `entrelinha de text-${nome} mudou no tailwind.config.ts`).toBe(
        entrelinha,
      );
      expect(CORPO_PX[nome], `corpo de text-${nome} mudou no tailwind.config.ts`).toBe(corpo);
    }
    // Âncora de presença: sem ler a escala, os `expect` acima nunca rodam.
    expect(lidos.length, 'não li a escala de fontSize do tailwind.config.ts').toBeGreaterThanOrEqual(
      9,
    );
    expect(Object.keys(ENTRELINHA_PX).sort()).toEqual(lidos.slice().sort());

    /*
      O espaçamento com nome vem do mesmo lugar, e só o do BLOCO `spacing`: o
      config tem `maxWidth: { content: '1440px' }`, que não é espaçamento e
      entraria numa busca solta por `nome: 'Npx'`. Recorte sem a fronteira do
      bloco colhe o vizinho, e a régua reprovaria por medir outra propriedade.
    */
    const bloco = /\n\s*spacing:\s*\{([^}]*)\}/.exec(config);
    expect(bloco, 'não achei o bloco spacing no tailwind.config.ts').not.toBeNull();
    const nomeados: Record<string, number> = {};
    for (const achado of (bloco?.[1] ?? '').matchAll(/([a-z][\w-]*):\s*'(\d+)px'/g)) {
      nomeados[achado[1] as string] = Number(achado[2]);
    }
    expect(
      Object.keys(nomeados).length,
      'não li espaçamento com nome nenhum dentro do bloco spacing',
    ).toBeGreaterThanOrEqual(2);
    expect(nomeados, 'o espaçamento com nome mudou no tailwind.config.ts').toEqual({
      ...ESPACO_COM_NOME,
    });
  });
});

/* ------------------------------------------- o extrator, sobre código montado */

describe('o extrator, medido sobre código montado para reprovar', () => {
  const de = (codigo: string): ControleDeToque[] => controlesDeToque(codigo, 'sintetico.tsx');

  it('reprova o botão que declara altura abaixo do mínimo', () => {
    const achados = de('export const A = () => <button className="min-h-5">Ver</button>;');
    expect(achados).toHaveLength(1);
    expect(achados[0]?.alturaPx).toBe(20);
    expect(achados[0]?.aprovado).toBe(false);
    expect(achados[0]?.razao).toBe('abaixo-do-minimo');
    expect(achados[0]?.rotulo).toBe('Ver');
  });

  it('aprova o botão que declara o mínimo, e diz a altura que mediu', () => {
    const achados = de('export const A = () => <button className="min-h-11">Ver</button>;');
    expect(achados[0]?.alturaPx).toBe(44);
    expect(achados[0]?.aprovado).toBe(true);
  });

  it('aprova o link dentro de frase, que é a exceção em linha do SC 2.5.8', () => {
    const achados = de(
      'export const A = () => <p className="text-xs">Comece pela <a href="/">busca de postos</a>.</p>;',
    );
    expect(achados).toHaveLength(1);
    expect(achados[0]?.emLinhaDeTexto).toBe(true);
    expect(achados[0]?.aprovado).toBe(true);
  });

  it('não estende a exceção ao link sozinho, nem ao que mora em faixa de fila', () => {
    const sozinho = de('export const A = () => <td><a href="/">Abrir posto</a></td>;');
    expect(sozinho[0]?.emLinhaDeTexto).toBe(false);
    expect(sozinho[0]?.aprovado).toBe(false);

    // Trilha de navegação: o `<li>` é item de fila e o navegador já o bloca, então
    // dar altura ali não mexe em entrelinha nenhuma.
    const emFila = de(
      'export const A = () => (<ol className="flex items-center gap-1">' +
        '<li><a href="/">Postos</a></li><li aria-hidden="true">/</li></ol>);',
    );
    expect(emFila).toHaveLength(1);
    expect(emFila[0]?.emLinhaDeTexto).toBe(false);
    expect(emFila[0]?.aprovado).toBe(false);
  });

  it('não chuta a altura que não sabe: indecidível reprova com o próprio motivo', () => {
    const achados = de('export const A = () => <button className="h-full">Ver</button>;');
    expect(achados[0]?.alturaPx).toBeNull();
    expect(achados[0]?.aprovado).toBe(false);
    expect(achados[0]?.razao).toBe('altura-indecidivel');
  });

  it('mede a altura que vem do conteúdo do próprio controle', () => {
    // Botão sem altura própria, com um ícone de 24 px dentro: o alvo é o ícone.
    const achados = de(
      'export const A = () => (<button className="rounded"><span className="h-6 w-6" /></button>);',
    );
    expect(achados[0]?.alturaPx).toBe(24);
    expect(achados[0]?.aprovado).toBe(true);
  });
});

/* ------------------------------------------------- os três controles de origem */

/** Controle sob medição: o arquivo, a tag e o texto visível que o identifica. */
interface Controle {
  readonly arquivo: string;
  readonly tag: string;
  readonly texto: string;
}

/**
 * Os três controles do achado original, cobrados por NOME.
 *
 * A varredura já os alcança, e é por isso que eles ficam: se o extrator ficar
 * cego amanhã, a varredura aprova por não ter lido nada e estes três continuam
 * denunciando, cada um localizado pelo texto que o usuário lê na tela.
 */
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

/* ------------------------------------------------------- a varredura de src/ */

/** Todo `.ts` e `.tsx` abaixo da pasta, em caminho relativo com barra normal. */
function arquivosDe(dir: string): string[] {
  const saida: string[] = [];
  for (const item of readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const relativo = `${dir}/${item.name}`;
    if (item.isDirectory()) saida.push(...arquivosDe(relativo));
    else if (item.name.endsWith('.tsx') || item.name.endsWith('.ts')) saida.push(relativo);
  }
  return saida;
}

const SUFIXOS = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'];

/**
 * Abre o módulo que um import cita, para a régua alcançar classe em constante.
 *
 * Metade das telas escreve a classe do controle numa constante compartilhada
 * (`CLASSE_ACAO_SECUNDARIA` e afins). Sem seguir o import, a régua leria
 * `className={CLASSE}` como "sem altura declarada" e reprovaria tela correta,
 * que é o pior resultado possível: empurraria o produto a inflar o que já está
 * certo.
 */
const leitor: LeitorDeModulo = (especificador, deArquivo) => {
  let base: string;
  if (especificador.startsWith('@/')) base = `src/${especificador.slice(2)}`;
  else if (especificador.startsWith('.')) {
    base = path.posix.join(path.posix.dirname(deArquivo), especificador);
  } else return null;

  for (const sufixo of SUFIXOS) {
    const alvo = `${base}${sufixo}`;
    if (!alvo.endsWith('.ts') && !alvo.endsWith('.tsx')) continue;
    const absoluto = path.join(RAIZ, alvo);
    if (existsSync(absoluto)) return { arquivo: alvo, codigo: readFileSync(absoluto, 'utf8') };
  }
  return null;
};

const ARQUIVOS = arquivosDe('src');
const CONTROLES_DE_SRC: ControleDeToque[] = ARQUIVOS.flatMap((arquivo) =>
  controlesDeToque(readFileSync(path.join(RAIZ, arquivo), 'utf8'), arquivo, leitor),
);

/** Como um controle aparece na mensagem de falha e no livro da exceção. */
const identidade = (c: ControleDeToque): string =>
  `${c.arquivo}|${c.tag}|${c.rotulo.replace(/\s+/g, ' ').trim()}`;

/**
 * Os controles que hoje vivem da exceção em linha do SC 2.5.8.
 *
 * Medido em 23/09/2026: quinze, todos link dentro de frase ou de trilha de
 * navegação escrita em texto corrido. A lista é exata de propósito. A exceção é
 * o único lugar por onde um alvo de 16 px entra de forma legítima, e ela não
 * pode crescer sem alguém olhar: entrar um controle novo aqui é decisão humana,
 * não efeito colateral de uma classe removida.
 */
const EXCECAO_EM_LINHA: readonly string[] = [
  'src/app/(dashboard)/favoritos/page.tsx|Link|busca de postos',
  'src/app/(dashboard)/inventario-ana/[codigo]/page.tsx|Link|sem texto fixo',
  'src/app/(dashboard)/inventario-ana/page.tsx|Link|descartada',
  'src/app/(dashboard)/inventario-ana/page.tsx|Link|promovida a posto',
  'src/app/(dashboard)/inventario-ana/page.tsx|Link|revisada',
  'src/app/(dashboard)/postos/[prefixo]/fichas/[id]/editar/page.tsx|Link|Buscar postos',
  'src/app/(dashboard)/postos/[prefixo]/fichas/[id]/editar/page.tsx|Link|sem texto fixo',
  'src/app/(dashboard)/postos/[prefixo]/fichas/[id]/editar/page.tsx|Link|sem texto fixo',
  'src/app/(dashboard)/postos/[prefixo]/fichas/[id]/page.tsx|Link|Buscar postos',
  'src/app/(dashboard)/postos/[prefixo]/fichas/[id]/page.tsx|Link|sem texto fixo',
  'src/app/(dashboard)/postos/[prefixo]/fichas/nova/[tipo]/page.tsx|Link|Buscar postos',
  'src/app/(dashboard)/postos/[prefixo]/fichas/nova/[tipo]/page.tsx|Link|sem texto fixo',
  'src/app/(dashboard)/postos/[prefixo]/page.tsx|Link|Buscar postos',
  'src/app/(dashboard)/triagem/[id]/page.tsx|Link|Consultar a ficha de origem',
  'src/components/features/inventario-ana/BlocoMatchSugerido.tsx|Link|sem texto fixo',
];

/* Piso medido em 23/09/2026: 544 arquivos em `src/` e 316 controles lidos. */
const PISO_DE_ARQUIVOS = 500;
const PISO_DE_CONTROLES = 300;

/** As seis formas de controle que a régua julga, e que precisam aparecer. */
const TAGS_ESPERADAS = ['Link', 'a', 'button', 'label', 'select', 'summary'];

describe('alvo de toque em todo controle interativo de src/', () => {
  it('leu o código inteiro, e não aprova por não ter achado nada', () => {
    /*
      Régua que aprova sobre zero controle lido é cegueira de parser vestida de
      conformidade, e foi assim que os 41 defeitos deste dia passaram meses sem
      ninguém ver. Por isso o piso é número medido, e cada forma de controle
      precisa aparecer: se amanhã o extrator parar de enxergar `<select>`, esta
      linha reprova em vez de a varredura ficar verde com 38 alvos a menos.
    */
    expect(ARQUIVOS.length, 'a varredura não achou os arquivos de src/').toBeGreaterThanOrEqual(
      PISO_DE_ARQUIVOS,
    );
    expect(
      CONTROLES_DE_SRC.length,
      'o extrator leu controles de menos: parser cego aprova tela quebrada',
    ).toBeGreaterThanOrEqual(PISO_DE_CONTROLES);
    expect([...new Set(CONTROLES_DE_SRC.map((c) => c.tag))].sort()).toEqual(TAGS_ESPERADAS);
  });

  it(`todo controle declara alvo de pelo menos ${MINIMO_ALVO_PX} px, ou cai na exceção em linha`, () => {
    const reprovados = CONTROLES_DE_SRC.filter((c) => !c.aprovado);
    const detalhe = reprovados
      .map(
        (c) =>
          `  ${c.arquivo}:${c.linha} <${c.tag}> "${c.rotulo}" [${c.razao}] ` +
          `altura=${c.alturaPx === null ? 'indecidível' : `${c.alturaPx}px`} classes="${c.classes}"`,
      )
      .join('\n');
    expect(
      reprovados.map(identidade),
      `${reprovados.length} controle(s) abaixo dos ${MINIMO_ALVO_PX} px do WCAG 2.2 SC 2.5.8 ` +
        `(e-MAG e WCAG são obrigação legal neste contrato). A correção é a classe de altura do ` +
        `projeto: \`min-h-11 md:min-h-6\` onde o dedo alcança, \`min-h-6\` em faixa densa, ou ` +
        `\`py-1\` quando o controle corre em linha e o preenchimento cresce a área de clique sem ` +
        `mover o texto.\n${detalhe}`,
    ).toEqual([]);
  });

  it('a exceção em linha do SC 2.5.8 não cresce sem revisão humana', () => {
    const emLinha = CONTROLES_DE_SRC.filter((c) => c.emLinhaDeTexto).map(identidade);
    expect(
      emLinha.sort(),
      'a lista de controles que vivem da exceção em linha mudou. Entrou um controle novo: ' +
        'confira que ele é mesmo link dentro de frase, e não alvo solto que precisa de altura. ' +
        'Saiu um controle: ele agora está sob a régua, e precisa declarar os 24 px.',
    ).toEqual([...EXCECAO_EM_LINHA].sort());
  });
});
