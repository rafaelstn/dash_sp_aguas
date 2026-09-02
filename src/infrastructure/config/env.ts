import { z } from 'zod';
import {
  configuracaoAcessoSemIdentidade,
  janelaVencida,
} from '@/infrastructure/auth/acesso-sem-identidade';

/**
 * Validação das variáveis de ambiente usadas pelo servidor (API Routes).
 * Falha rápida em boot se alguma estiver inválida.
 *
 * DATABASE_URL é opcional: quando vazia/ausente, o app entra em MODO DEMO
 * (fixtures em memória). Modo demo é bloqueado em produção.
 */
/**
 * Trata string vazia como variável ausente.
 *
 * O caso concreto vem do Docker: `ENV X=$ARG` com o argumento não informado
 * define `X=''`, e não deixa `X` ausente. Para o zod isso é a diferença entre
 * cair no `.optional()` e ser levado ao validador de formato, que reprova.
 */
function vazioComoAusente<T extends z.ZodTypeAny>(esquema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), esquema);
}

const schema = z.object({
  DATABASE_URL: z.string().optional().default(''),
  // Mesmo tratamento do Supabase abaixo: `.default()` cobre ausente, não vazio,
  // e vazio chegaria ao validador de URL e reprovaria o boot.
  NEXT_PUBLIC_APP_URL: vazioComoAusente(
    z.string().url().default('http://localhost:3000'),
  ),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase Auth (desvio autorizado da US-008 para Fase 1 — ver ADR-0004)
  //
  // `vazioComoAusente` não é preciosismo: `ENV X=$ARG` no Dockerfile, com o
  // ARG não informado, define a variável como STRING VAZIA, e não a deixa
  // ausente. `.optional()` cobre `undefined` e não cobre `''`, então o zod
  // levava `''` para o validador de URL e reprovava com "Invalid url",
  // derrubando a construção da imagem inteira em "Collecting page data".
  //
  // Medido em 02/09/2026: `docker build` sem os `--build-arg` do Supabase
  // falhava assim. Como o Supabase saiu da entrega, ninguém mais passa esses
  // argumentos, ou seja, o caminho quebrado virou o caminho normal. Não
  // aparecia no build local porque ali a variável de fato não existe.
  NEXT_PUBLIC_SUPABASE_URL: vazioComoAusente(z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  // Service role (server-only): usada para upload no Storage (foto de capa).
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // Domínios permitidos pra magic link, separados por vírgula.
  AUTH_ALLOWED_EMAIL_DOMAINS: z
    .string()
    .default('sp.gov.br,daee.sp.gov.br,rafaeldamasceno.dev'),
  // Emails individuais fora da allowlist de domínios (ex.: consultor). CSV.
  AUTH_EXTRA_ALLOWED_EMAILS: z.string().optional().default(''),
});

export type Env = z.infer<typeof schema> & {
  isDemoMode: boolean;
  isAuthEnabled: boolean;
};

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detalhe = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${detalhe}`);
  }
  const data = parsed.data;
  const isDemoMode = !data.DATABASE_URL || data.DATABASE_URL.trim() === '';
  const isAuthEnabled = Boolean(
    data.NEXT_PUBLIC_SUPABASE_URL && data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (isDemoMode && data.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL é obrigatória em produção. Modo demo só funciona em development/test.',
    );
  }
  // Janela sem identidade (entrega PRODESP). A chamada vem antes de qualquer
  // decisão que dependa dela porque ela também é o fail-fast de motivo e data:
  // sem isso o modo subiria sem justificativa escrita.
  const configSemIdentidade = configuracaoAcessoSemIdentidade();
  const semIdentidade = configSemIdentidade !== null;

  // Os dois modos são mutuamente exclusivos, e isto é o que impede a
  // configuração do servidor do órgão de ser copiada para um ambiente que
  // alcança a internet. Sem esta recusa, um `.env` com as duas coisas subiria
  // exposto e sem autenticação, e ninguém perceberia: o sistema funcionaria.
  if (semIdentidade && isAuthEnabled) {
    throw new Error(
      'ACESSO_SEM_IDENTIDADE=sim não convive com NEXT_PUBLIC_SUPABASE_URL/ANON_KEY configuradas. ' +
        'A janela sem identidade existe para o servidor do órgão, que não alcança o Supabase. ' +
        'Se este ambiente tem autenticação disponível, remova ACESSO_SEM_IDENTIDADE; ' +
        'se é o servidor do órgão, remova as variáveis do Supabase.',
    );
  }

  // Janela vencida: registra alto e NÃO derruba. Ver `janelaVencida`.
  if (configSemIdentidade && janelaVencida(configSemIdentidade)) {
    console.error(
      '[acesso-sem-identidade] JANELA VENCIDA. O sistema está sem autenticação desde antes de ' +
        `${configSemIdentidade.revisarEm}, data em que a suspensão deveria ter sido reavaliada. ` +
        `Motivo registrado: ${configSemIdentidade.motivo}`,
    );
  }

  if (!isAuthEnabled && !semIdentidade && data.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias em produção (ver ADR-0004). ' +
        'No servidor do órgão, que não tem internet e portanto não alcança o Supabase, o modo previsto é ' +
        'ACESSO_SEM_IDENTIDADE=sim (ver infrastructure/auth/acesso-sem-identidade.ts).',
    );
  }

  // Wildcard de domínios (`*`) é o modo demo/avaliação da allowlist: libera
  // self-signup para qualquer domínio. Em produção isso é self-signup aberto —
  // bloqueio fail-fast no boot para nunca subir produção governamental assim.
  const dominiosAllowlist = data.AUTH_ALLOWED_EMAIL_DOMAINS.split(',').map((d) =>
    d.trim(),
  );
  if (data.NODE_ENV === 'production' && dominiosAllowlist.includes('*')) {
    throw new Error(
      "AUTH_ALLOWED_EMAIL_DOMAINS não pode conter '*' em produção: o wildcard " +
        'libera self-signup para qualquer domínio (modo demo). Defina a lista de ' +
        'domínios institucionais reais (ex.: sp.gov.br,daee.sp.gov.br).',
    );
  }

  cached = { ...data, isDemoMode, isAuthEnabled };
  return cached;
}
