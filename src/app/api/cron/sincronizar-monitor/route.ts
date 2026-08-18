import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  estacoesPluviometricasRepository,
  leiturasPluviometricasRepository,
  postosRepository,
} from '@/infrastructure/repositories';
import { sibhClient } from '@/infrastructure/sibh/sibh-client';
import { sincronizarMonitor } from '@/application/use-cases/monitor/sincronizar-monitor';
import {
  POLITICAS,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';
import { logger } from '@/infrastructure/logging/logger';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET|POST /api/cron/sincronizar-monitor
 *
 * Agendamento da sincronização do Monitor com o SIBH.
 *
 * **Por que existe.** Até 18/08/2026 a sincronização só tinha o disparo manual
 * de `POST /api/monitor/sync`, que exige um aprovador logado. Ninguém o
 * disparou entre 15/07 e 18/08, e o mapa passou 34 dias exibindo a mesma foto,
 * com o indicador de estações "online" congelado naquela data. A defasagem não
 * era excepcional: era o resultado previsível de depender de alguém lembrar.
 * O próprio `sync/route.ts` já registrava a pendência ("quando o agendamento
 * for definido, reusar estes use-cases num handler /cron").
 *
 * Segue o mesmo padrão dos crons existentes (`liberar-locks-expirados`,
 * `anonimizar-trilha`): secret em header comparado em tempo constante, rate
 * limit por IP como defesa em profundidade e resposta idêntica para secret
 * ausente e secret errado.
 *
 *   - **GET**: usado pelo Vercel Cron, que envia
 *     `Authorization: Bearer ${CRON_SECRET}` automaticamente.
 *   - **POST**: chamadas manuais (cron externo, rotação de secret, teste).
 *
 * Idempotente: a sincronização é upsert por prefixo mais gravação de leituras
 * por chave, então repetir a chamada não duplica nada.
 *
 * Cadência sugerida: a cada 1 hora. As estações automáticas transmitem em
 * intervalos de 10 a 15 minutos, mas o mapa não precisa dessa granularidade, e
 * a janela padrão de 7 dias cobre com folga qualquer execução perdida.
 * Configuração em `docs/runbooks/cron-externo-hobby.md`.
 */
function compareSecretsConstantTime(received: string, expected: string): boolean {
  // Padding pra mesmo length antes do timingSafeEqual (que exige tamanhos iguais).
  // O valor do secret esperado nunca aparece no log/erro por construção.
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Compare dummy do mesmo tamanho de `b` pra não vazar timing por
    // early-return. O resultado já é falso.
    const dummy = Buffer.alloc(b.length);
    timingSafeEqual(dummy, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function extrairSecret(request: NextRequest): string {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length);
  }
  return request.headers.get('x-cron-secret') ?? '';
}

async function executar(request: NextRequest) {
  const ip = extrairIp(request);
  const rl = consumirRateLimit(POLITICAS.cronInvocacao, ip);
  if (!rl.permitido) {
    return NextResponse.json({ erro: 'rate_limit' }, { status: 429 });
  }

  const secretEnv = process.env.CRON_SECRET;
  if (!secretEnv || secretEnv.length < 32) {
    logger.error(
      'cron.config_invalida',
      { job: 'monitor-sincronizar' },
      'CRON_SECRET ausente ou curto demais',
    );
    return NextResponse.json({ erro: 'configuracao_invalida' }, { status: 500 });
  }

  const recebido = extrairSecret(request);
  if (!compareSecretsConstantTime(recebido, secretEnv)) {
    // Não diferencia "ausente" de "errado": mesma resposta, mesmo tempo.
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  try {
    const resultado = await sincronizarMonitor({
      sibh: sibhClient,
      estacoes: estacoesPluviometricasRepository,
      leituras: leiturasPluviometricasRepository,
      postos: postosRepository,
    });

    // Sempre loga, mesmo com zero linhas gravadas. Um job que só fala quando
    // faz alguma coisa é indistinguível de um job que parou de rodar, que é
    // exatamente o modo de falha que este endpoint existe para evitar.
    logger.info(
      'cron.monitor_sync.sucesso',
      {
        job: 'monitor-sincronizar',
        dias: resultado.dias,
        estacoesUpsertadas: resultado.estacoes.upsertadas,
        leiturasGravadas: resultado.leituras.linhasGravadas,
        errosEstacoes: resultado.estacoes.erros.length,
        errosLeituras: resultado.leituras.erros.length,
      },
      `Monitor sincronizado: ${resultado.estacoes.upsertadas} estação(ões), ${resultado.leituras.linhasGravadas} leitura(s)`,
    );

    return NextResponse.json(resultado);
  } catch (e) {
    logger.error(
      'cron.monitor_sync.falha',
      { job: 'monitor-sincronizar', erro: String(e) },
      'Falha ao sincronizar o Monitor com o SIBH',
    );
    return respostaDeErro(
      'POST /api/cron/sincronizar-monitor',
      { job: 'monitor-sincronizar' },
      e,
    );
  }
}

// Vercel Cron sempre dispara GET. POST mantido para chamadas manuais.
export const GET = executar;
export const POST = executar;
