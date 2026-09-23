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
 * Lista os `.tsx` de `src/` pelo Git, mas lê o conteúdo do DISCO.
 *
 * Pelo Git para não varrer `node_modules` nem artefato gerado, e do disco para
 * a régua reprovar o caso que ainda está por commitar.
 */
function arquivosDeComponente(): string[] {
  const saida = execFileSync('git', ['ls-files', '-z', '--', 'src'], {
    cwd: RAIZ,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return saida.split('\0').filter((caminho) => caminho.endsWith('.tsx'));
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

describe('os componentes de `src/`', () => {
  const arquivos = arquivosDeComponente();

  it('tem a quantidade de arquivos de componente que o projeto promete', () => {
    // Piso contra varredura vazia: `git ls-files` que devolve nada faria a
    // régua abaixo aprovar o repositório inteiro sem ler uma linha.
    expect(
      arquivos.length,
      `a listagem de .tsx em src veio curta demais para ser o projeto real (${arquivos.length})`,
    ).toBeGreaterThan(150);
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
