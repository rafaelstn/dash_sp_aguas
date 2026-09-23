/**
 * Controle que esconde o próprio rótulo num breakpoint continua tendo nome.
 *
 * O defeito real, achado em 23/09/2026 no botão "Limpar" da cesta de comparação
 * (`src/components/features/monitor/CestaComparacao.tsx`): o rótulo estava num
 * `<span className="hidden sm:inline">`, o ícone ao lado é `aria-hidden`, e o
 * botão não tinha `aria-label`. Abaixo de 640 px, que é exatamente a largura do
 * celular do técnico de campo, aquele botão ficava SEM NOME ACESSÍVEL: o leitor
 * de tela anuncia "botão" e nada mais. WCAG 4.1.2, e e-MAG é lei em governo.
 *
 * Por que a régua é estática e não de renderização: no jsdom o CSS do Tailwind
 * não é aplicado, então `hidden sm:inline` não vira `display: none`, o texto
 * continua no DOM e o axe APROVA o defeito. Régua por renderização mediria a
 * propriedade vizinha.
 *
 * Por que por AST e não por substring: `className` montado por template literal
 * ou por `clsx` é justamente onde a classe se esconde de uma busca textual, e a
 * busca textual ainda colhe a classe citada dentro de comentário (o próprio
 * arquivo corrigido cita `hidden sm:inline` num comentário, na linha 106).
 *
 * Régua nova é suspeita até reprovar o defeito E aprovar o legítimo, então este
 * arquivo prova primeiro o aparelho, inclusive com a fuga pelo template
 * literal, e só depois julga o `src/`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  controlesQueEscondemRotulo,
  rotulosSemNome,
} from '../apoio/rotulo-escondido';

/** O defeito como ele estava antes da correção de 23/09/2026. */
const DEFEITO = `
export function Cesta() {
  return (
    <button type="button" onClick={limpar} className="inline-flex items-center gap-1.5">
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Limpar</span>
    </button>
  );
}
`;

/** O padrão correto da casa, o mesmo de `TelaPostos.tsx`. */
const COM_CONTRAPARTE = `
export function Cesta() {
  return (
    <button type="button" onClick={limpar} className="inline-flex items-center gap-1.5">
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Limpar</span>
      <span className="sr-only sm:hidden">Limpar</span>
    </button>
  );
}
`;

/** O outro jeito legítimo: o nome vem do próprio controle. */
const COM_ARIA_LABEL = `
export function Menu() {
  return (
    <button type="button" aria-label="Exportar o diagrama">
      <Download className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Exportar</span>
    </button>
  );
}
`;

/**
 * A porta dos fundos que uma busca por substring deixaria aberta.
 *
 * A classe que esconde o rótulo nunca aparece como string literal contígua com
 * o resto: está partida entre um template literal e os argumentos de `clsx`.
 */
const DEFEITO_POR_TEMPLATE = `
export function Cesta({ compacto }: { compacto: boolean }) {
  return (
    <button type="button" className={clsx('inline-flex', compacto && 'px-2')}>
      <Trash2 className="h-4 w-4" aria-hidden="true" />
      <span className={\`\${base} hidden md:inline\`}>Limpar</span>
    </button>
  );
}
`;

/** A classe citada em comentário não é marcação, e não deve virar achado. */
const CLASSE_SO_NO_COMENTARIO = `
/** O rodapé é \`hidden sm:inline\` no desktop, por decisão de layout. */
export function Rodape() {
  return (
    <button type="button" onClick={fechar}>
      Fechar
    </button>
  );
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
  return saida
    .split('\0')
    .filter((caminho) => caminho.endsWith('.tsx'));
}

describe('o aparelho que acha rótulo escondido', () => {
  it('reprova o botão cujo rótulo sai do DOM abaixo do breakpoint', () => {
    const achados = rotulosSemNome(DEFEITO, SINTETICO);
    expect(achados).toHaveLength(1);
    expect(achados[0]?.tag).toBe('button');
    expect(achados[0]?.breakpoint).toBe('sm');
    expect(achados[0]?.classeQueEsconde).toBe('hidden sm:inline');
  });

  it('aprova o mesmo botão com a contraparte `sr-only sm:hidden`', () => {
    expect(rotulosSemNome(COM_CONTRAPARTE, SINTETICO)).toEqual([]);
    // Presença antes de ausência: o aparelho tem que estar VENDO este botão,
    // senão a aprovação acima é cegueira e não conformidade.
    expect(controlesQueEscondemRotulo(COM_CONTRAPARTE, SINTETICO)).toBe(1);
  });

  it('aprova o botão nomeado por `aria-label`', () => {
    expect(rotulosSemNome(COM_ARIA_LABEL, SINTETICO)).toEqual([]);
    expect(controlesQueEscondemRotulo(COM_ARIA_LABEL, SINTETICO)).toBe(1);
  });

  it('fecha a porta dos fundos do className montado por template e por clsx', () => {
    const achados = rotulosSemNome(DEFEITO_POR_TEMPLATE, SINTETICO);
    expect(achados).toHaveLength(1);
    expect(achados[0]?.breakpoint).toBe('md');
  });

  it('não confunde a classe citada em comentário com marcação', () => {
    expect(rotulosSemNome(CLASSE_SO_NO_COMENTARIO, SINTETICO)).toEqual([]);
    expect(controlesQueEscondemRotulo(CLASSE_SO_NO_COMENTARIO, SINTETICO)).toBe(0);
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

  it('esconde rótulo em pelo menos um controle, que é o que a régua mede', () => {
    // Piso do extrator: se este número virar zero, ou o padrão saiu do projeto
    // ou o parser quebrou, e nos dois casos a asserção seguinte deixa de medir.
    const comPadrao = arquivos.filter(
      (caminho) =>
        controlesQueEscondemRotulo(
          readFileSync(path.join(RAIZ, caminho), 'utf8'),
          caminho,
        ) > 0,
    );
    expect(
      comPadrao.length,
      'nenhum controle de src esconde rótulo por breakpoint: o extrator provavelmente quebrou',
    ).toBeGreaterThan(0);
  });

  it('não deixa nenhum controle sem nome acessível abaixo do breakpoint', () => {
    const achados = arquivos.flatMap((caminho) =>
      rotulosSemNome(readFileSync(path.join(RAIZ, caminho), 'utf8'), caminho).map(
        (a) =>
          `${caminho}:${a.linha} <${a.tag}> esconde o rótulo com "${a.classeQueEsconde}" ` +
          `e não tem nem "sr-only ${a.breakpoint}:hidden" nem aria-label`,
      ),
    );
    expect(
      achados,
      `controles que perdem o nome acessível abaixo do breakpoint (WCAG 4.1.2):\n${achados.join('\n')}`,
    ).toEqual([]);
  });
});
