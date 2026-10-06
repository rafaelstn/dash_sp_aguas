import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  usosDePermissao,
  violacoesDePermissao,
  type ArquivoVarrido,
} from '../../../apoio/uso-de-permissao-estoque';

/**
 * Escopo da escrita sem login (revisão do André, 16/09/2026, ADR 0024 3.2.1).
 *
 * `exigirGestorEstoque` e `podeGerenciarEstoque` liberam escrita ao usuário
 * institucional da janela sem identidade. Fora do estoque isso seria escrita
 * anônima em triagem, postos ou administração. O comentário do helper pedia
 * "use só no estoque"; esta régua é o que reprova quando alguém esquecer.
 *
 * MEDIDOR TROCADO EM 06/10/2026 (André). A versão de 16/09 procurava os nomes
 * por regex no texto CRU do arquivo, então comentário que explicava qual gate
 * protege a rota contava como uso: ela reprovou quatro comentários legítimos da
 * Fernanda e o conserto que ela sugeria era apagar a explicação. A lista de
 * PERMITIDOS continua a mesma, byte por byte; o que mudou é o aparelho, que
 * agora é AST (`tests/apoio/uso-de-permissao-estoque.ts`): o fato é import,
 * reexport ou chamada, e citação em comentário ou em string não é uso.
 *
 * Cobertura mantida da versão textual: import nomeado, import com alias,
 * reexport, import do módulo `permissao-estoque` (inclusive relativo) e
 * `import * as` do helper de auth, que abre o acesso sem citar o nome.
 */

const RAIZ = join(__dirname, '..', '..', '..', '..');
const SRC = join(RAIZ, 'src');

const PERMITIDOS = [
  /^src\/app\/api\/estoque\//,
  /^src\/app\/\(dashboard\)\/estoque\//,
  /^src\/app\/api\/_helpers\/auth\.ts$/,
  /^src\/infrastructure\/auth\/permissao-estoque\.ts$/,
];

/**
 * Piso contra leitura vazia, medido em 06/10/2026 com o medidor AST: 22
 * arquivos de `src/` alcançam a permissão (21 do estoque mais o helper de
 * auth que a expõe). O piso é menor que o medido de
 * propósito (refatoração legítima mexe nesse número), mas se a varredura
 * quebrar, o inventário vier vazio ou o medidor parar de reconhecer import, a
 * régua falha aqui em vez de aprovar o mundo por não ter lido nada.
 */
const PISO_DE_USOS = 15;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx|js|mjs)$/.test(nome) ? [caminho] : [];
  });
}

export function violacoes(lista: ArquivoVarrido[]): string[] {
  return violacoesDePermissao(lista, PERMITIDOS).map(({ caminho }) => caminho);
}

describe('permissão de escrita sem login fica restrita ao estoque', () => {
  const todos: ArquivoVarrido[] = arquivos(SRC).map((abs) => ({
    caminho: relative(RAIZ, abs).split(sep).join('/'),
    conteudo: readFileSync(abs, 'utf8'),
  }));

  const comUso = todos.filter((a) => usosDePermissao(a).length > 0);

  it('a varredura alcança os usos legítimos (sem isso, zero violações não prova nada)', () => {
    expect(todos.length, 'a varredura de src/ voltou vazia').toBeGreaterThan(100);
    expect(comUso.some((u) => u.caminho === 'src/app/api/estoque/desconformidades/[id]/route.ts')).toBe(true);
    expect(comUso.some((u) => u.caminho.startsWith('src/app/(dashboard)/estoque/'))).toBe(true);
    expect(comUso.length, `arquivos que alcançam a permissão: ${comUso.map((u) => u.caminho).join(', ')}`).toBeGreaterThanOrEqual(PISO_DE_USOS);
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

  it('reprova import do módulo por caminho relativo, que o medidor textual não pegava', () => {
    expect(
      violacoes([
        {
          caminho: 'src/app/api/triagem/[id]/route.ts',
          conteudo: "import { podeGerenciarEstoque } from '../../../../infrastructure/auth/permissao-estoque';",
        },
      ]),
    ).toEqual(['src/app/api/triagem/[id]/route.ts']);
  });

  it('APROVA arquivo fora do escopo que só CITA o nome em comentário, string ou texto de tela', () => {
    const controle: ArquivoVarrido[] = [
      {
        caminho: 'src/components/features/estoque/trilha.tsx',
        conteudo: [
          '// Esta tela é só leitura: a escrita exige exigirGestorEstoque na rota,',
          '// e quem resolve isso é podeGerenciarEstoque, nunca o componente.',
          '/** @see src/infrastructure/auth/permissao-estoque.ts */',
          "export const AVISO = 'sem podeGerenciarEstoque você não edita';",
          "export const DOC = '@/infrastructure/auth/permissao-estoque';",
        ].join('\n'),
      },
      {
        caminho: 'docs-no-src/x.ts',
        conteudo: '// import { exigirGestorEstoque } from "@/app/api/_helpers/auth";',
      },
    ];
    expect(violacoes(controle)).toEqual([]);
  });

  it('o controle que cita e o que importa diferem só pela forma, e o medidor separa os dois', () => {
    const MESMO_ARQUIVO = 'src/app/api/triagem/route.ts';
    const citacao = { caminho: MESMO_ARQUIVO, conteudo: '// usa exigirGestorEstoque? não, nunca.' };
    const importacao = {
      caminho: MESMO_ARQUIVO,
      conteudo: "import { exigirGestorEstoque } from '@/app/api/_helpers/auth';\nexport const GET = exigirGestorEstoque;",
    };
    expect(violacoes([citacao])).toEqual([]);
    expect(violacoes([importacao])).toEqual([MESMO_ARQUIVO]);
  });

  it('reconhece a forma de cada uso, para a mensagem da falha não ser adivinhação', () => {
    const formas = (conteudo: string) =>
      usosDePermissao({ caminho: 'src/app/api/triagem/route.ts', conteudo }).map((u) => u.forma);

    expect(formas("import { exigirGestorEstoque } from '@/app/api/_helpers/auth';")).toEqual(['import_nomeado']);
    expect(formas("import { podeGerenciarEstoque as pode } from '@/x';")).toEqual(['import_nomeado']);
    expect(formas("import * as a from '@/app/api/_helpers/auth';")).toEqual(['import_namespace_do_auth']);
    expect(formas("import { x } from '@/infrastructure/auth/permissao-estoque';")).toEqual(['import_do_modulo']);
    expect(formas("export { podeGerenciarEstoque } from '@/x';")).toEqual(['reexport']);
    expect(formas('const ok = await podeGerenciarEstoque(id);')).toEqual(['chamada']);
    expect(formas('const ok = await a.exigirGestorEstoque(req);')).toEqual(['chamada']);
    expect(formas('// exigirGestorEstoque e podeGerenciarEstoque são do estoque')).toEqual([]);
    expect(formas("const t = 'podeGerenciarEstoque';")).toEqual([]);
  });
});
