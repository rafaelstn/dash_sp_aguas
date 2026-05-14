import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
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
import type {
  DivergenciaMunicipio,
  StatusRevisao,
} from '@/domain/ana-revisao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  cenario: z.string().max(80).optional(),
  operando: z.enum(['sim', 'nao', 'todos']).optional(),
  status: z
    .enum([
      'pendente',
      'em_revisao',
      'revisada',
      'descartada',
      'sem_match',
      'promovida_a_posto',
    ])
    .optional(),
  divergencia: z
    .enum(['ok', 'margem_aceitavel', 'divergente', 'sem_coordenada'])
    .optional(),
  semMatch: z.enum(['true', 'false']).optional(),
  busca: z.string().max(80).optional(),
  pagina: z.coerce.number().int().min(1).max(10000).optional(),
  porPagina: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * GET /api/inventario-ana?[filtros]
 *
 * Lista paginada do lote atual. Filtros opcionais por cenário,
 * estado operacional, status de revisão, divergência geográfica
 * e busca livre (código ANA, código adicional, nome).
 *
 * Acesso restrito ao papel `aprovador` (governo.md).
 */
export async function GET(request: NextRequest) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }

  const ehAprovador = await papeisRepository.ehAprovador(usuario.id);
  if (!ehAprovador) {
    return NextResponse.json({ erro: 'sem_papel_aprovador' }, { status: 403 });
  }

  const rl = consumirRateLimit(POLITICAS.leituraInventarioAna, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.leituraInventarioAna, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit' },
      { status: 429, headers },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'query_invalida',
        motivos: parsed.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
      },
      { status: 400, headers },
    );
  }

  const lote = await anaRevisaoRepository.loteAtual();
  if (!lote) {
    return NextResponse.json(
      { erro: 'sem_lote', mensagem: 'Nenhum inventário ANA carregado.' },
      { status: 404, headers },
    );
  }

  const resultado = await anaRevisaoRepository.listar(lote.id, {
    cenario: parsed.data.cenario,
    operando: parsed.data.operando,
    status: parsed.data.status as StatusRevisao | undefined,
    divergenciaMunicipio: parsed.data.divergencia as
      | DivergenciaMunicipio
      | undefined,
    semMatch:
      parsed.data.semMatch === 'true'
        ? true
        : parsed.data.semMatch === 'false'
          ? false
          : undefined,
    busca: parsed.data.busca,
    pagina: parsed.data.pagina,
    porPagina: parsed.data.porPagina,
  });

  return NextResponse.json(
    {
      lote: {
        id: lote.id,
        nome: lote.nome,
        prazoResposta: lote.prazoResposta,
        totalEstacoes: lote.totalEstacoes,
        totalPendencias: lote.totalPendencias,
      },
      itens: resultado.itens,
      total: resultado.total,
    },
    { headers },
  );
}
