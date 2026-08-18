import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  estacoesPluviometricasRepository,
  leiturasPluviometricasRepository,
  postosRepository,
} from '@/infrastructure/repositories';
import { sibhClient } from '@/infrastructure/sibh/sibh-client';
import { exigirAprovador } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import {
  sincronizarMonitor,
  DIAS_DEFAULT as DIAS_DEFAULT_UC,
  DIAS_MAX as DIAS_MAX_UC,
} from '@/application/use-cases/monitor/sincronizar-monitor';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Janela de leituras puxadas do SIBH. Definida no use case para que a rota
// manual e o agendamento validem contra o mesmo limite.
const DIAS_DEFAULT = DIAS_DEFAULT_UC;
const DIAS_MAX = DIAS_MAX_UC;

const corpoSchema = z.object({
  dias: z.number().int().min(1).max(DIAS_MAX).optional(),
});

/**
 * POST /api/monitor/sync
 *
 * Dispara a sincronização do Monitor a partir do SIBH:
 *   1. Sincroniza o cadastro de estações pluviométricas (upsert por prefixo).
 *   2. Sincroniza as leituras automáticas das estações no período [hoje-dias, hoje].
 *
 * Operação privilegiada (popula o banco com dado externo): exige aprovador.
 * Não há agendamento automático nesta fase; o disparo é manual. Quando o
 * agendamento (cron) for definido, reusar estes use-cases num handler /cron
 * com autenticação por secret (padrão de `api/cron/*`).
 */
export async function POST(request: NextRequest) {
  const auth = await exigirAprovador();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  const rl = consumirRateLimit(POLITICAS.syncMonitor, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.syncMonitor, rl);
  if (!rl.permitido) {
    return NextResponse.json({ erro: 'rate_limit' }, { status: 429, headers });
  }

  let dias = DIAS_DEFAULT;
  try {
    // Body opcional: ausência ou corpo vazio usa o default.
    const texto = await request.text();
    if (texto.trim().length > 0) {
      const parsed = corpoSchema.safeParse(JSON.parse(texto));
      if (!parsed.success) {
        return NextResponse.json(
          {
            erro: 'body_invalido',
            motivos: parsed.error.issues.map(
              (i) => `${i.path.join('.')}: ${i.message}`,
            ),
          },
          { status: 400, headers },
        );
      }
      dias = parsed.data.dias ?? DIAS_DEFAULT;
    }
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400, headers });
  }

  try {
    // A orquestração vive no use case para que o agendamento
    // (`/api/cron/sincronizar-monitor`) execute exatamente o mesmo trabalho.
    const { estacoes, leituras } = await sincronizarMonitor(
      {
        sibh: sibhClient,
        estacoes: estacoesPluviometricasRepository,
        leituras: leiturasPluviometricasRepository,
        postos: postosRepository,
      },
      dias,
    );

    logger.info(
      'monitor.sync.concluido',
      {
        usuarioId: usuario.id,
        dias,
        estacoesUpsertadas: estacoes.upsertadas,
        estacoesPuladas: estacoes.puladasSemCoordenada,
        estacoesPuladasSemId: estacoes.puladasSemId,
        leiturasGravadas: leituras.linhasGravadas,
        errosEstacoes: estacoes.erros.length,
        errosLeituras: leituras.erros.length,
      },
      'Sincronização do Monitor concluída',
    );

    return NextResponse.json(
      { dias, estacoes, leituras },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro('POST /api/monitor/sync', { usuarioId: usuario.id }, e);
  }
}
