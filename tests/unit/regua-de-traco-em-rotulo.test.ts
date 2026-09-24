/**
 * Rótulo de controle não usa traço como separador.
 *
 * O defeito real, achado em 23/09/2026 em
 * `src/components/features/postos/FormularioEditarPosto.tsx`: os doze campos de
 * data da seção "Datas de medição ANA" eram rotulados "Escala — início",
 * "Escala — fim", e assim por diante. O próprio projeto já escrevia o mesmo par
 * como "Escala (início)" em `src/domain/fichas/schemas.ts`, então o formulário
 * era o dialeto de fora, e não o padrão.
 *
 * O que esta régua NÃO julga, de propósito: comentário, prosa de documentação e
 * o marcador de valor vazio. Medido no dia: travessão aparece em 221 dos 545
 * arquivos de `src/`, quase todo ele em comentário ou em `'—'` de célula sem
 * valor, e uma régua ampla seria máquina de falso positivo. O recorte é o texto
 * curto que nomeia um controle, que é onde o traço só pode ser separador.
 *
 * Também fica fora o cabeçalho da planilha ANA
 * (`src/application/use-cases/inventario-ana/exportar.ts`): "Escala - Início" é
 * o nome da coluna na aba DÚVIDAS da Agência Nacional de Águas, formato de
 * terceiro compartilhado com o patcher Python e com `data/colunas-ana.json`.
 * Renomear ali quebraria o arquivo que o órgão entrega, não corrigiria estilo.
 *
 * Régua nova é suspeita até reprovar o defeito E aprovar o legítimo, então este
 * arquivo prova primeiro o aparelho, inclusive a fuga pelo template literal e
 * pelo comentário, e só depois julga o `src/`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { rotulosLidos, tracosEmRotulo } from '../apoio/traco-em-rotulo';

/** O defeito como ele estava antes da correção de 23/09/2026. */
const DEFEITO = `
export function Secao() {
  return (
    <>
      <Campo label="Escala — início" valor={a} type="date" />
      <Campo label="Escala — fim" valor={b} type="date" />
    </>
  );
}
`;

/** A correção: o parêntese que o projeto já usava nos schemas de ficha. */
const CORRIGIDO = `
export function Secao() {
  return (
    <>
      <Campo label="Escala (início)" valor={a} type="date" />
      <Campo label="Escala (fim)" valor={b} type="date" />
    </>
  );
}
`;

/** Nome próprio do sistema: o hífen é do nome, não separa cláusula. */
const NOME_DO_PRODUTO = `
export function Cabecalho() {
  return <a href="/painel" aria-label="SP Águas - DMO, ir para o painel">Início</a>;
}
`;

/** Célula sem valor: o traço é o conteúdo do rótulo, e não um separador. */
const MARCADOR_DE_VAZIO = `
export function Celula() {
  return <input placeholder="—" readOnly />;
}
`;

/** Palavra composta: o hífen não está cercado de espaço. */
const PALAVRA_COMPOSTA = `
export function Aba() {
  return <Aba titulo="Pré-venda e follow-up" />;
}
`;

/** A fuga pelo template literal, que uma busca textual por atributo perderia. */
const DEFEITO_POR_TEMPLATE = `
export function Secao({ tipo }: { tipo: string }) {
  return <Campo label={\`\${tipo} — início\`} valor={a} type="date" />;
}
`;

/**
 * O defeito depois da mudança de 23/09/2026: o rótulo saiu do JSX e foi para um
 * mapa `ROTULOS_*`, com `as const satisfies` em cima. Se o extrator não
 * desembrulhar isso, o travessão passa.
 */
const DEFEITO_EM_MAPA = `
export const ROTULOS_CAMPO_POSTO = {
  anaEscalaInicio: 'Escala — início',
  anaEscalaFim: 'Escala (fim)',
} as const satisfies Record<string, string>;
`;

/** O mesmo mapa escrito como o padrão da casa pede. */
const MAPA_CORRIGIDO = `
export const ROTULOS_CAMPO_POSTO = {
  anaEscalaInicio: 'Escala (início)',
  anaEscalaFim: 'Escala (fim)',
} as const satisfies Record<string, string>;
`;

/**
 * Constante que não é de rótulo fica de fora: o traço ali é dado de terceiro
 * (cabeçalho da planilha da ANA), e reprovar isso quebraria o arquivo que o
 * órgão entrega. É o recorte que já estava escrito no docblock da régua.
 */
const CONSTANTE_QUE_NAO_E_ROTULO = `
export const COLUNAS_ANA = {
  anaEscalaInicio: 'Escala - Início',
};
`;

/** Rótulo solto, sem objeto: a convenção de nome basta. */
const ROTULO_SOLTO = `
export const ROTULO_ORIGEM_DBFCH = 'Dbfch';
`;

/** Traço em comentário não é rótulo de nada. */
const TRACO_SO_NO_COMENTARIO = `
// Datas de medição ANA — a planilha do órgão separa início e fim.
export function Secao() {
  return <Campo label="Escala (início)" valor={a} type="date" />;
}
`;

/** O nome de arquivo só entra na mensagem de erro; o parser não usa disco. */
const SINTETICO = 'amostra-sintetica.tsx';

const RAIZ = process.cwd();

/**
 * Lista os `.ts` e `.tsx` de `src/` pelo Git, mas lê o conteúdo do DISCO.
 *
 * Pelo Git para não varrer `node_modules` nem artefato gerado, e do disco para
 * a régua reprovar o caso que ainda está por commitar.
 *
 * O `.ts` entrou em 23/09/2026, junto com a segunda fonte do extrator, e não é
 * ampliação de escopo por gosto: os mapas `ROTULO*` do projeto moram quase
 * todos em módulo sem JSX (`src/lib/rotulos-posto.ts`,
 * `src/components/features/estoque/rotulos.ts`,
 * `src/components/features/postos/mapa/simbolos.ts`, `src/domain/auth/papel.ts`
 * e outros). Medido no dia: 196 `.tsx` contra 346 `.ts` versionados em `src/`.
 * Listar só `.tsx` deixaria a segunda fonte inerte, com a régua verde por não
 * abrir o arquivo onde o rótulo está escrito.
 */
function arquivosDeFonte(): string[] {
  const saida = execFileSync('git', ['ls-files', '-z', '--', 'src'], {
    cwd: RAIZ,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return saida
    .split('\0')
    .filter((caminho) => caminho.endsWith('.tsx') || caminho.endsWith('.ts'));
}

describe('o aparelho que acha traço em rótulo', () => {
  it('reprova os dois rótulos com travessão, nomeando o texto da tela', () => {
    const achados = tracosEmRotulo(DEFEITO, SINTETICO);
    expect(achados).toHaveLength(2);
    expect(achados[0]?.atributo).toBe('label');
    expect(achados[0]?.valor).toBe('Escala — início');
    expect(achados[1]?.valor).toBe('Escala — fim');
  });

  it('aprova a correção com parêntese', () => {
    expect(tracosEmRotulo(CORRIGIDO, SINTETICO)).toEqual([]);
    // Presença antes de ausência: o aparelho tem que estar VENDO estes dois
    // rótulos, senão a aprovação acima é cegueira do parser.
    expect(rotulosLidos(CORRIGIDO, SINTETICO)).toBe(2);
  });

  it('aprova o nome do produto, cujo hífen é do nome próprio', () => {
    expect(tracosEmRotulo(NOME_DO_PRODUTO, SINTETICO)).toEqual([]);
    expect(rotulosLidos(NOME_DO_PRODUTO, SINTETICO)).toBe(1);
  });

  it('aprova o traço que é marcador de valor vazio', () => {
    expect(tracosEmRotulo(MARCADOR_DE_VAZIO, SINTETICO)).toEqual([]);
    expect(rotulosLidos(MARCADOR_DE_VAZIO, SINTETICO)).toBe(1);
  });

  it('aprova hífen de palavra composta', () => {
    expect(tracosEmRotulo(PALAVRA_COMPOSTA, SINTETICO)).toEqual([]);
    expect(rotulosLidos(PALAVRA_COMPOSTA, SINTETICO)).toBe(1);
  });

  it('fecha a porta dos fundos do rótulo montado por template literal', () => {
    const achados = tracosEmRotulo(DEFEITO_POR_TEMPLATE, SINTETICO);
    expect(achados).toHaveLength(1);
    expect(achados[0]?.atributo).toBe('label');
  });

  it('não confunde traço em comentário com rótulo de tela', () => {
    expect(tracosEmRotulo(TRACO_SO_NO_COMENTARIO, SINTETICO)).toEqual([]);
    expect(rotulosLidos(TRACO_SO_NO_COMENTARIO, SINTETICO)).toBe(1);
  });
});

/**
 * A segunda fonte, que nasceu quando o rótulo saiu do JSX.
 *
 * O nome do arquivo sintético aqui é `.ts` de propósito: é assim que o extrator
 * escolhe o dialeto, e um mapa num módulo sem JSX é justamente o caso novo.
 */
describe('o aparelho lendo rótulo que mora em mapa', () => {
  const MODULO = 'amostra-sintetica.ts';

  it('reprova o travessão dentro do mapa, nomeando a constante e a chave', () => {
    const achados = tracosEmRotulo(DEFEITO_EM_MAPA, MODULO);
    expect(achados).toHaveLength(1);
    expect(achados[0]?.atributo).toBe('ROTULOS_CAMPO_POSTO.anaEscalaInicio');
    expect(achados[0]?.valor).toBe('Escala — início');
  });

  it('aprova o mapa corrigido, tendo lido os dois rótulos', () => {
    expect(tracosEmRotulo(MAPA_CORRIGIDO, MODULO)).toEqual([]);
    // Presença antes de ausência: sem o desembrulho de `as const satisfies`
    // este número seria zero, e a aprovação acima seria cegueira do parser.
    expect(rotulosLidos(MAPA_CORRIGIDO, MODULO)).toBe(2);
  });

  it('não julga constante que não é de rótulo', () => {
    expect(rotulosLidos(CONSTANTE_QUE_NAO_E_ROTULO, MODULO)).toBe(0);
    expect(tracosEmRotulo(CONSTANTE_QUE_NAO_E_ROTULO, MODULO)).toEqual([]);
  });

  it('lê rótulo declarado solto, sem objeto em volta', () => {
    expect(rotulosLidos(ROTULO_SOLTO, MODULO)).toBe(1);
  });

  it('lê o mapa real de campos do posto, e não só o sintético', () => {
    const caminho = 'src/lib/rotulos-posto.ts';
    const lidos = rotulosLidos(readFileSync(path.join(RAIZ, caminho), 'utf8'), caminho);
    // O arquivo tem os campos vivos do cadastro mais os que saíram em
    // 03/09/2026. Piso, e não igualdade: campo novo no cadastro não deve
    // reprovar esta régua, que é de estilo de texto.
    expect(
      lidos,
      `o extrator leu ${lidos} rótulos em ${caminho}, e ali há dezenas`,
    ).toBeGreaterThan(30);
  });
});

describe('os módulos de `src/`', () => {
  const arquivos = arquivosDeFonte();

  it('tem a quantidade de arquivo de fonte que o projeto promete', () => {
    // Piso contra varredura vazia: `git ls-files` que devolve nada faria a
    // régua abaixo aprovar o repositório inteiro sem ler uma linha. Medido em
    // 23/09/2026: 196 `.tsx` mais 346 `.ts`, 542 no total.
    expect(
      arquivos.length,
      `a listagem de .ts e .tsx em src veio curta demais para ser o projeto real (${arquivos.length})`,
    ).toBeGreaterThan(400);
  });

  it('alcança módulo sem JSX, que é onde os mapas de rótulo moram', () => {
    /*
      Asserção de alcance, e não de conteúdo: a varredura listava só `.tsx`, e
      quando os trinta rótulos do formulário de posto passaram a vir de um `.ts`
      a régua ficou verde por não abrir o arquivo onde eles estavam escritos.

      A âncora é um módulo de rótulo que JÁ está versionado, e não o arquivo
      novo da mudança: a listagem vem do `git ls-files`, que por desenho não
      enxerga o que está por commitar, e uma asserção presa ao arquivo novo
      reprovaria por construção antes do commit e não mediria o filtro.
    */
    const tsSemJsx = arquivos.filter((caminho) => caminho.endsWith('.ts'));
    expect(tsSemJsx.length).toBeGreaterThan(100);
    expect(tsSemJsx).toContain('src/components/features/estoque/rotulos.ts');
  });

  it('tem rótulo de controle em quantidade de projeto real', () => {
    // Piso do extrator: se este número cair para perto de zero, o parser
    // quebrou e a asserção seguinte deixa de medir qualquer coisa.
    const lidos = arquivos.reduce(
      (soma, caminho) =>
        soma + rotulosLidos(readFileSync(path.join(RAIZ, caminho), 'utf8'), caminho),
      0,
    );
    expect(
      lidos,
      `o extrator leu ${lidos} rótulos em src, o que é pouco demais para este projeto`,
    ).toBeGreaterThan(100);
  });

  it('não deixa traço como separador em nenhum rótulo de controle', () => {
    const achados = arquivos.flatMap((caminho) =>
      tracosEmRotulo(readFileSync(path.join(RAIZ, caminho), 'utf8'), caminho).map(
        (a) => `${caminho}:${a.linha} ${a.atributo}="${a.valor}"`,
      ),
    );
    expect(
      achados,
      'rótulos com traço no lugar de vírgula, dois-pontos ou parêntese:\n' +
        achados.join('\n'),
    ).toEqual([]);
  });
});
