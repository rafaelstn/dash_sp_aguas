/**
 * O otimizador de imagem do Next e o sharp, que só existe por causa dele.
 *
 * O QUE ESTA GUARDA PROTEGE. `/_next/image` está fora do matcher de
 * `src/middleware.ts` (e tem de estar: dentro dele todo asset dispararia
 * redirect para /login), então o endpoint respondia sem sessão a qualquer
 * caminho local pedido, e cada resposta passava pelo sharp. Em 22/09/2026 ele
 * foi desligado por `images.unoptimized`, e o sharp saiu do `standalone` por
 * `outputFileTracingExcludes`. São duas linhas que dependem uma da outra, e é
 * essa dependência que cria a armadilha:
 *
 *   religar o otimizador SEM tirar a exclusão do sharp = a primeira imagem
 *   otimizada morre com "Cannot find module 'sharp'", dentro do servidor do
 *   órgão, que não tem internet. Build verde, typecheck verde, lint verde.
 *
 * Nenhuma das duas linhas é alcançável por teste de unidade comum: elas são
 * configuração de build. Por isso a guarda lê a AST do `next.config.ts` (e não
 * substring: os comentários do arquivo citam `unoptimized` várias vezes) e a
 * cruza com o uso real de `<Image>` nos arquivos de `src/`.
 *
 * O QUE ELA NÃO MEDE: o efeito. A prova de efeito foi feita à parte em
 * 22/09/2026, com a cópia do `standalone` FORA do repositório (rodando de
 * dentro, o Node sobe a árvore e ainda acha o `node_modules` do projeto, o que
 * invalidaria a medição): ali `require('sharp')` dá MODULE_NOT_FOUND, o
 * servidor sobe, `/_next/image?url=...` responde 404 sem estourar e
 * `/logo-spaguas-header.png` continua em 200.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(__dirname, '..', '..');

type UsoDeImagem = { arquivo: string; src: string; otimizada: boolean };

/* ------------------------------------------------------------------ *
 * Leitura do next.config.ts pela AST
 * ------------------------------------------------------------------ */

function objetoDaConfig(): ts.ObjectLiteralExpression {
  const texto = readFileSync(path.join(RAIZ, 'next.config.ts'), 'utf8');
  const fonte = ts.createSourceFile(
    'next.config.ts',
    texto,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let achado: ts.ObjectLiteralExpression | undefined;
  const visitar = (no: ts.Node): void => {
    if (
      ts.isVariableDeclaration(no) &&
      no.name.getText(fonte) === 'nextConfig' &&
      no.initializer &&
      ts.isObjectLiteralExpression(no.initializer)
    ) {
      achado = no.initializer;
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  if (!achado) {
    // Piso: se alguém trocar o objeto literal por uma variável montada em
    // outro lugar, a guarda inteira passaria a medir vazio. Melhor quebrar.
    throw new Error('next.config.ts: não achei `const nextConfig` como objeto literal');
  }
  return achado;
}

function propriedade(
  objeto: ts.ObjectLiteralExpression,
  nome: string,
): ts.Expression | undefined {
  for (const p of objeto.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === nome) return p.initializer;
  }
  return undefined;
}

/** `images.unoptimized: true`, o que faz o servidor responder 404 no endpoint. */
function otimizadorDesligado(): boolean {
  const images = propriedade(objetoDaConfig(), 'images');
  if (!images || !ts.isObjectLiteralExpression(images)) return false;
  return propriedade(images, 'unoptimized')?.kind === ts.SyntaxKind.TrueKeyword;
}

/** Caminhos de `images.localPatterns`, a lista de permissão do endpoint. */
function padroesLocais(): string[] {
  const images = propriedade(objetoDaConfig(), 'images');
  if (!images || !ts.isObjectLiteralExpression(images)) return [];
  const lista = propriedade(images, 'localPatterns');
  if (!lista || !ts.isArrayLiteralExpression(lista)) return [];
  return lista.elements.flatMap((elemento) => {
    if (!ts.isObjectLiteralExpression(elemento)) return [];
    const caminho = propriedade(elemento, 'pathname');
    return caminho && ts.isStringLiteral(caminho) ? [caminho.text] : [];
  });
}

/** `true` quando o sharp está fora do tracing do `standalone`. */
function sharpExcluidoDoTracing(): boolean {
  const excluidos = propriedade(objetoDaConfig(), 'outputFileTracingExcludes');
  if (!excluidos || !ts.isObjectLiteralExpression(excluidos)) return false;
  return excluidos.properties.some((p) => {
    if (!ts.isPropertyAssignment(p) || !ts.isArrayLiteralExpression(p.initializer)) return false;
    return p.initializer.elements.some(
      (e) => ts.isStringLiteral(e) && e.text.includes('sharp'),
    );
  });
}

/* ------------------------------------------------------------------ *
 * Leitura das <Image> do projeto
 * ------------------------------------------------------------------ */

/**
 * Lê as `<Image>` de um arquivo pela AST, e não por substring: `src` dentro de
 * comentário, de string ou de outro componente não conta, e `unoptimized={false}`
 * é otimizada, ao contrário do que um grep por "unoptimized" diria.
 */
function usosDeImagem(texto: string, arquivo: string): UsoDeImagem[] {
  const fonte = ts.createSourceFile(
    arquivo,
    texto,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const achados: UsoDeImagem[] = [];

  const visitar = (no: ts.Node): void => {
    if (
      (ts.isJsxSelfClosingElement(no) || ts.isJsxOpeningElement(no)) &&
      no.tagName.getText(fonte) === 'Image'
    ) {
      let src: string | null = null;
      let otimizada = true;
      for (const atributo of no.attributes.properties) {
        if (!ts.isJsxAttribute(atributo)) continue;
        const nome = atributo.name.getText(fonte);
        const valor = atributo.initializer;
        if (nome === 'src' && valor && ts.isStringLiteral(valor)) {
          src = valor.text;
        }
        if (nome === 'unoptimized') {
          // Atributo sem valor é `true`. Com valor, só `{false}` mantém o
          // otimizador no caminho.
          const desligado =
            !valor ||
            (ts.isJsxExpression(valor) &&
              valor.expression?.kind !== ts.SyntaxKind.FalseKeyword);
          if (desligado) otimizada = false;
        }
      }
      if (src) achados.push({ arquivo, src, otimizada });
    }
    ts.forEachChild(no, visitar);
  };

  visitar(fonte);
  return achados;
}

/** Arquivos versionados de `src/`, lidos do DISCO (inclui alteração pendente). */
function fontesDoProjeto(): string[] {
  const saida = execFileSync('git', ['ls-files', 'src'], { cwd: RAIZ, encoding: 'utf8' });
  return saida
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.tsx') || l.endsWith('.ts'));
}

function todosOsUsos(): UsoDeImagem[] {
  return fontesDoProjeto().flatMap((arquivo) => {
    const absoluto = path.join(RAIZ, arquivo);
    if (!existsSync(absoluto)) return [];
    return usosDeImagem(readFileSync(absoluto, 'utf8'), arquivo);
  });
}

/* ------------------------------------------------------------------ */

describe('otimizador de imagem e sharp', () => {
  it('o next.config é legível como objeto literal', () => {
    expect(objetoDaConfig().properties.length).toBeGreaterThan(0);
  });

  it('o endpoint nunca fica aberto: ou desligado, ou com lista de permissão', () => {
    // As duas formas são aceitáveis; o que não pode é nenhuma das duas, que é
    // o estado em que `/_next/image` processa qualquer caminho local sem sessão.
    expect(
      otimizadorDesligado() || padroesLocais().length > 0,
      'declare `images.unoptimized: true` ou `images.localPatterns` no next.config.ts',
    ).toBe(true);
  });

  it('o sharp só sai do tracing enquanto o otimizador está desligado', () => {
    // Esta é a armadilha que a mudança de 22/09/2026 criou. A direção contrária
    // (desligado sem excluir) não é defeito: custa 20 MB na imagem, não quebra.
    if (!sharpExcluidoDoTracing()) return;
    expect(
      otimizadorDesligado(),
      'o sharp está fora do `outputFileTracingExcludes` e o otimizador voltou a ' +
        'ligar: a primeira imagem otimizada vai morrer em produção com ' +
        '"Cannot find module \'sharp\'". Tire a exclusão junto com o religamento',
    ).toBe(true);
  });

  it('o extrator de <Image> enxerga o uso que deveria reprovar', () => {
    // Medidor próprio se prova com um caso que reprova e outro que passa.
    const amostra = `
      const a = <Image src="/fora-da-lista.png" width={1} height={1} />;
      const b = <Image src="/logo-spaguas-header.png" unoptimized width={1} height={1} />;
      const c = <Image src="/tambem-fora.png" unoptimized={false} width={1} height={1} />;
      const d = <OutroComponente src="/nao-e-image.png" />;
    `;
    const usos = usosDeImagem(amostra, 'amostra.tsx');
    expect(usos.map((u) => u.src)).toEqual([
      '/fora-da-lista.png',
      '/logo-spaguas-header.png',
      '/tambem-fora.png',
    ]);
    expect(usos.filter((u) => u.otimizada).map((u) => u.src)).toEqual([
      '/fora-da-lista.png',
      '/tambem-fora.png',
    ]);
  });

  it('a varredura alcança as <Image> que o projeto tem hoje', () => {
    // Piso contra leitura vazia: se o `git ls-files` ou o parser deixarem de
    // achar arquivo nenhum, os casos de lista ficariam verdes sem medir nada.
    expect(todosOsUsos().length).toBeGreaterThanOrEqual(3);
  });

  // Os dois casos abaixo só fazem sentido com o otimizador ligado. Ficam
  // `skipped` e não verdes, para a suíte não fingir que mediu.
  describe.skipIf(otimizadorDesligado())('com o otimizador ligado', () => {
    it('todo caminho declarado existe em public/', () => {
      for (const caminho of padroesLocais()) {
        expect(existsSync(path.join(RAIZ, 'public', caminho)), caminho).toBe(true);
      }
    });

    it('nenhuma <Image> otimizada aponta para caminho fora da lista', () => {
      const permitidos = new Set(padroesLocais());
      const foraDaLista = todosOsUsos().filter(
        (u) => u.otimizada && u.src.startsWith('/') && !permitidos.has(u.src),
      );
      expect(
        foraDaLista.map((u) => `${u.arquivo}: ${u.src}`),
        'responderiam 400 em /_next/image. Declare o caminho em images.localPatterns ' +
          '(next.config.ts) ou passe `unoptimized` na <Image>',
      ).toEqual([]);
    });
  });
});
