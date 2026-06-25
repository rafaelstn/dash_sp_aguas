import { NextResponse } from 'next/server';
import {
  anaRevisaoRepository,
  papeisRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import { exportarInventarioAna } from '@/application/use-cases/inventario-ana/exportar';
import { logger } from '@/infrastructure/logging/logger';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lock em memória por usuário para serializar exports concorrentes do
 * mesmo aprovador. O export materializa ~11k linhas + workbook + buffer
 * antes de responder; duas requisições simultâneas dobram o consumo
 * de heap. Lock local ao processo Node (cada instância Vercel tem o seu);
 * combinado com o rate limit já existente, basta para proteger.
 */
const exportandoAgora = new Set<string>();

/**
 * GET /api/inventario-ana/exportar
 *
 * Gera o XLSX no formato ANA com células alteradas em amarelo. A planilha
 * preserva os cabeçalhos da aba DÚVIDAS original + duas colunas de controle
 * (STATUS_REVISAO_SPAGUAS, JUSTIFICATIVA_SPAGUAS).
 *
 * Acesso restrito ao papel `aprovador`. Rate-limit 60/min por usuário.
 */
export async function GET() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }
  const ehAprovador = await papeisRepository.ehAprovador(usuario.id);
  if (!ehAprovador) {
    return NextResponse.json({ erro: 'sem_papel_aprovador' }, { status: 403 });
  }

  const rl = consumirRateLimit(POLITICAS.decisaoInventarioAna, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.decisaoInventarioAna, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit' },
      { status: 429, headers },
    );
  }

  const lote = await anaRevisaoRepository.loteAtual();
  if (!lote) {
    return NextResponse.json({ erro: 'sem_lote' }, { status: 404, headers });
  }

  if (exportandoAgora.has(usuario.id)) {
    return NextResponse.json(
      {
        erro: 'export_em_andamento',
        mensagem: 'Já existe um export em andamento para sua conta. Aguarde concluir.',
      },
      { status: 409, headers },
    );
  }
  exportandoAgora.add(usuario.id);

  try {
    const { buffer, nomeArquivo, estatisticas } = await exportarInventarioAna(
      lote.id,
    );

    logger.info(
      'inventario_ana.exportado',
      {
        loteId: lote.id,
        usuarioId: usuario.id,
        bytes: buffer.byteLength,
        totalLinhas: estatisticas.total,
        linhasComCorrecao: estatisticas.comDiff,
      },
      'Inventário ANA exportado para XLSX',
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: new Headers({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        'Cache-Control': 'no-store',
      }),
    });
  } catch (e) {
    // Preserva os headers de rate-limit já calculados na resposta do helper.
    const resposta = respostaDeErro(
      'GET /api/inventario-ana/exportar',
      { loteId: lote.id, usuarioId: usuario.id },
      e,
    );
    headers.forEach((valor, chave) => resposta.headers.set(chave, valor));
    return resposta;
  } finally {
    exportandoAgora.delete(usuario.id);
  }
}
