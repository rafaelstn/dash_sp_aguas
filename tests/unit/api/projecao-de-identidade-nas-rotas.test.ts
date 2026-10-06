/**
 * Nenhum handler de rota entrega identificação de pessoa atrás de guarda fraca.
 *
 * Esta é a régua que impede o QUINTO caminho. Em 06/10/2026 a mesma projeção de
 * `auth.users` e a mesma trilha de estoque estavam alcançáveis por quatro rotas;
 * cada fechamento revelou a próxima, e nada reprovava a seguinte. O aparelho
 * está em `tests/apoio/projecao-de-identidade.ts` (por que AST e não substring
 * está escrito lá).
 *
 * O INVENTÁRIO VEM DO DISCO, e de `git ls-files`: rota nova commitada entra na
 * varredura sozinha, e artefato de build não entra. Sem git, este arquivo FALHA
 * em vez de medir menos (varredura silenciosamente vazia aprovaria tudo).
 *
 * OS DOIS LADOS, provados aqui:
 *   - reprova o defeito: sete casos sintéticos, um por porta dos fundos
 *     conhecida (guarda fraca, alias, namespace, acesso computado, guarda depois
 *     do uso, uso fora de handler, reexport), e MAIS a mutação da rota real que
 *     foi o caminho 4, que tem de voltar a reprovar quando a guarda sai;
 *   - aprova o legítimo: a árvore real inteira com zero achados, e quatro
 *     formas legítimas conhecidas, inclusive a rota que fica ABERTA e só omite a
 *     parte identificável (`unidades/[id]`, `conferencias/[id]/itens`).
 *
 * Piso contra leitura vazia: a varredura tem de achar os arquivos de rota e tem
 * de achar os handlers que REALMENTE alcançam a projeção, nomeados. Se um deles
 * for renomeado, isto falha e a lista se atualiza junto, em vez de a régua
 * emagrecer calada.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  analisarRota,
  handlersComProjecao,
  problemasDasExcecoes,
  type ArquivoDeRota,
  type ExcecaoDeclarada,
} from '../../apoio/projecao-de-identidade';

const RAIZ = path.resolve(__dirname, '../../..');

/**
 * Exceções declaradas. Vazia hoje, de propósito: as quatro rotas da classe estão
 * fechadas ou omitem a parte identificável. Entrada aqui exige motivo escrito e
 * documento que CITE a rota, porque conformidade por acidente se documenta.
 */
const EXCECOES: readonly ExcecaoDeclarada[] = [];

/**
 * Handlers que hoje alcançam a projeção, com a guarda de cada um. É a âncora de
 * presença da varredura: sem esta lista, uma régua que não encontrasse nada
 * ficaria verde.
 */
const PRESENCA_ESPERADA: ReadonlyArray<{ arquivo: string; handlers: readonly string[] }> = [
  { arquivo: 'src/app/api/estoque/movimentacoes/route.ts', handlers: ['GET', 'POST'] },
  { arquivo: 'src/app/api/estoque/export/route.ts', handlers: ['GET'] },
  { arquivo: 'src/app/api/estoque/unidades/[id]/route.ts', handlers: ['GET'] },
  { arquivo: 'src/app/api/estoque/conferencias/[id]/itens/route.ts', handlers: ['GET'] },
  // Só o GET: as outras rotas de gestão de usuário chamam método que não
  // projeta identidade (`existe`, `definirPapel`, `contarSuperAdmins`), e a
  // lista de métodos sensíveis está medida em `METODOS_SENSIVEIS`.
  { arquivo: 'src/app/api/admin/usuarios/route.ts', handlers: ['GET'] },
];

const PISO_DE_ROTAS = 60;

function rotasDoDisco(): ArquivoDeRota[] {
  let saida: string;
  try {
    saida = execFileSync('git', ['ls-files', 'src/app/api'], {
      cwd: RAIZ,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error(
      `a varredura depende de git ls-files e ele falhou; sem inventário esta régua não mede nada: ${String(e)}`,
    );
  }
  const caminhos = saida
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('/route.ts') || l.endsWith('/route.tsx'));
  return caminhos.map((caminho) => ({
    caminho,
    // Conteúdo do DISCO, não do índice: a régua julga o que está escrito agora.
    codigo: readFileSync(path.join(RAIZ, caminho), 'utf8'),
  }));
}

const ROTAS = rotasDoDisco();

function mensagem(achados: ReturnType<typeof analisarRota>): string {
  return achados
    .map((a) => `${a.arquivo}::${a.handler} linha ${a.linha} (${a.simbolo}, ${a.motivo})`)
    .join('\n');
}

const ESCOPOS_PERMITIDOS = new Set(EXCECOES.map((e) => e.escopo));

describe('a varredura alcança o que deveria', () => {
  it('acha os arquivos de rota pelo git', () => {
    expect(ROTAS.length, 'git ls-files não devolveu rotas').toBeGreaterThanOrEqual(PISO_DE_ROTAS);
  });

  it('acha os handlers que realmente alcançam a projeção, nomeados', () => {
    for (const esperado of PRESENCA_ESPERADA) {
      const arquivo = ROTAS.find((r) => r.caminho === esperado.arquivo);
      expect(arquivo, `rota ${esperado.arquivo} saiu do inventário`).toBeDefined();
      const handlers = handlersComProjecao(arquivo!).sort();
      expect(handlers, `handlers com projeção em ${esperado.arquivo}`).toEqual(
        [...esperado.handlers].sort(),
      );
    }
  });

  it('o código lido é o do disco, e não um recorte vazio', () => {
    const vazios = ROTAS.filter((r) => r.codigo.trim().length === 0);
    expect(vazios.map((v) => v.caminho)).toEqual([]);
  });
});

describe('a árvore real não tem rota aberta sobre a projeção de identidade', () => {
  it('zero achados fora das exceções declaradas', () => {
    const achados = ROTAS.flatMap(analisarRota).filter(
      (a) => !ESCOPOS_PERMITIDOS.has(`${a.arquivo}::${a.handler}`),
    );
    expect(achados, `rotas entregando identificação atrás de guarda fraca:\n${mensagem(achados)}`)
      .toEqual([]);
  });

  it('a mutação da rota que foi o caminho 4 volta a reprovar', () => {
    // Prova que a régua MORDE o defeito real, e não só o sintético: tira a
    // recusa antecipada do handler e o resto do arquivo continua idêntico.
    const alvo = ROTAS.find(
      (r) => r.caminho === 'src/app/api/estoque/conferencias/[id]/itens/route.ts',
    );
    expect(alvo, 'a rota do caminho 4 saiu do inventário').toBeDefined();
    const GUARDA = 'if (!(await podeGerenciarEstoque(auth.id))) {';
    expect(alvo!.codigo, 'a âncora da mutação não existe mais no arquivo').toContain(GUARDA);
    const mutado = alvo!.codigo.replace(GUARDA, 'if (false as boolean) {');
    const achados = analisarRota({ caminho: alvo!.caminho, codigo: mutado });
    expect(achados.map((a) => `${a.handler}:${a.motivo}`)).toContain('GET:sem_guarda_forte');
  });
});

/** Casos sintéticos: cada porta dos fundos conhecida, uma a uma. */
const IMPORTS = `
import { NextResponse, type NextRequest } from 'next/server';
import { exigirUsuario, exigirGestorEstoque, exigirAdmin } from '@/app/api/_helpers/auth';
import { podeGerenciarEstoque } from '@/infrastructure/auth/permissao-estoque';
import { usuariosIdentidadeRepository, usuariosAdminRepository } from '@/infrastructure/repositories';
import { resolverOperadores } from '@/application/use-cases/estoque/resolver-operadores';
`;

const DEFEITOS: ReadonlyArray<{ nome: string; codigo: string; motivo: string }> = [
  {
    nome: 'guarda fraca com a projeção no corpo (o caminho 4 original)',
    motivo: 'sem_guarda_forte',
    codigo: `${IMPORTS}
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { operadores } = await resolverOperadores(usuariosIdentidadeRepository, []);
  return NextResponse.json({ operadores: [...operadores] });
}`,
  },
  {
    nome: 'import com alias',
    motivo: 'sem_guarda_forte',
    codigo: `
import { NextResponse, type NextRequest } from 'next/server';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { resolverOperadores as resolver } from '@/application/use-cases/estoque/resolver-operadores';
import { usuariosIdentidadeRepository as ident } from '@/infrastructure/repositories';
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await resolver(ident, []));
}`,
  },
  {
    nome: 'import de namespace',
    motivo: 'sem_guarda_forte',
    codigo: `
import { NextResponse, type NextRequest } from 'next/server';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import * as uc from '@/application/use-cases/estoque/resolver-operadores';
import * as repos from '@/infrastructure/repositories';
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await uc.resolverOperadores(repos.usuariosIdentidadeRepository, []));
}`,
  },
  {
    nome: 'acesso computado sobre o namespace',
    motivo: 'indecidivel',
    codigo: `
import { NextResponse, type NextRequest } from 'next/server';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import * as uc from '@/application/use-cases/estoque/resolver-operadores';
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const f = uc['resolverOperadores'];
  return NextResponse.json(await f(null as never, []));
}`,
  },
  {
    nome: 'guarda DEPOIS do uso',
    motivo: 'guarda_depois_do_uso',
    codigo: `${IMPORTS}
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { operadores } = await resolverOperadores(usuariosIdentidadeRepository, []);
  if (!(await podeGerenciarEstoque(auth.id))) return NextResponse.json({ itens: [] });
  return NextResponse.json({ operadores: [...operadores] });
}`,
  },
  {
    nome: 'projeção escondida em helper do próprio arquivo',
    motivo: 'indecidivel',
    codigo: `${IMPORTS}
async function enriquecer() {
  return resolverOperadores(usuariosIdentidadeRepository, []);
}
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await enriquecer());
}`,
  },
  {
    nome: 'reexport da projeção pelo arquivo de rota',
    motivo: 'indecidivel',
    codigo: `
import { NextResponse } from 'next/server';
export { resolverOperadores } from '@/application/use-cases/estoque/resolver-operadores';
export async function GET() {
  return NextResponse.json({ ok: true });
}`,
  },
];

const LEGITIMOS: ReadonlyArray<{ nome: string; codigo: string }> = [
  {
    nome: 'guarda forte no handler',
    codigo: `${IMPORTS}
export async function GET(request: NextRequest) {
  const auth = await exigirGestorEstoque();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await resolverOperadores(usuariosIdentidadeRepository, []));
}`,
  },
  {
    nome: 'rota aberta com recusa antecipada ANTES da projeção (unidades/[id])',
    codigo: `${IMPORTS}
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const unidade = { id: '1' };
  if (!(await podeGerenciarEstoque(auth.id))) {
    return NextResponse.json({ unidade, historico: null, historicoVisivel: false });
  }
  return NextResponse.json({
    unidade,
    historico: await resolverOperadores(usuariosIdentidadeRepository, []),
  });
}`,
  },
  {
    nome: 'leitura de catálogo sem projeção nenhuma',
    codigo: `
import { NextResponse, type NextRequest } from 'next/server';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { estoqueMateriaisRepository } from '@/infrastructure/repositories';
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await estoqueMateriaisRepository.listar({}));
}`,
  },
  {
    nome: 'gestão de usuários atrás de exigirAdmin',
    codigo: `${IMPORTS}
export async function GET() {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ usuarios: await usuariosAdminRepository.listar() });
}`,
  },
];

describe('a régua reprova o defeito', () => {
  it('os sete casos de defeito estão na varredura', () => {
    expect(DEFEITOS).toHaveLength(7);
  });

  for (const caso of DEFEITOS) {
    it(`reprova: ${caso.nome}`, () => {
      const achados = analisarRota({ caminho: 'src/app/api/sintetico/route.ts', codigo: caso.codigo });
      expect(achados.length, `não reprovou:\n${caso.codigo}`).toBeGreaterThanOrEqual(1);
      expect(achados.map((a) => a.motivo)).toContain(caso.motivo);
    });
  }
});

describe('a régua aprova o legítimo', () => {
  it('os quatro casos legítimos estão na varredura', () => {
    expect(LEGITIMOS).toHaveLength(4);
  });

  for (const caso of LEGITIMOS) {
    it(`aprova: ${caso.nome}`, () => {
      const achados = analisarRota({ caminho: 'src/app/api/sintetico/route.ts', codigo: caso.codigo });
      expect(achados, `reprovou o legítimo:\n${mensagem(achados)}`).toEqual([]);
    });
  }
});

describe('a lista de exceções carrega o escopo', () => {
  const existe = (p: string) => existsSync(path.join(RAIZ, p));
  const cita = (p: string, rota: string) => readFileSync(path.join(RAIZ, p), 'utf8').includes(rota);

  it('as exceções declaradas hoje estão íntegras', () => {
    expect(problemasDasExcecoes(EXCECOES, existe, cita)).toEqual([]);
  });

  it('a validação da lista reprova entrada ruim (a lista está vazia hoje)', () => {
    // Estado de partida vazio faz opostos passarem: sem este caso, a validação
    // poderia estar quebrada e ninguém saberia até a primeira exceção real.
    const ruins: ExcecaoDeclarada[] = [
      { escopo: 'src/app/api/x/route.ts', motivo: 'curto', doc: 'docs/seguranca/direitos-do-titular-lgpd.md' },
      { escopo: 'src/app/api/x/route.ts::GET', motivo: 'curto', doc: 'docs/seguranca/direitos-do-titular-lgpd.md' },
      {
        escopo: 'src/app/api/x/route.ts::GET',
        motivo: 'motivo suficientemente longo para passar da exigência de quarenta caracteres',
        doc: 'docs/que-nao-existe.md',
      },
      {
        escopo: 'src/app/api/x/route.ts::GET',
        motivo: 'motivo suficientemente longo para passar da exigência de quarenta caracteres',
        doc: 'docs/seguranca/direitos-do-titular-lgpd.md',
      },
    ];
    const problemas = problemasDasExcecoes(ruins, existe, cita);
    // Cada tipo de defeito aparece, e a contagem é dita para a asserção não
    // ficar verde por um problema a mais ou a menos: a entrada 2 produz DOIS
    // (motivo curto e doc que não cita a rota), e as outras três, um cada.
    expect(problemas, problemas.join(' | ')).toHaveLength(5);
    for (const esperado of [
      'escopo sem handler',
      'motivo curto',
      'doc inexistente',
      'doc nao cita a rota',
    ]) {
      expect(problemas.some((p) => p.includes(esperado)), `faltou: ${esperado}`).toBe(true);
    }
  });
});
