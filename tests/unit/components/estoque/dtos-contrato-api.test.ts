/**
 * Guarda de DERIVA entre o contrato da API de movimentacao e os tipos que a
 * tela declara a mao (`src/components/features/estoque/dtos.ts` e `tipos.ts`).
 *
 * Por que existe, medido em 06/10/2026: `MovimentacaoDTO` e
 * `PayloadMovimentacao` sao escritos a mao e NAO derivam do dominio. Quando a
 * migration 0075 acrescentou `solicitanteMatricula` ao ledger e ao zod da rota,
 * o `tsc` ficou verde, o `lint` ficou verde, a suite ficou verde, e a tela
 * simplesmente ignorou o campo novo: a saida registrada pela interface colhia
 * 400 e a trilha nem sabia que o campo existia. Tipo escrito a mao envelhece
 * CALADO, e nada na casa reprovava isso.
 *
 * Como ele morde, sem lista escrita a mao do lado da API:
 *
 *  - ESCRITA: as chaves vem do `movimentacaoSchema` REAL, por ramo do
 *    discriminated union (`.options[i].shape`), e nao de uma copia. Ramo que
 *    ganha campo no zod faz esta regua nomear o campo que falta no
 *    `PayloadMovimentacao`.
 *  - LEITURA: as chaves vem de um objeto tipado como `Movimentacao` do DOMINIO.
 *    O `tsc` obriga esse literal a ser COMPLETO (campo novo no dominio vira
 *    TS2741 aqui), e o teste compara o conjunto resultante com o espelho do
 *    DTO, que e um `Record<keyof MovimentacaoDTO, true>` e portanto tambem
 *    preso ao tipo pelo compilador. Nenhum dos dois lados aceita lista parcial.
 *
 *  - ENVELOPE DA ROTA: as duas pernas acima ancoram no dominio e no zod, e
 *    nenhuma alcanca o objeto que a rota MONTA na resposta. Medido em
 *    06/10/2026, logo depois: `GET /api/estoque/unidades/[id]` passou a devolver
 *    `historicoVisivel` e `historico: null`, e nada na tela reprovava, porque
 *    `DetalheUnidadeDTO` e escrito a mao e nao deriva de nada. A terceira perna
 *    le as chaves direto da FONTE da rota, por AST.
 *
 * O que ela NAO mede: o TIPO de cada campo (so o nome). `criadoEm` e `Date` no
 * dominio e `string` no DTO de proposito, porque a resposta passa por JSON, e e
 * essa a razao de o DTO existir separado. No envelope, tambem so o nome: que
 * `historico` aceite `null` esta provado pelo caso de tela, em
 * `estoque-trilha-recusa-por-papel.test.tsx`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import { movimentacaoSchema } from '@/app/api/estoque/_schemas';
import type { Movimentacao } from '@/domain/estoque/movimentacao';
import type {
  DetalheUnidadeDTO,
  MovimentacaoDTO,
  MovimentacaoTrilhaDTO,
} from '@/components/features/estoque/dtos';
import type { PayloadMovimentacao } from '@/components/features/estoque/tipos';

/** Chaves ordenadas, para a diferenca aparecer nomeada no relatorio. */
function chaves(o: object): string[] {
  return Object.keys(o).sort();
}

/**
 * Espelho de `PayloadMovimentacao`. O `Record<keyof ..., true>` e o que prende
 * a lista ao tipo: campo que falta aqui e TS2741, campo a mais e TS2353. Ela
 * NAO e a fonte do que a API aceita; a fonte e o zod, logo abaixo.
 */
const CAMPOS_DO_PAYLOAD: Record<keyof PayloadMovimentacao, true> = {
  tipo: true,
  unidadeId: true,
  materialId: true,
  quantidade: true,
  tamanho: true,
  localOrigem: true,
  localDestino: true,
  motivo: true,
  estado: true,
  status: true,
  solicitanteMatricula: true,
};

/** Espelho de `MovimentacaoDTO` (resposta do POST e base da trilha). */
const CAMPOS_DO_DTO: Record<keyof MovimentacaoDTO, true> = {
  id: true,
  tipo: true,
  unidadeId: true,
  materialId: true,
  quantidade: true,
  localOrigemId: true,
  localDestinoId: true,
  estadoAnterior: true,
  estadoNovo: true,
  statusAnterior: true,
  statusNovo: true,
  motivo: true,
  usuarioId: true,
  conferenciaId: true,
  solicitanteMatricula: true,
  criadoEm: true,
};

/** Espelho de `MovimentacaoTrilhaDTO` (leitura enriquecida da trilha). */
const CAMPOS_DA_TRILHA: Record<keyof MovimentacaoTrilhaDTO, true> = {
  ...CAMPOS_DO_DTO,
  operador: true,
};

/**
 * Registro do ledger tipado como `Movimentacao` do DOMINIO. O valor de cada
 * campo nao importa: o que importa e o `tsc` exigir que o literal esteja
 * COMPLETO, para `Object.keys` devolver o conjunto real de campos do dominio.
 */
const REGISTRO_DO_DOMINIO: Movimentacao = {
  id: '00000000-0000-0000-0000-000000000000',
  tipo: 'saida',
  unidadeId: null,
  materialId: '22222222-2222-2222-2222-222222222222',
  quantidade: 1,
  localOrigemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  localDestinoId: null,
  estadoAnterior: null,
  estadoNovo: null,
  statusAnterior: null,
  statusNovo: null,
  motivo: null,
  usuarioId: '33333333-3333-3333-3333-333333333333',
  conferenciaId: null,
  solicitanteMatricula: '482913',
  criadoEm: new Date('2026-10-06T12:00:00.000Z'),
};

/** Espelho de `DetalheUnidadeDTO`, o envelope de GET /unidades/[id]. */
const CAMPOS_DO_DETALHE: Record<keyof DetalheUnidadeDTO, true> = {
  unidade: true,
  historico: true,
  historicoVisivel: true,
};

const ROTA_DETALHE = 'src/app/api/estoque/unidades/[id]/route.ts';

/** Chaves que a rota usa para RECUSAR, e que nao sao o envelope de sucesso. */
const CHAVES_DE_ERRO = new Set(['erro', 'motivos', 'mensagem']);

/**
 * Conjuntos de chaves que a funcao GET da rota devolve em `NextResponse.json`.
 *
 * Por AST, e nao por substring: o mesmo arquivo tem PATCH e DELETE, que montam
 * respostas proprias, e busca textual colheria as deles e as que aparecem
 * dentro de comentario. Shorthand (`{ unidade, ... }`) tambem precisa contar, e
 * so a leitura da arvore enxerga as duas formas como a mesma chave.
 */
function envelopesDoTexto(texto: string, nome: string): string[][] {
  const fonte = ts.createSourceFile(nome, texto, ts.ScriptTarget.Latest, true);
  const get = fonte.statements.find(
    (s): s is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(s) && s.name?.text === 'GET',
  );
  if (!get) return [];

  const achados: string[][] = [];
  const visitar = (no: ts.Node): void => {
    if (
      ts.isCallExpression(no) &&
      ts.isPropertyAccessExpression(no.expression) &&
      no.expression.name.text === 'json' &&
      ts.isIdentifier(no.expression.expression) &&
      no.expression.expression.text === 'NextResponse'
    ) {
      const primeiro = no.arguments[0];
      if (primeiro && ts.isObjectLiteralExpression(primeiro)) {
        const chavesDoObjeto = primeiro.properties
          .map((p) =>
            p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
              ? p.name.text
              : null,
          )
          .filter((c): c is string => c !== null);
        achados.push(chavesDoObjeto.sort());
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(get);
  return achados;
}

function envelopesDoGet(arquivo: string): string[][] {
  return envelopesDoTexto(readFileSync(path.join(process.cwd(), arquivo), 'utf8'), arquivo);
}

/**
 * Rota de CONTROLE: tem um campo que o DTO nao declara (`totalDeEventos`) e usa
 * as duas formas de escrever chave (shorthand e `chave: valor`), alem de um
 * `NextResponse.json` dentro de PATCH, que a leitura precisa IGNORAR. Medidor
 * proprio so e evidencia depois de reprovar o que deve reprovar.
 */
const ROTA_DE_CONTROLE = `
import { NextResponse } from 'next/server';
export async function GET() {
  const unidade = { id: '1' };
  if (!podeVer) {
    return NextResponse.json({ unidade, historico: null, historicoVisivel: false });
  }
  // { chaveDentroDeComentario: 1 }
  return NextResponse.json({ unidade, historico: [], historicoVisivel: true, totalDeEventos: 3 });
}
export async function PATCH() {
  return NextResponse.json({ outroEnvelopeQueNaoEDoGet: true });
}
`;

describe('o leitor de envelope se prova antes de valer', () => {
  it('na rota de controle, acusa o campo que o DTO nao declara', () => {
    const envelopes = envelopesDoTexto(ROTA_DE_CONTROLE, 'controle.ts');
    expect(envelopes.length).toBe(2);

    const extras = new Set(
      envelopes.flat().filter((c) => !Object.hasOwn(CAMPOS_DO_DETALHE, c)),
    );
    expect([...extras]).toEqual(['totalDeEventos']);
    // E nao atravessa a fronteira da funcao: o envelope do PATCH nao entra.
    expect(envelopes.flat()).not.toContain('outroEnvelopeQueNaoEDoGet');
    // Nem colhe chave citada em comentario, que nao e resposta nenhuma.
    expect(envelopes.flat()).not.toContain('chaveDentroDeComentario');
  });
});

describe('envelope: o DTO do detalhe da unidade acompanha o que a rota devolve', () => {
  it('toda resposta de sucesso do GET tem exatamente as chaves do DetalheUnidadeDTO', () => {
    const todos = envelopesDoGet(ROTA_DETALHE);
    // Piso contra leitura vazia: AST que nao acha nada aprovaria qualquer rota,
    // inclusive uma renomeada ou apagada.
    expect(todos.length, `nenhum NextResponse.json lido em ${ROTA_DETALHE}`).toBeGreaterThan(0);

    const sucesso = todos.filter((ch) => !ch.every((c) => CHAVES_DE_ERRO.has(c)));
    // A rota tem DOIS caminhos de sucesso desde 06/10/2026 (gestor e nao
    // gestor), e eles precisam concordar no formato: se um ganhar campo que o
    // outro nao tem, a tela passa a depender de qual papel esta logado.
    expect(sucesso.length, 'esperados os dois caminhos de sucesso do GET').toBe(2);

    const esperado = chaves(CAMPOS_DO_DETALHE);
    for (const envelope of sucesso) {
      expect(envelope).toEqual(esperado);
    }
  });

  it('o DTO declara historicoVisivel, o campo que separa "nao ha" de "voce nao ve"', () => {
    expect(CAMPOS_DO_DETALHE).toHaveProperty('historicoVisivel');
  });
});

describe('escrita: o payload da tela cobre todo campo que o zod da rota aceita', () => {
  it('nenhum ramo do movimentacaoSchema tem campo que PayloadMovimentacao nao declare', () => {
    const declarados = new Set(Object.keys(CAMPOS_DO_PAYLOAD));
    const faltando = new Map<string, string[]>();

    for (const ramo of movimentacaoSchema.options) {
      const shape = ramo.shape as Record<string, unknown>;
      const tipo = String((shape.tipo as { value?: unknown })?.value ?? 'desconhecido');
      const ausentes = Object.keys(shape).filter((c) => !declarados.has(c));
      if (ausentes.length > 0) faltando.set(tipo, ausentes.sort());
    }

    // Piso contra leitura vazia: regua que nao enxerga nenhum ramo aprovaria
    // qualquer coisa. O union tem cinco tipos de movimentacao.
    expect(movimentacaoSchema.options.length).toBe(5);
    expect(Object.fromEntries(faltando)).toEqual({});
  });
});

describe('leitura: os DTOs da tela cobrem todo campo do ledger', () => {
  it('MovimentacaoDTO tem exatamente os campos do dominio', () => {
    expect(chaves(CAMPOS_DO_DTO)).toEqual(chaves(REGISTRO_DO_DOMINIO));
  });

  it('MovimentacaoTrilhaDTO e o DTO mais operador, e nada alem disso', () => {
    expect(chaves(CAMPOS_DA_TRILHA)).toEqual(
      [...Object.keys(CAMPOS_DO_DTO), 'operador'].sort(),
    );
  });

  it('a trilha declara solicitanteMatricula, que e o campo que a 0075 trouxe', () => {
    // Assercao de PRESENCA ao lado das de conjunto: se alguem "consertar" a
    // comparacao removendo o campo dos dois lados, este caso continua reprovando.
    expect(CAMPOS_DA_TRILHA).toHaveProperty('solicitanteMatricula');
    expect(CAMPOS_DO_PAYLOAD).toHaveProperty('solicitanteMatricula');
  });
});
