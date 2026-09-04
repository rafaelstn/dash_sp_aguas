import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { estacoesPluviometricasRepository } from '@/infrastructure/repositories';
import { estacaoOnline } from '@/domain/monitor/estacao-online';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Query da listagem. Filtros opcionais combinados com AND no repositório:
//   - bacia: texto livre (trim); string vazia vira "sem filtro".
//   - tipo: enum espelhando o CHECK do banco (manual | automatico).
//   - tipoEstacao: tipo hidrológico (pluviometrico | fluviometrico | piezometrico).
const querySchema = z.object({
  bacia: z
    .string()
    .trim()
    .min(1)
    .optional(),
  tipo: z.enum(['manual', 'automatico']).optional(),
  tipoEstacao: z
    .enum(['pluviometrico', 'fluviometrico', 'piezometrico'])
    .optional(),
  owner: z
    .string()
    .trim()
    .min(1)
    .optional(),
});

/**
 * GET /api/monitor/estacoes
 *
 * Lista as estações pluviométricas persistidas (módulo Monitor, fase B2) para
 * o mapa. Exige sessão. Filtros opcionais por bacia e tipo via query string.
 *
 * Resposta 200: { total, itens } com a entidade EstacaoPluviometrica como está
 * (id, prefixo, nome, lat, lng, tipo, bacia, vinculadoAPosto, sibhId,
 * criadoEm). O payload completo é aceitável para carga única do mapa.
 *
 * `vinculadoAPosto` é booleano de propósito: o catálogo de postos vive no SQL
 * Server do órgão (ADR-0023) e nenhum identificador dele atravessa para cá. Se
 * um dia o frescor de uma hora não bastar, é AQUI que o campo passa a ser
 * derivado em tempo de leitura, cruzando `prefixo` com uma chamada em lote a
 * `postosRepository.mapaIdsPorPrefixo()`, e não voltando a persistir o id.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  const headers = new Headers();
  const rl = consumirRateLimit(POLITICAS.leituraMonitor, usuario.id);
  aplicarHeadersRateLimit(headers, POLITICAS.leituraMonitor, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit', mensagem: 'Muitas requisições. Tente em instantes.' },
      { status: 429, headers },
    );
  }

  const parsed = querySchema.safeParse({
    bacia: request.nextUrl.searchParams.get('bacia') ?? undefined,
    tipo: request.nextUrl.searchParams.get('tipo') ?? undefined,
    tipoEstacao: request.nextUrl.searchParams.get('tipoEstacao') ?? undefined,
    owner: request.nextUrl.searchParams.get('owner') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'query_invalida',
        mensagem: 'Parâmetros de busca inválidos.',
        motivos: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400, headers },
    );
  }

  try {
    const estacoes = await estacoesPluviometricasRepository.listar({
      bacia: parsed.data.bacia,
      tipo: parsed.data.tipo,
      tipoEstacao: parsed.data.tipoEstacao,
      owner: parsed.data.owner,
    });

    // Payload explicito por estacao: computa `online` server-side (regra por
    // tipo, migration 0053) e expoe `ultimaTransmissao`. NAO vaza
    // `transmission_status` cru — `online` + `ultimaTransmissao` bastam pro front.
    const itens = estacoes.map((e) => ({
      id: e.id,
      prefixo: e.prefixo,
      nome: e.nome,
      lat: e.lat,
      lng: e.lng,
      tipo: e.tipo,
      tipoEstacao: e.tipoEstacao,
      bacia: e.bacia,
      owner: e.owner,
      vinculadoAPosto: e.vinculadoAPosto,
      sibhId: e.sibhId,
      criadoEm: e.criadoEm,
      online: estacaoOnline(e),
      ultimaTransmissao: e.ultimaTransmissao,
    }));

    logger.info(
      'monitor.estacoes.listadas',
      {
        usuarioId: usuario.id,
        total: itens.length,
        filtroBacia: parsed.data.bacia !== undefined,
        filtroTipo: parsed.data.tipo ?? null,
        filtroTipoEstacao: parsed.data.tipoEstacao ?? null,
      },
      'Estações do Monitor listadas',
    );

    return NextResponse.json({ total: itens.length, itens }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/monitor/estacoes', { usuarioId: usuario.id }, e);
  }
}
