/**
 * Quem ALCANÇA a permissão de escrita sem login do estoque, medido por AST.
 *
 * POR QUE ESTE APARELHO SUBSTITUIU A BUSCA TEXTUAL
 * ------------------------------------------------
 * A régua anterior (`tests/unit/infrastructure/auth/permissao-estoque-escopo.test.ts`,
 * de 16/09/2026) procurava o NOME `exigirGestorEstoque` ou `podeGerenciarEstoque`
 * no texto cru de cada arquivo de `src/`. Em 06/10/2026 ela reprovou quatro
 * comentários da Fernanda que só diziam qual gate protege a rota, e o conserto
 * que ela sugeria era apagar a explicação: régua que mede a FORMA reprova o
 * correto e manda piorar o código. O fato que importa é import, reexport ou
 * CHAMADA; citação em comentário ou em string não alcança permissão nenhuma.
 *
 * O que ele reprova, e que a busca textual também pegava: import com alias,
 * reexport, import do módulo da permissão (inclusive por caminho relativo) e
 * `import * as` do helper de auth, que abre o acesso sem citar o nome.
 *
 * O que ele NÃO mede: se a permissão é usada CORRETAMENTE onde é permitida (isso
 * é das réguas de rota), nem tipo (não é type-checker). Chamada de nome igual
 * sem import nenhum é reprovada de propósito, fail-closed.
 */
import ts from 'typescript';

export interface ArquivoVarrido {
  /** Caminho relativo à raiz, com barra normal. */
  caminho: string;
  conteudo: string;
}

/** Como um arquivo alcança a permissão. */
export type FormaDeUso =
  | 'import_nomeado'
  | 'import_namespace_do_auth'
  | 'import_do_modulo'
  | 'reexport'
  | 'chamada';

export interface UsoDePermissao {
  caminho: string;
  forma: FormaDeUso;
  /** Nome ou especificador que denuncia o uso, para a mensagem da falha. */
  detalhe: string;
  /** Linha base 1. */
  linha: number;
}

/** Os dois símbolos que liberam escrita ao usuário institucional da janela. */
const SIMBOLOS = new Set(['exigirGestorEstoque', 'podeGerenciarEstoque']);

const MODULO_PERMISSAO = /(^|\/)infrastructure\/auth\/permissao-estoque$/;
const MODULO_AUTH_HELPER = /(^|\/)app\/api\/_helpers\/auth$/;

/** Resolve `@/x`, `./x` e `../x` para caminho relativo à raiz, sem extensão. */
function normalizarEspecificador(especificador: string, caminhoDoArquivo: string): string {
  if (especificador.startsWith('@/')) return `src/${especificador.slice(2)}`;
  if (!especificador.startsWith('.')) return especificador;
  const partes = caminhoDoArquivo.split('/').slice(0, -1);
  for (const pedaco of especificador.split('/')) {
    if (pedaco === '.' || pedaco === '') continue;
    if (pedaco === '..') partes.pop();
    else partes.push(pedaco);
  }
  return partes.join('/');
}

function linhaDe(no: ts.Node, fonte: ts.SourceFile): number {
  return fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1;
}

/** Todas as formas pelas quais este arquivo alcança a permissão. */
export function usosDePermissao(arquivo: ArquivoVarrido): UsoDePermissao[] {
  const fonte = ts.createSourceFile(
    arquivo.caminho,
    arquivo.conteudo,
    ts.ScriptTarget.Latest,
    true,
    arquivo.caminho.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const usos: UsoDePermissao[] = [];
  const registrar = (forma: FormaDeUso, detalhe: string, no: ts.Node) =>
    usos.push({ caminho: arquivo.caminho, forma, detalhe, linha: linhaDe(no, fonte) });

  for (const stmt of fonte.statements) {
    const especificador =
      (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier)
        ? normalizarEspecificador(stmt.moduleSpecifier.text, arquivo.caminho)
        : null;

    if (especificador && MODULO_PERMISSAO.test(especificador)) {
      registrar(
        ts.isExportDeclaration(stmt) ? 'reexport' : 'import_do_modulo',
        especificador,
        stmt,
      );
      continue;
    }

    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const b = stmt.importClause.namedBindings;
      if (b && ts.isNamespaceImport(b) && especificador && MODULO_AUTH_HELPER.test(especificador)) {
        registrar('import_namespace_do_auth', `* as ${b.name.text}`, stmt);
        continue;
      }
      if (b && ts.isNamedImports(b)) {
        for (const el of b.elements) {
          const original = (el.propertyName ?? el.name).text;
          if (SIMBOLOS.has(original)) registrar('import_nomeado', original, el);
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        const original = (el.propertyName ?? el.name).text;
        if (SIMBOLOS.has(original)) registrar('reexport', original, el);
      }
    }
  }

  // Chamada pelo nome, com ou sem import: `podeGerenciarEstoque(id)` e
  // `a.exigirGestorEstoque()`. Identificador em comentário ou dentro de string
  // não é nó de expressão e não chega aqui, que é o ponto de trocar o medidor.
  const visitar = (no: ts.Node): void => {
    if (ts.isCallExpression(no)) {
      const alvo = no.expression;
      const nome = ts.isIdentifier(alvo)
        ? alvo.text
        : ts.isPropertyAccessExpression(alvo)
          ? alvo.name.text
          : null;
      if (nome && SIMBOLOS.has(nome)) registrar('chamada', nome, no);
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);

  return usos;
}

/** Arquivos fora do escopo permitido que alcançam a permissão. */
export function violacoesDePermissao(
  lista: readonly ArquivoVarrido[],
  permitidos: readonly RegExp[],
): UsoDePermissao[] {
  return lista
    .filter(({ caminho }) => !permitidos.some((p) => p.test(caminho)))
    .flatMap((arquivo) => usosDePermissao(arquivo));
}
