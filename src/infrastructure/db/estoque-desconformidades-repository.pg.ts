import 'server-only';
import type { EstoqueDesconformidadesRepository } from '@/application/ports/estoque-desconformidades-repository';
import {
  DesconformidadeAlterada,
  DesconformidadeNaoEncontrada,
  type Desconformidade,
  type FiltrosDesconformidade,
  type StatusDesconformidade,
  type TipoDesconformidade,
} from '@/domain/estoque/desconformidade';
import { FalhaRepositorio, UnidadeNaoEncontrada } from '@/domain/errors';
import { sql } from './client';

type LinhaDesconformidade = {
  id: string;
  tipo: TipoDesconformidade;
  origem: string;
  aba: string | null;
  linha: number | null;
  detalhe: string;
  dados: Record<string, unknown> | null;
  status: StatusDesconformidade;
  nota: string | null;
  unidade_id: string | null;
  resolvida_por: string | null;
  resolvida_em: Date | null;
  detectada_em: Date;
  ultima_deteccao_em: Date;
};

export function mapearDesconformidadeLinha(l: LinhaDesconformidade): Desconformidade {
  return {
    id: l.id,
    tipo: l.tipo,
    origem: l.origem,
    aba: l.aba,
    linha: l.linha,
    detalhe: l.detalhe,
    dados: l.dados && typeof l.dados === 'object' && !Array.isArray(l.dados) ? l.dados : {},
    status: l.status,
    nota: l.nota,
    unidadeId: l.unidade_id,
    resolvidaPor: l.resolvida_por,
    resolvidaEm: l.resolvida_em,
    detectadaEm: l.detectada_em,
    ultimaDeteccaoEm: l.ultima_deteccao_em,
  };
}

// Fragmento como FUNÇÃO: aplicar a tag no import abre conexão em modo demo
// (ver src/infrastructure/db/client.ts).
const COLUNAS = () => sql`
  d.id, d.tipo, d.origem, d.aba, d.linha, d.detalhe, d.dados, d.status, d.nota,
  d.unidade_id, d.resolvida_por, d.resolvida_em, d.detectada_em, d.ultima_deteccao_em
`;

function whereTipo(filtros: FiltrosDesconformidade): ReturnType<typeof sql> {
  return filtros.tipo ? sql`d.tipo = ${filtros.tipo}` : sql`true`;
}

function ehViolacaoFkUnidade(e: unknown): boolean {
  const erro = e as { code?: string; constraint_name?: string };
  return erro?.code === '23503' && (erro.constraint_name ?? '').includes('unidade_id');
}

export const estoqueDesconformidadesRepository: EstoqueDesconformidadesRepository = {
  async listar(filtros) {
    try {
      const pagina = Math.max(filtros.pagina, 1);
      const porPagina = Math.min(Math.max(filtros.porPagina, 1), 200);
      const offset = (pagina - 1) * porPagina;
      const tipo = whereTipo(filtros);
      const where = filtros.status ? sql`${tipo} AND d.status = ${filtros.status}` : tipo;

      const itens = await sql<LinhaDesconformidade[]>`
        SELECT ${COLUNAS()} FROM estoque_desconformidades d
         WHERE ${where}
         ORDER BY (d.status <> 'aberta'), d.tipo COLLATE "C", d.aba COLLATE "C" NULLS LAST,
                  d.linha NULLS FIRST, d.id
         LIMIT ${porPagina} OFFSET ${offset}
      `;
      // Contagem por status respeita só o tipo: a aba mostra os três totais
      // independentemente do status selecionado. `total` sai da mesma leitura.
      const porStatus = await sql<{ status: StatusDesconformidade; n: string }[]>`
        SELECT d.status, COUNT(*)::text AS n FROM estoque_desconformidades d
         WHERE ${tipo}
         GROUP BY d.status
      `;
      const contagem = { aberta: 0, resolvida: 0, ignorada: 0 };
      for (const r of porStatus) contagem[r.status] = Number(r.n);
      const total = filtros.status
        ? contagem[filtros.status]
        : contagem.aberta + contagem.resolvida + contagem.ignorada;
      return { itens: itens.map(mapearDesconformidadeLinha), total, contagem };
    } catch (e) {
      throw new FalhaRepositorio('estoqueDesconformidades.listar', e);
    }
  },

  async obterPorId(id) {
    try {
      const linhas = await sql<LinhaDesconformidade[]>`
        SELECT ${COLUNAS()} FROM estoque_desconformidades d WHERE d.id = ${id}::uuid LIMIT 1
      `;
      return linhas[0] ? mapearDesconformidadeLinha(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('estoqueDesconformidades.obterPorId', e);
    }
  },

  async decidir(id, decisao, opcoes) {
    const esperado = opcoes?.statusEsperado ?? null;
    try {
      // Uma instrução só: o CTE trava a linha e devolve o status ANTERIOR, e o
      // UPDATE grava a decisão inteira. Sem janela entre ler e escrever.
      // `statusEsperado` entra no WHERE do UPDATE sobre `alvo`, que é a versão
      // TRAVADA da linha (sob READ COMMITTED o FOR UPDATE espera o commit da
      // outra transação e relê): se não bate, `gravada` sai vazia e `alvo`
      // diz o status encontrado.
      const linhas = await sql<
        (LinhaDesconformidade & {
          gravou: boolean;
          status_encontrado: StatusDesconformidade;
          resolvida_por_anterior: string | null;
          resolvida_em_anterior: Date | null;
          unidade_id_anterior: string | null;
        })[]
      >`
        WITH alvo AS (
          SELECT id, status, resolvida_por, resolvida_em, unidade_id
            FROM estoque_desconformidades WHERE id = ${id}::uuid FOR UPDATE
        ),
        gravada AS (
          UPDATE estoque_desconformidades d
             SET status = ${decisao.status},
                 nota = ${decisao.nota},
                 unidade_id = ${decisao.unidadeId}::uuid,
                 resolvida_por = ${decisao.resolvidaPor}::uuid,
                 resolvida_em = CASE WHEN ${decisao.status} = 'aberta' THEN NULL ELSE NOW() END
            FROM alvo
           WHERE d.id = alvo.id
             AND (${esperado}::text IS NULL OR alvo.status = ${esperado}::text)
          RETURNING ${COLUNAS()}
        )
        SELECT gravada.*, (gravada.id IS NOT NULL) AS gravou,
               alvo.status AS status_encontrado,
               alvo.resolvida_por AS resolvida_por_anterior,
               alvo.resolvida_em AS resolvida_em_anterior,
               alvo.unidade_id AS unidade_id_anterior
          FROM alvo LEFT JOIN gravada ON gravada.id = alvo.id
      `;
      const linha = linhas[0];
      if (!linha) throw new DesconformidadeNaoEncontrada(id);
      if (!linha.gravou && esperado !== null) {
        throw new DesconformidadeAlterada(id, esperado, linha.status_encontrado);
      }
      if (!linha.gravou) throw new DesconformidadeNaoEncontrada(id);
      return {
        anterior: linha.status_encontrado,
        decisaoAnterior: {
          resolvidaPor: linha.resolvida_por_anterior,
          resolvidaEm: linha.resolvida_em_anterior,
          unidadeId: linha.unidade_id_anterior,
        },
        atual: mapearDesconformidadeLinha(linha),
      };
    } catch (e) {
      if (e instanceof DesconformidadeNaoEncontrada || e instanceof DesconformidadeAlterada) throw e;
      if (decisao.unidadeId && ehViolacaoFkUnidade(e)) throw new UnidadeNaoEncontrada(decisao.unidadeId);
      throw new FalhaRepositorio('estoqueDesconformidades.decidir', e);
    }
  },
};
