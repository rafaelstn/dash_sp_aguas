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
import { sincronizarEstacoesPluviometricas } from '@/application/use-cases/monitor/sincronizar-estacoes-pluviometricas';
import { sincronizarLeiturasPluviometricas } from '@/application/use-cases/monitor/sincronizar-leituras-pluviometricas';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Janela de leituras puxadas do SIBH. Default 7 dias cobre fim de semana e
// atraso de transmissão; teto de 31 evita varredura histórica pesada.
const DIAS_DEFAULT = 7;
const DIAS_MAX = 31;

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
    const estacoes = await sincronizarEstacoesPluviometricas(
      sibhClient,
      estacoesPluviometricasRepository,
      postosRepository,
    );

    // Alvos das leituras: estações automáticas já persistidas (inclui as que
    // acabaram de ser upsertadas). Filtra por tipo para não puxar leitura de
    // estação manual cadastrada por operador numa fase futura.
    const persistidas = await estacoesPluviometricasRepository.listar({
      tipo: 'automatico',
    });

    const ate = new Date();
    const desde = new Date(ate.getTime() - dias * 24 * 60 * 60 * 1000);

    const leituras = await sincronizarLeiturasPluviometricas(
      sibhClient,
      leiturasPluviometricasRepository,
      persistidas.map((e) => ({ id: e.id, prefixo: e.prefixo })),
      desde,
      ate,
    );

    logger.info(
      'monitor.sync.concluido',
      {
        usuarioId: usuario.id,
        dias,
        estacoesUpsertadas: estacoes.upsertadas,
        estacoesPuladas: estacoes.puladasSemCoordenada,
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
