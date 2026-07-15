import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  estoqueMovimentacoesRepository,
  estoqueSaldosRepository,
  estoqueUnidadesRepository,
  usuariosIdentidadeRepository,
} from '@/infrastructure/repositories';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../_rl';
import { motivosZod, tipoMovEnum } from '../_schemas';
import { ehUnidadeFisica } from '@/domain/estoque/local';
import { ehEstadoValido } from '@/domain/estoque/estado';
import { ehStatusValido } from '@/domain/estoque/status-unidade';
import { TETO_EXPORT } from '@/domain/estoque/export';
import type { FiltrosUnidade } from '@/domain/estoque/unidade';
import type { FiltrosSaldo } from '@/domain/estoque/saldo';
import type { FiltrosMovimentacao } from '@/domain/estoque/movimentacao';
import { exportarEstoque } from '@/application/use-cases/estoque/exportar-estoque';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tipoExportEnum = z.enum(['serializado', 'quantificavel', 'movimentacoes']);

const CONTENT_TYPE_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * GET /api/estoque/export — gera o XLSX do inventario para download. Leitura:
 * exigirUsuario (qualquer logado exporta o que consegue ver). Rate-limit:
 * leituraEstoque. Param `tipo` (serializado|quantificavel|movimentacoes) define
 * a aba e reaproveita os MESMOS filtros das rotas de listagem correspondentes;
 * o export respeita o filtro atual e traz TUDO (sem paginacao, teto TETO_EXPORT).
 *
 * ATENCAO ao filtro de tipo de MOVIMENTACAO: como `tipo` ja e o seletor da aba,
 * o filtro de tipo de movimento (entrada|saida|...) vem no param `tipoMov`.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  const sp = request.nextUrl.searchParams;
  const tipoParsed = tipoExportEnum.safeParse(sp.get('tipo'));
  if (!tipoParsed.success) {
    return NextResponse.json(
      { erro: 'tipo_invalido', motivos: motivosZod(tipoParsed.error) },
      { status: 400, headers },
    );
  }
  const tipo = tipoParsed.data;

  try {
    // Filtros espelham as rotas de listagem (unidades/saldos/movimentacoes),
    // sem paginacao. O use-case usa apenas o conjunto correspondente ao `tipo`.
    const unidadeFisica = sp.get('unidade');
    const estado = sp.get('estado');
    const status = sp.get('status');
    const filtrosUnidade: FiltrosUnidade = {
      unidade: ehUnidadeFisica(unidadeFisica) ? unidadeFisica : undefined,
      localId: sp.get('local') ?? undefined,
      estado: ehEstadoValido(estado) ? estado : undefined,
      status: ehStatusValido(status) ? status : undefined,
      materialId: sp.get('materialId') ?? undefined,
      busca: sp.get('busca')?.trim() || undefined,
    };

    const filtrosSaldo: FiltrosSaldo = {
      materialId: sp.get('materialId') ?? undefined,
      localId: sp.get('local') ?? undefined,
      unidade: ehUnidadeFisica(unidadeFisica) ? unidadeFisica : undefined,
    };

    const tipoMovBruto = sp.get('tipoMov');
    const tipoMov = tipoMovEnum.safeParse(tipoMovBruto).success
      ? (tipoMovBruto as FiltrosMovimentacao['tipo'])
      : undefined;
    const de = sp.get('de');
    const ate = sp.get('ate');
    const filtrosMov: FiltrosMovimentacao = {
      tipo: tipoMov,
      unidadeId: sp.get('unidadeId') ?? undefined,
      materialId: sp.get('materialId') ?? undefined,
      localId: sp.get('local') ?? undefined,
      usuarioId: sp.get('usuarioId') ?? undefined,
      de: de && !Number.isNaN(Date.parse(de)) ? new Date(de) : undefined,
      ate: ate && !Number.isNaN(Date.parse(ate)) ? new Date(ate) : undefined,
    };

    const { buffer, nomeArquivo, total, truncado } = await exportarEstoque(
      {
        unidadesRepo: estoqueUnidadesRepository,
        saldosRepo: estoqueSaldosRepository,
        movimentacoesRepo: estoqueMovimentacoesRepository,
        identidadeRepo: usuariosIdentidadeRepository,
      },
      tipo,
      { serializado: filtrosUnidade, quantificavel: filtrosSaldo, movimentacoes: filtrosMov },
      new Date(),
    );

    logger.info(
      'estoque.export.gerado',
      { usuarioId: auth.id, tipo, total, bytes: buffer.byteLength },
      'Export de estoque gerado',
    );
    if (truncado) {
      logger.warn(
        'estoque.export.truncado',
        { usuarioId: auth.id, tipo, teto: TETO_EXPORT },
        'Export atingiu o teto de linhas; resultado pode estar truncado',
      );
    }

    const respostaHeaders = new Headers(headers);
    respostaHeaders.set('Content-Type', CONTENT_TYPE_XLSX);
    respostaHeaders.set('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    respostaHeaders.set('Cache-Control', 'no-store');
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: respostaHeaders,
    });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/export', { usuarioId: auth.id, tipo }, e);
  }
}
