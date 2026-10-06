import { NextResponse, type NextRequest } from 'next/server';
import {
  estoqueMovimentacoesRepository,
  usuariosIdentidadeRepository,
} from '@/infrastructure/repositories';
import { exigirGestorEstoque } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { registrarMovimentacao } from '@/application/use-cases/estoque/registrar-movimentacao';
import { resolverOperadores } from '@/application/use-cases/estoque/resolver-operadores';
import { checarRateLimit } from '../_rl';
import { movimentacaoSchema, motivosZod, lerPaginacao, tipoMovEnum } from '../_schemas';
import type { FiltrosMovimentacao } from '@/domain/estoque/movimentacao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/estoque/movimentacoes — trilha de auditoria paginada.
 *
 * Leitura: exigirGestorEstoque, e nao qualquer logado (decisao do Rafael em
 * 06/10/2026, no mesmo trabalho da migration 0075). Motivo: a trilha passou a
 * devolver `solicitanteMatricula`, que identifica a pessoa que retirou material,
 * e ela ja devolvia o rotulo do operador. Trilha de auditoria de estoque nao e
 * leitura geral do painel.
 *
 * Filtros: tipo, unidadeId, materialId, local, usuarioId, de, ate, pagina, porPagina.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirGestorEstoque();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id, request);
  if (resposta) return resposta;

  try {
    const sp = request.nextUrl.searchParams;
    const tipoBruto = sp.get('tipo');
    const tipo = tipoMovEnum.safeParse(tipoBruto).success
      ? (tipoBruto as FiltrosMovimentacao['tipo'])
      : undefined;
    const de = sp.get('de');
    const ate = sp.get('ate');
    const { pagina, porPagina } = lerPaginacao(sp);
    const filtros: FiltrosMovimentacao = {
      tipo,
      unidadeId: sp.get('unidadeId') ?? undefined,
      materialId: sp.get('materialId') ?? undefined,
      localId: sp.get('local') ?? undefined,
      usuarioId: sp.get('usuarioId') ?? undefined,
      de: de && !Number.isNaN(Date.parse(de)) ? new Date(de) : undefined,
      ate: ate && !Number.isNaN(Date.parse(ate)) ? new Date(ate) : undefined,
      pagina,
      porPagina,
    };
    const { itens, total } = await estoqueMovimentacoesRepository.listar(filtros);

    // Enriquece a trilha com o rotulo legivel do OPERADOR (mesma regra do
    // export). Batch: um unico SELECT em auth.users. Se a resolucao falhar,
    // degrada pro id (a trilha nao pode quebrar por causa do nome) e loga.
    const { operadores, degradado } = await resolverOperadores(
      usuariosIdentidadeRepository,
      itens.map((m) => m.usuarioId),
    );
    if (degradado) {
      logger.warn(
        'estoque.movimentacoes.operador_degradado',
        { usuarioId: auth.id },
        'Resolucao de identidade do operador indisponivel; trilha degradada para o id',
      );
    }
    const itensComOperador = itens.map((m) => ({
      ...m,
      operador: operadores.get(m.usuarioId) ?? m.usuarioId,
    }));
    return NextResponse.json(
      { itens: itensComOperador, total, pagina, porPagina },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro('GET /api/estoque/movimentacoes', { usuarioId: auth.id }, e);
  }
}

/**
 * POST /api/estoque/movimentacoes — registra movimentacao (nucleo transacional).
 * Escrita: exigirGestorEstoque. usuario_id do ledger vem SEMPRE do auth (nunca do corpo).
 * Erros de negocio: 409 saldo_insuficiente/transicao_invalida, 404 alvo, 400 payload.
 */
export async function POST(request: NextRequest) {
  const auth = await exigirGestorEstoque();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('movimentacaoEstoque', auth.id, request);
  if (resposta) return resposta;

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400, headers });
  }
  const parsed = movimentacaoSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }
  const d = parsed.data;

  try {
    const resultado = await registrarMovimentacao(
      estoqueMovimentacoesRepository,
      {
        tipo: d.tipo,
        unidadeId: d.unidadeId,
        materialId: d.materialId,
        quantidade: d.quantidade,
        tamanho: 'tamanho' in d ? d.tamanho : undefined,
        localOrigem: 'localOrigem' in d ? d.localOrigem : undefined,
        localDestino: 'localDestino' in d ? d.localDestino : undefined,
        motivo: 'motivo' in d ? d.motivo : undefined,
        estado: 'estado' in d ? d.estado : undefined,
        status: 'status' in d ? d.status : undefined,
        // So o ramo `saida` do zod declara este campo; nos outros tipos o parse
        // descarta a chave e aqui ela nem existe no objeto.
        solicitanteMatricula:
          'solicitanteMatricula' in d ? d.solicitanteMatricula : undefined,
      },
      auth.id,
    );

    // Contexto do log por LISTA DE PERMISSAO: campo a campo, nunca
    // `...resultado.movimentacao` nem lista de negacao, que e fail-open (campo
    // novo no ledger entraria no log sozinho). `solicitanteMatricula` fica FORA
    // de proposito: identifica a pessoa que retirou material, o log nao e a
    // trilha (quem guarda o dado e a tabela, com finalidade e acesso definidos) e
    // log nao tem a retencao nem o controle de acesso da tabela.
    // Quem reprova se alguem acrescentar o campo aqui:
    // tests/unit/api/estoque-movimentacao-solicitante-rota.test.ts.
    logger.info(
      'estoque.movimentacoes.registrada',
      {
        usuarioId: auth.id,
        movimentacaoId: resultado.movimentacao.id,
        tipo: resultado.movimentacao.tipo,
        unidadeId: resultado.movimentacao.unidadeId,
        materialId: resultado.movimentacao.materialId,
        quantidade: resultado.movimentacao.quantidade,
      },
      'Movimentacao de estoque registrada',
    );
    return NextResponse.json(resultado, { status: 201, headers });
  } catch (e) {
    return respostaDeErro('POST /api/estoque/movimentacoes', { usuarioId: auth.id }, e);
  }
}
