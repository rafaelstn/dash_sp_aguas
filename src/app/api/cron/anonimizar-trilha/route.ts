import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { auditoriaRepository } from '@/infrastructure/repositories';
import {
  RETENCAO_MINIMA_DIAS,
  RETENCAO_PADRAO_DIAS,
  anonimizarTrilhaAuditoria,
} from '@/application/use-cases/manutencao/anonimizar-trilha-auditoria';
import { POLITICAS, consumirRateLimit, extrairIp } from '@/infrastructure/security/rate-limit';
import { logger } from '@/infrastructure/logging/logger';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JOB = 'lgpd-anonimizar-trilha';

/**
 * GET|POST /api/cron/anonimizar-trilha
 *
 * Expurgo periodico da PII de rede (`ip`, `user_agent`) da trilha de auditoria
 * depois do prazo de retencao (LGPD-4, migration 0048). O evento permanece.
 *
 * Ate aqui a rotina so existia como script administrativo, que alguem tinha que
 * lembrar de rodar contra o banco de producao: um controle de retencao que
 * depende de memoria humana nao e um controle. Com o endpoint, o agendador
 * externo ja usado pelo projeto (cron-job.org, ver `docs/runbooks/cron-externo-hobby.md`)
 * dispara mensalmente.
 *
 * **O prazo NAO vem da requisicao.** Sai de `TRILHA_RETENCAO_DIAS` (com piso) ou
 * do padrao de 180 dias. A anonimizacao e irreversivel, entao aceitar
 * `?dias=1` transformaria o endpoint em ferramenta de destruicao de evidencia
 * para quem tivesse o secret. O ajuste fino continua no script administrativo,
 * que roda com credencial de operador.
 *
 * Protecao identica a do cron de locks: secret comparado em tempo constante,
 * aceito em `Authorization: Bearer` (formato do Vercel Cron) ou `x-cron-secret`
 * (chamada manual), mais rate limit por IP como defesa em profundidade.
 */
function compararSecretsTempoConstante(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido, 'utf8');
  const b = Buffer.from(esperado, 'utf8');
  if (a.length !== b.length) {
    // Compare dummy do mesmo tamanho para nao vazar o length por early-return.
    timingSafeEqual(Buffer.alloc(b.length), b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function extrairSecret(request: NextRequest): string {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return request.headers.get('x-cron-secret') ?? '';
}

/** Prazo do ambiente, com piso. Valor invalido cai no padrao em vez de abortar. */
function diasDeRetencaoConfigurados(): number {
  const bruto = process.env.TRILHA_RETENCAO_DIAS;
  if (!bruto) return RETENCAO_PADRAO_DIAS;
  const dias = Number(bruto);
  if (!Number.isInteger(dias) || dias < RETENCAO_MINIMA_DIAS) {
    logger.warn(
      'cron.config_ignorada',
      { job: JOB, recebido: bruto, usado: RETENCAO_PADRAO_DIAS },
      'TRILHA_RETENCAO_DIAS invalido ou abaixo do piso; usando o padrao',
    );
    return RETENCAO_PADRAO_DIAS;
  }
  return dias;
}

async function executar(request: NextRequest) {
  const rl = consumirRateLimit(POLITICAS.cronInvocacao, extrairIp(request));
  if (!rl.permitido) {
    return NextResponse.json({ erro: 'rate_limit' }, { status: 429 });
  }

  const secretEnv = process.env.CRON_SECRET;
  if (!secretEnv || secretEnv.length < 32) {
    logger.error(
      'cron.config_invalida',
      { job: JOB },
      'CRON_SECRET ausente ou curto demais',
    );
    return NextResponse.json({ erro: 'configuracao_invalida' }, { status: 500 });
  }

  if (!compararSecretsTempoConstante(extrairSecret(request), secretEnv)) {
    // Nao diferencia "ausente" de "errado": mesma resposta, mesmo tempo.
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  try {
    const resultado = await anonimizarTrilhaAuditoria(
      auditoriaRepository,
      diasDeRetencaoConfigurados(),
    );
    // Sempre loga, inclusive com zero linhas: a evidencia de que o controle de
    // retencao roda e o que a auditoria de governo cobra, nao o volume.
    logger.info(
      'cron.anonimizar_trilha.sucesso',
      {
        job: JOB,
        diasRetencao: resultado.diasRetencao,
        total: resultado.total,
        porTabela: resultado.porTabela,
        duracaoMs: resultado.duracaoMs,
      },
      `${resultado.total} linha(s) de trilha anonimizada(s)`,
    );
    return NextResponse.json(resultado);
  } catch (e) {
    logger.error(
      'cron.anonimizar_trilha.falha',
      { job: JOB, erro: String(e) },
      'Falha ao anonimizar a trilha de auditoria',
    );
    return respostaDeErro('POST /api/cron/anonimizar-trilha', { job: JOB }, e);
  }
}

export const GET = executar;
export const POST = executar;
