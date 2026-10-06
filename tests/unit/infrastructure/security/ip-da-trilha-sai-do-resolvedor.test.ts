import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  leiturasDeHeaderDeIp,
  leiturasForaDoResolvedor,
  type ArquivoVarrido,
} from '../../../apoio/leitura-de-header-de-ip';

/**
 * O IP que vai para trilha e para rate limit sai do resolvedor, não do header
 * cru (achado do André, 06/10/2026).
 *
 * As seis cópias que existiam liam o PRIMEIRO elemento de `x-forwarded-for`,
 * que é o pedaço que o cliente controla: quem chamasse escolhia o IP que a
 * trilha do órgão ia registrar. Consertar as seis sem deixar régua faz a sétima
 * nascer na próxima rota, porque o idioma é curto e parece inofensivo.
 *
 * Aparelho em `tests/apoio/leitura-de-header-de-ip.ts`, por AST: o fato é a
 * CHAMADA `.get('<header>')`, e citar o nome do header em comentário (como os
 * docblocks dos consertos de hoje fazem) não é leitura. O que ela não mede está
 * escrito lá: `get` com nome dinâmico.
 */

const RAIZ = join(__dirname, '..', '..', '..', '..');
const SRC = join(RAIZ, 'src');

/**
 * Quem pode ler header de IP, e por quê:
 *
 * - `rate-limit.ts` É o resolvedor. Ordem de confiança e a razão de pegar o
 *   ÚLTIMO elemento da cadeia estão no docblock dele.
 * - `estoque/_rl.ts` lê SÓ `x-real-ip`, de propósito e com justificativa
 *   escrita: no Nginx do órgão esse header é sobrescrito com `$remote_addr`, e
 *   ali a chave de rate limit não pode cair no `x-vercel-forwarded-for` que o
 *   resolvedor genérico prefere. Exceção com escopo, não exceção aberta.
 */
const PERMITIDOS = [
  /^src\/infrastructure\/security\/rate-limit\.ts$/,
  /^src\/app\/api\/estoque\/_rl\.ts$/,
];

/**
 * Piso contra leitura vazia. Medido em 06/10/2026: `rate-limit.ts` lê os três
 * headers da cadeia e `_rl.ts` lê um, somando 4 leituras legítimas. O piso é 3
 * para refatoração legítima do resolvedor não derrubar a régua, mas se a
 * varredura quebrar, o AST parar de reconhecer a chamada ou a lista vier vazia,
 * a régua falha aqui em vez de aprovar o mundo por não ter lido nada.
 */
const PISO_DE_LEITURAS = 3;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx|js|mjs)$/.test(nome) ? [caminho] : [];
  });
}

function violacoes(lista: ArquivoVarrido[]): string[] {
  return leiturasForaDoResolvedor(lista, PERMITIDOS).map(
    ({ caminho, header, linha }) => `${caminho}:${linha} lê ${header}`,
  );
}

describe('header de IP só é lido pelo resolvedor', () => {
  const todos: ArquivoVarrido[] = arquivos(SRC).map((abs) => ({
    caminho: relative(RAIZ, abs).split(sep).join('/'),
    conteudo: readFileSync(abs, 'utf8'),
  }));

  const leituras = todos.flatMap((a) => leiturasDeHeaderDeIp(a));

  it('a varredura alcança as leituras legítimas (sem isso, zero violações não prova nada)', () => {
    expect(todos.length, 'a varredura de src/ voltou vazia').toBeGreaterThan(100);
    expect(
      leituras.filter((l) => l.caminho === 'src/infrastructure/security/rate-limit.ts'),
      'o resolvedor parou de ser reconhecido pelo medidor',
    ).not.toHaveLength(0);
    expect(
      leituras.length,
      `leituras encontradas: ${leituras.map((l) => `${l.caminho}:${l.linha}`).join(', ')}`,
    ).toBeGreaterThanOrEqual(PISO_DE_LEITURAS);
  });

  it('nenhuma rota, página ou componente lê o header por fora', () => {
    expect(violacoes(todos)).toEqual([]);
  });

  it('reprova as seis formas que existiam em 06/10/2026, e o receptor não importa', () => {
    expect(
      violacoes([
        {
          caminho: 'src/app/api/postos/[prefixo]/route.ts',
          conteudo:
            "const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;",
        },
        {
          caminho: 'src/app/(dashboard)/postos/[prefixo]/page.tsx',
          conteudo: "const h = await headers();\nconst ip = h.get('x-real-ip');",
        },
        {
          caminho: 'src/app/api/x/route.ts',
          conteudo: "const ip = req.raw.headers.get('x-vercel-forwarded-for');",
        },
        {
          caminho: 'src/lib/y.ts',
          conteudo: 'const ip = h.get(`cf-connecting-ip`);',
        },
        {
          caminho: 'src/lib/z.ts',
          conteudo: "const ip = h['get']('x-forwarded-for');",
        },
        {
          caminho: 'src/lib/w.ts',
          conteudo: "const ip = h.get('X-Forwarded-For');",
        },
      ]),
    ).toHaveLength(6);
  });

  it('APROVA quem só CITA o header em comentário, string ou nome de variável', () => {
    const controle: ArquivoVarrido[] = [
      {
        caminho: 'src/app/api/postos/[prefixo]/arquivos/route.ts',
        conteudo: [
          '// O IP vinha do PRIMEIRO elemento de `x-forwarded-for`, que o cliente',
          '// controla; agora sai de extrairIpOuNulo.',
          "export const DOC = 'x-forwarded-for é forjável';",
          "const xForwardedFor = 'documentado em rate-limit.ts';",
          "const ip = h.get('user-agent');",
        ].join('\n'),
      },
    ];
    expect(violacoes(controle)).toEqual([]);
  });

  it('o controle que cita e o que lê diferem só pela forma, e o medidor separa os dois', () => {
    const MESMO = 'src/app/api/triagem/route.ts';
    const citacao = { caminho: MESMO, conteudo: "// confia em 'x-forwarded-for'? nunca." };
    const leitura = { caminho: MESMO, conteudo: "const ip = h.get('x-forwarded-for');" };
    expect(violacoes([citacao])).toEqual([]);
    expect(violacoes([leitura])).toHaveLength(1);
  });
});
