import { NextResponse, type NextRequest } from 'next/server';
import { estoqueUnidadesRepository } from '@/infrastructure/repositories';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../../_rl';
import type { FiltrosUnidade } from '@/domain/estoque/unidade';
import { ehUnidadeFisica } from '@/domain/estoque/local';
import { ehEstadoValido } from '@/domain/estoque/estado';
import { ehStatusValido } from '@/domain/estoque/status-unidade';
import { TETO_ETIQUETAS, montarItemEtiqueta } from '@/domain/estoque/etiqueta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/estoque/unidades/etiquetas — conjunto de serializados do FILTRO ATUAL,
 * SEM paginacao, em JSON enxuto para a pagina de impressao de etiquetas/QR de
 * patrimonio (uma etiqueta por unidade). Leitura: exigirUsuario. Rate-limit:
 * leituraEstoque.
 *
 * Aceita os MESMOS filtros da listagem `/api/estoque/unidades` (unidade, local,
 * estado, status, materialId, busca) e reaproveita a query de `listarParaExport`
 * do repo (nao duplica). Teto defensivo TETO_ETIQUETAS: acima disso trunca e
 * marca `truncado` (a UI deve orientar o refino do filtro).
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  try {
    const sp = request.nextUrl.searchParams;
    const unidade = sp.get('unidade');
    const estado = sp.get('estado');
    const status = sp.get('status');
    const filtros: FiltrosUnidade = {
      unidade: ehUnidadeFisica(unidade) ? unidade : undefined,
      localId: sp.get('local') ?? undefined,
      estado: ehEstadoValido(estado) ? estado : undefined,
      status: ehStatusValido(status) ? status : undefined,
      materialId: sp.get('materialId') ?? undefined,
      busca: sp.get('busca')?.trim() || undefined,
    };

    // Reusa a mesma query/filtro do export (sem paginacao). Corte defensivo em
    // TETO_ETIQUETAS: acima disso a pagina de impressao ficaria absurda, entao
    // trunca e sinaliza para a UI pedir um filtro mais especifico.
    const linhas = await estoqueUnidadesRepository.listarParaExport(filtros);
    const truncado = linhas.length > TETO_ETIQUETAS;
    const itens = (truncado ? linhas.slice(0, TETO_ETIQUETAS) : linhas).map(montarItemEtiqueta);
    const total = itens.length;

    logger.info(
      'estoque.unidades.etiquetas',
      { usuarioId: auth.id, total },
      'Conjunto de etiquetas de patrimonio gerado',
    );
    if (truncado) {
      logger.warn(
        'estoque.unidades.etiquetas_truncado',
        { usuarioId: auth.id, teto: TETO_ETIQUETAS },
        'Etiquetas atingiram o teto defensivo; resultado truncado, refine o filtro',
      );
    }

    return NextResponse.json({ itens, total, truncado }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/unidades/etiquetas', { usuarioId: auth.id }, e);
  }
}
