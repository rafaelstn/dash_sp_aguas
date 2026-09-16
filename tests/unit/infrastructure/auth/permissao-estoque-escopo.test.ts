import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Escopo da escrita sem login (revisão do André, 16/09/2026, ADR 0024 3.2.1).
 *
 * `exigirGestorEstoque` e `podeGerenciarEstoque` liberam escrita ao usuário
 * institucional da janela sem identidade. Fora do estoque isso seria escrita
 * anônima em triagem, postos ou administração. O comentário do helper pedia
 * "use só no estoque"; esta régua é o que reprova quando alguém esquecer.
 *
 * Varre `src/` inteiro por NOME (pega import com alias, reexportação e
 * chamada) e por import do módulo `permissao-estoque` e de `* as` do helper
 * de auth, que abririam o acesso sem citar o nome.
 */

const RAIZ = join(__dirname, '..', '..', '..', '..');
const SRC = join(RAIZ, 'src');

const PERMITIDOS = [
  /^src\/app\/api\/estoque\//,
  /^src\/app\/\(dashboard\)\/estoque\//,
  /^src\/app\/api\/_helpers\/auth\.ts$/,
  /^src\/infrastructure\/auth\/permissao-estoque\.ts$/,
];

const SINAIS = [
  /\bexigirGestorEstoque\b/,
  /\bpodeGerenciarEstoque\b/,
  /['"]@\/infrastructure\/auth\/permissao-estoque['"]/,
  /import\s+\*\s+as\s+\w+\s+from\s+['"]@\/app\/api\/_helpers\/auth['"]/,
];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx|js|mjs)$/.test(nome) ? [caminho] : [];
  });
}

export function violacoes(lista: { caminho: string; conteudo: string }[]): string[] {
  return lista
    .filter(({ caminho }) => !PERMITIDOS.some((p) => p.test(caminho)))
    .filter(({ conteudo }) => SINAIS.some((s) => s.test(conteudo)))
    .map(({ caminho }) => caminho);
}

describe('permissão de escrita sem login fica restrita ao estoque', () => {
  const todos = arquivos(SRC).map((abs) => ({
    caminho: relative(RAIZ, abs).split(sep).join('/'),
    conteudo: readFileSync(abs, 'utf8'),
  }));

  it('a varredura alcança os usos legítimos (sem isso, zero violações não prova nada)', () => {
    const usos = todos.filter(({ conteudo }) => SINAIS.some((s) => s.test(conteudo)));
    expect(usos.some((u) => u.caminho === 'src/app/api/estoque/desconformidades/[id]/route.ts')).toBe(true);
    expect(usos.some((u) => u.caminho.startsWith('src/app/(dashboard)/estoque/'))).toBe(true);
    expect(usos.length).toBeGreaterThanOrEqual(15);
  });

  it('nenhum arquivo fora do estoque usa os helpers', () => {
    expect(violacoes(todos)).toEqual([]);
  });

  it('reprova uso em rota de triagem, alias, namespace e import do módulo', () => {
    expect(
      violacoes([
        { caminho: 'src/app/api/triagem/route.ts', conteudo: "import { exigirGestorEstoque } from '@/app/api/_helpers/auth';" },
        { caminho: 'src/app/api/postos/route.ts', conteudo: "import { exigirGestorEstoque as gate } from '../_helpers/auth';" },
        { caminho: 'src/app/api/admin/x/route.ts', conteudo: "import * as a from '@/app/api/_helpers/auth';" },
        { caminho: 'src/lib/x.ts', conteudo: "export * from '@/infrastructure/auth/permissao-estoque';" },
        { caminho: 'src/app/api/estoque-falso/route.ts', conteudo: 'podeGerenciarEstoque(id)' },
      ]),
    ).toHaveLength(5);
  });
});
