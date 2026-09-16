import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/**
 * Guarda: jsonb se grava com `sql.json(...)` (ou `tx.json(...)`), nunca com
 * `${JSON.stringify(x)}::jsonb`.
 *
 * O QUE ESTA GUARDA EXISTE PARA IMPEDIR
 *
 * Com postgres-js, `${JSON.stringify(x)}::jsonb` NÃO grava o objeto: o driver
 * manda o texto como parâmetro json e o cast produz um jsonb do tipo 'string'
 * contendo o JSON (medido: jsonb_typeof = 'string'). O produto lê de volta uma
 * string JS: diagrama salvo reabria vazio, ficha de visita chegava como texto,
 * payload de trilha não tinha chave, e a aprovação da triagem gravava a ficha
 * codificada duas vezes. A migration 0072 corrige o que já foi gravado; esta
 * guarda impede o padrão de voltar.
 *
 * O QUE ELA REPROVA (pela árvore sintática, não por substring)
 *
 * 1. `JSON.stringify` em qualquer ponto da expressão de uma substituição de
 *    template com tag (`sql\`...\``, `tx\`...\``, `sql.unsafe\`...\``).
 * 2. Qualquer substituição seguida de `::json` ou `::jsonb` no texto do
 *    template. Cast de parâmetro é a forma que o defeito toma; o padrão único
 *    é `${sql.json(valor)}` sem cast. Cast de COLUNA (`t.valores_antes::jsonb`)
 *    e de literal (`'{}'::jsonb`) não vêm de substituição e não são afetados.
 *
 * O QUE ELA NÃO COBRE
 *
 * SQL montado fora de template com tag (string concatenada passada a
 * `sql.unsafe(texto)`), valor que chega já serializado por uma variável sem
 * cast (`${textoJson}` numa coluna jsonb) e os scripts Python (psycopg3 com
 * `json.dumps` e `%s::jsonb` grava objeto, medido). Para esses, a régua é o
 * teste de integração `tests/integration/jsonb-gravado-como-valor-postgres`.
 *
 * Varredura por diretório (src e scripts inteiros), não por lista: arquivo
 * novo entra sozinho.
 */

const RAIZES = ['src', 'scripts'].map((d) => join(process.cwd(), d));
const EXTENSOES = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs'];

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (EXTENSOES.some((ext) => nome.endsWith(ext))) saida.push(caminho);
  }
  return saida.sort();
}

type Achado = { linha: number; motivo: string; trecho: string };
type Resultado = { achados: Achado[]; templatesComTag: number; gravacoesJson: number };

function contemJsonStringify(no: ts.Node): boolean {
  let achou = false;
  const visitar = (n: ts.Node): void => {
    if (achou) return;
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'stringify' &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === 'JSON'
    ) {
      achou = true;
      return;
    }
    ts.forEachChild(n, visitar);
  };
  visitar(no);
  return achou;
}

function ehChamadaJsonDoDriver(no: ts.Expression): boolean {
  return (
    ts.isCallExpression(no) &&
    ts.isPropertyAccessExpression(no.expression) &&
    no.expression.name.text === 'json'
  );
}

function analisar(nomeArquivo: string, texto: string): Resultado {
  const fonte = ts.createSourceFile(nomeArquivo, texto, ts.ScriptTarget.Latest, true);
  const achados: Achado[] = [];
  let templatesComTag = 0;
  let gravacoesJson = 0;

  const registrar = (no: ts.Node, motivo: string): void => {
    const { line } = fonte.getLineAndCharacterOfPosition(no.getStart(fonte));
    achados.push({ linha: line + 1, motivo, trecho: no.getText(fonte).slice(0, 120) });
  };

  const visitar = (no: ts.Node): void => {
    if (ts.isTaggedTemplateExpression(no) && ts.isTemplateExpression(no.template)) {
      templatesComTag += 1;
      for (const span of no.template.templateSpans) {
        if (ehChamadaJsonDoDriver(span.expression)) gravacoesJson += 1;
        if (contemJsonStringify(span.expression)) {
          registrar(span.expression, 'JSON.stringify dentro de substituição de SQL');
        }
        if (/^\s*::\s*jsonb?\b/i.test(span.literal.text)) {
          registrar(span, 'cast ::json/::jsonb sobre parâmetro; use sql.json(valor) sem cast');
        }
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return { achados, templatesComTag, gravacoesJson };
}

describe('jsonb gravado como valor, nunca como string', () => {
  it('a régua reprova o padrão antigo e aprova o novo', () => {
    const antigo = [
      'await sql`UPDATE diagramas SET elementos = ${JSON.stringify(elementos)}::jsonb WHERE id = ${id}`;',
      'await tx`INSERT INTO t (p) VALUES (${payload ? JSON.stringify(payload) : null}::jsonb)`;',
      'await sql`INSERT INTO t (p) VALUES (${JSON.stringify(p)})`;',
      'await sql`INSERT INTO t (p) VALUES (${texto}::json)`;',
      'await sql`INSERT INTO t (p) VALUES (${sql.json(p)}::jsonb)`;',
    ];
    for (const linha of antigo) {
      expect(analisar('antigo.ts', linha).achados, linha).not.toHaveLength(0);
    }

    const novo = [
      'await sql`UPDATE diagramas SET elementos = ${sql.json(elementos)} WHERE id = ${id}::uuid`;',
      'await tx`INSERT INTO t (p) VALUES (${payload ? sql.json(payload) : null})`;',
      "await sql`INSERT INTO t (p) SELECT t.valores_antes::jsonb, '{}'::jsonb FROM unnest(${lista}::text[]) t`;",
      'const msg = `Valor atual: ${JSON.stringify(id)}.`;',
    ];
    for (const linha of novo) {
      expect(analisar('novo.ts', linha).achados, linha).toHaveLength(0);
    }
  });

  it('nenhum arquivo de src ou scripts grava jsonb pelo padrão do defeito', () => {
    const lista = RAIZES.flatMap(arquivos);
    let templatesComTag = 0;
    let gravacoesJson = 0;
    const violacoes: string[] = [];

    for (const caminho of lista) {
      const r = analisar(caminho, readFileSync(caminho, 'utf8'));
      templatesComTag += r.templatesComTag;
      gravacoesJson += r.gravacoesJson;
      for (const a of r.achados) {
        violacoes.push(`${relative(process.cwd(), caminho)}:${a.linha} ${a.motivo}: ${a.trecho}`);
      }
    }

    // Âncoras de presença: sem elas, uma varredura que não lê nada ficaria verde.
    expect(lista.some((c) => c.endsWith('diagramas-repository.pg.ts'))).toBe(true);
    expect(templatesComTag).toBeGreaterThan(50);
    expect(gravacoesJson).toBeGreaterThan(10);
    expect(violacoes).toEqual([]);
  });
});
