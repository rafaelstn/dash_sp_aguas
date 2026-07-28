import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  estoqueConferenciasRepository,
  usuariosIdentidadeRepository,
} from '@/infrastructure/repositories';
import { resolverOperadores } from '@/application/use-cases/estoque/resolver-operadores';
import { exigirUsuario, exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import type { FiltrosItemConferencia, SobraComando } from '@/domain/estoque/conferencia';
import { ehSituacaoItem } from '@/domain/estoque/conferencia';
import { checarRateLimit } from '../../../_rl';
import { lerPaginacao, motivosZod } from '../../../_schemas';
import { sobraItemSchema } from '../../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador de conferência inválido.');

/**
 * GET /api/estoque/conferencias/[id]/itens — lista itens. Leitura: usuario.
 * Filtros: situacao, apenasDivergentes, apenasPendentesRecon, pagina, porPagina.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  try {
    const sp = request.nextUrl.searchParams;
    const situacaoBruta = sp.get('situacao');
    const { pagina, porPagina } = lerPaginacao(sp);
    const filtros: FiltrosItemConferencia = {
      situacao: ehSituacaoItem(situacaoBruta)
        ? (situacaoBruta as FiltrosItemConferencia['situacao'])
        : undefined,
      apenasDivergentes: sp.get('apenasDivergentes') === 'true',
      apenasPendentesRecon: sp.get('apenasPendentesRecon') === 'true',
      pagina,
      porPagina,
    };
    const { itens, total } = await estoqueConferenciasRepository.listarItens(idParsed.data, filtros);

    // Rotulo legivel de quem contou e de quem reconciliou, pela MESMA regra do
    // export e da trilha de movimentacoes (um unico SELECT em lote). Sem isso a
    // tela mostraria UUID e a trilha nao serviria para auditoria do orgao.
    const ids = itens.flatMap((i) =>
      [i.contadoPor, i.reconciliadoPor].filter((v): v is string => v !== null),
    );
    const { operadores, degradado } = await resolverOperadores(usuariosIdentidadeRepository, ids);
    if (degradado) {
      logger.warn(
        'estoque.conferencia.operador_degradado',
        { usuarioId: auth.id, conferenciaId: idParsed.data },
        'Resolucao de identidade do operador indisponivel; trilha degradada para o id',
      );
    }
    const itensComOperador = itens.map((i) => ({
      ...i,
      contadoPorRotulo: i.contadoPor ? (operadores.get(i.contadoPor) ?? i.contadoPor) : null,
      reconciliadoPorRotulo: i.reconciliadoPor
        ? (operadores.get(i.reconciliadoPor) ?? i.reconciliadoPor)
        : null,
    }));

    return NextResponse.json(
      { itens: itensComOperador, total, pagina, porPagina },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro('GET /api/estoque/conferencias/[id]/itens', { usuarioId: auth.id }, e);
  }
}

/**
 * POST /api/estoque/conferencias/[id]/itens — adiciona item "sobra" (alvo JA
 * cadastrado; so com a sessao aberta). Escrita: admin. Erros: 404/409/400.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('conferenciaEstoque', auth.id);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400, headers });
  }
  const parsed = sobraItemSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }
  const d = parsed.data;
  const sobra: SobraComando =
    'unidadeId' in d
      ? { tipo: 'serializado', unidadeId: d.unidadeId, localEncontradoId: d.localEncontradoId }
      : {
          tipo: 'quantificavel',
          materialId: d.materialId,
          localId: d.localId,
          tamanho: d.tamanho ?? null,
          quantidadeContada: d.quantidadeContada,
        };

  try {
    const item = await estoqueConferenciasRepository.adicionarSobra(idParsed.data, sobra, auth.id);
    logger.info(
      'estoque.conferencias.sobra_adicionada',
      { usuarioId: auth.id, conferenciaId: idParsed.data, itemId: item.id, tipo: sobra.tipo },
      'Item sobra adicionado a conferencia',
    );
    return NextResponse.json(item, { status: 201, headers });
  } catch (e) {
    return respostaDeErro('POST /api/estoque/conferencias/[id]/itens', { usuarioId: auth.id }, e);
  }
}
