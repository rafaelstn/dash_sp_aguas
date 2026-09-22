/**
 * Toda `<Image>` local do projeto tem de continuar sendo servida depois que o
 * otimizador passou a ter lista de permissão.
 *
 * POR QUE ISTO É GUARDA. `/_next/image` está fora do matcher de
 * `src/middleware.ts` (tem de estar: senão todo asset dispararia redirect para
 * `/login`), então ele respondia sem sessão a qualquer caminho local pedido, e
 * cada resposta passava pelo sharp. O `images.localPatterns` do `next.config.ts`
 * fecha isso. O preço é o defeito simétrico, e é ele que esta guarda pega:
 * quem acrescentar uma `<Image>` nova apontando para outro arquivo de `public/`
 * recebe **400 em produção**, porque o caminho não está na lista. Não há aviso
 * de build, não há erro de tipo e em desenvolvimento com `unoptimized` nada
 * aparece: o defeito nasce no servidor do órgão, com a imagem quebrada na tela.
 *
 * O que a guarda mede: a DECLARAÇÃO no `next.config.ts` contra o uso real na
 * AST dos arquivos versionados. Ela não prova que o endpoint responde 400 fora
 * da lista, e essa metade continua **não medida**: a prova exige subir o
 * servidor e pedir `/_next/image?url=...`.
 *
 * Medido em 22/09/2026, antes da lista existir: as três `<Image>` do projeto
 * (login, ChromeDashboard, MenuMobile) apontam todas para
 * `/logo-spaguas-header.png` e todas passam `unoptimized`, ou seja, nenhuma
 * chega a usar o endpoint hoje.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(__dirname, '..', '..');

type UsoDeImagem = { arquivo: string; src: string; otimizada: boolean };

/** Caminhos declarados em `images.localPatterns` no `next.config.ts`. */
function padroesLocais(): string[] {
  const texto = readFileSync(path.join(RAIZ, 'next.config.ts'), 'utf8');
  const bloco = /localPatterns\s*:\s*\[([\s\S]*?)\]/.exec(texto);
  if (!bloco) return [];
  return [...bloco[1]!.matchAll(/pathname\s*:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

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

describe('otimizador de imagem: lista de permissão e uso real', () => {
  it('a lista de caminhos locais está declarada e legível', () => {
    // Sem este caso, trocar o array literal por uma variável faria toda a
    // guarda medir vazio e passar em silêncio.
    expect(padroesLocais().length).toBeGreaterThan(0);
  });

  it('todo caminho declarado existe em public/', () => {
    for (const caminho of padroesLocais()) {
      expect(existsSync(path.join(RAIZ, 'public', caminho)), caminho).toBe(true);
    }
  });

  it('o extrator enxerga o uso que deveria reprovar', () => {
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
    // achar arquivo nenhum, os casos abaixo ficariam verdes sem medir nada.
    const usos = todosOsUsos();
    expect(usos.length).toBeGreaterThanOrEqual(3);
  });

  it('nenhuma <Image> otimizada aponta para caminho fora da lista', () => {
    const permitidos = new Set(padroesLocais());
    const foraDaLista = todosOsUsos().filter(
      (u) => u.otimizada && u.src.startsWith('/') && !permitidos.has(u.src),
    );
    // A mensagem tem de dizer o conserto, porque quem esbarrar nisto vai estar
    // acrescentando uma imagem e não mexendo em configuração de build.
    expect(
      foraDaLista.map((u) => `${u.arquivo}: ${u.src}`),
      'responderiam 400 em /_next/image. Declare o caminho em images.localPatterns ' +
        '(next.config.ts) ou passe `unoptimized` na <Image>',
    ).toEqual([]);
  });
});
