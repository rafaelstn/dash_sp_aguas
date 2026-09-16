import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  estoqueDesconformidadesRepository,
  estoqueUnidadesRepository,
} from '@/infrastructure/repositories';
import { exigirGestorEstoque } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { UnidadeNaoEncontrada } from '@/domain/errors';
import {
  DecisaoDesconformidadeInvalida,
  DesconformidadeAlterada,
  DesconformidadeNaoEncontrada,
  desconformidadeParaDTO,
  montarDecisao,
} from '@/domain/estoque/desconformidade';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../../_rl';
import { decidirDesconformidadeSchema, mensagemZod } from '../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador de desconformidade inválido.');

function alterada(headers: Headers) {
  return NextResponse.json(
    {
      erro: 'desconformidade_alterada',
      mensagem: 'Esta desconformidade foi alterada por outra pessoa. Atualize a lista.',
    },
    { status: 409, headers },
  );
}

function naoEncontrada(headers: Headers) {
  return NextResponse.json(
    { erro: 'desconformidade_nao_encontrada', mensagem: 'Desconformidade não encontrada.' },
    { status: 404, headers },
  );
}

/**
 * PATCH /api/estoque/desconformidades/[id]: resolver, ignorar ou reabrir.
 * Escrita: exigirGestorEstoque. Quem decide vem SEMPRE do auth; reabrir limpa
 * nota, unidade ligada, quem e quando, e o log guarda o que foi limpo (sem a nota).
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirGestorEstoque();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('movimentacaoEstoque', auth.id, request);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });
  const id = idParsed.data;

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json(
      { erro: 'corpo_invalido', mensagem: 'O corpo da requisição não é um JSON válido.' },
      { status: 400, headers },
    );
  }
  const parsed = decidirDesconformidadeSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'corpo_invalido', mensagem: mensagemZod(parsed.error) },
      { status: 400, headers },
    );
  }

  let decisao;
  try {
    decisao = montarDecisao(parsed.data, auth.id);
  } catch (e) {
    if (e instanceof DecisaoDesconformidadeInvalida) {
      return NextResponse.json({ erro: 'corpo_invalido', mensagem: e.message }, { status: 400, headers });
    }
    return respostaDeErro('PATCH /api/estoque/desconformidades/[id]', { usuarioId: auth.id }, e);
  }

  try {
    const existente = await estoqueDesconformidadesRepository.obterPorId(id);
    if (!existente) return naoEncontrada(headers);
    if (decisao.unidadeId && !(await estoqueUnidadesRepository.obterPorId(decisao.unidadeId))) {
      throw new UnidadeNaoEncontrada(decisao.unidadeId);
    }

    const { anterior, decisaoAnterior, atual } = await estoqueDesconformidadesRepository.decidir(
      id,
      decisao,
      { statusEsperado: parsed.data.statusEsperado },
    );
    // Sem nota no log: é texto livre e pode carregar nome de pessoa. A decisão
    // anterior vai inteira porque reabrir a apaga da linha e o log é a trilha.
    logger.info(
      'estoque.desconformidades.decidida',
      {
        usuarioId: auth.id,
        desconformidadeId: atual.id,
        tipo: atual.tipo,
        statusAnterior: anterior,
        decisaoAnterior: {
          resolvidaPor: decisaoAnterior.resolvidaPor,
          resolvidaEm: decisaoAnterior.resolvidaEm?.toISOString() ?? null,
          unidadeId: decisaoAnterior.unidadeId,
        },
        statusNovo: atual.status,
        unidadeId: atual.unidadeId,
      },
      'Desconformidade do estoque decidida',
    );
    return NextResponse.json(desconformidadeParaDTO(atual), { status: 200, headers });
  } catch (e) {
    if (e instanceof DesconformidadeNaoEncontrada) return naoEncontrada(headers);
    if (e instanceof DesconformidadeAlterada) {
      // Sem nota no log, pelo mesmo motivo da decisão gravada.
      logger.info(
        'estoque.desconformidades.conflito',
        {
          usuarioId: auth.id,
          desconformidadeId: id,
          statusEsperado: e.esperado,
          statusEncontrado: e.encontrado,
          statusPedido: decisao.status,
        },
        'Decisão recusada: a desconformidade mudou desde a leitura',
      );
      return alterada(headers);
    }
    return respostaDeErro(
      'PATCH /api/estoque/desconformidades/[id]',
      { usuarioId: auth.id, desconformidadeId: id },
      e,
    );
  }
}
