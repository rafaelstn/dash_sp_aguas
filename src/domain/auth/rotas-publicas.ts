/**
 * Quais caminhos são servidos sem sessão.
 *
 * Regra pura sobre o pathname, sem I/O, extraída do middleware para poder ser
 * exercitada por teste. O motivo da extração é concreto: em 18/08/2026
 * descobriu-se que `/api/cron/*` não constava aqui, então o middleware
 * respondia 307 para `/login` antes de o handler do agendamento ser alcançado.
 * O serviço de cron seguia o redirecionamento, recebia o 200 da página de login
 * e registrava a execução como bem-sucedida. Os três jobs do projeto,
 * incluindo o expurgo de dado pessoal exigido pela LGPD, nunca executaram, e o
 * painel do provedor mostrava verde.
 *
 * Uma regra que decide o que é público não pode viver sem teste.
 */

/** Caminhos exatos servidos sem sessão. */
export const ROTAS_PUBLICAS: ReadonlySet<string> = new Set([
  '/login',
  // Autocadastro público foi DESATIVADO: contas são criadas pelo Admin/Super
  // na gestão de usuários (/admin/usuarios). A rota /cadastrar não é mais
  // pública (a própria página redireciona para /login).
  '/auth/callback',
  '/auth/sair',
  '/api/health',
  // Artefatos do PWA: manifest e service worker precisam ser servidos
  // antes de qualquer auth-check (o browser busca o manifest sem cookie
  // em alguns cenários e o SW é registrado em /app/* antes do login).
  '/manifest.json',
  '/manifest.webmanifest',
  '/sw.js',
  '/apple-touch-icon.png',
]);

/**
 * Prefixos servidos sem sessão.
 *
 * `/api/cron/` está aqui porque esses endpoints são chamados por serviço
 * externo, que não tem e não pode ter sessão. A proteção deles é o
 * `CRON_SECRET` em cabeçalho, comparado em tempo constante dentro do próprio
 * handler, mais rate limit por IP. Sem o segredo configurado o handler responde
 * 500; com segredo errado responde 401, sem distinguir de ausente. Liberar o
 * prefixo aqui não abre nada: apenas deixa a requisição chegar em quem sabe
 * autenticá-la.
 */
const PREFIXOS_PUBLICOS: readonly string[] = [
  '/api/cron/',
  '/_next/',
  '/favicon',
  '/robots',
  // Ícones do PWA são públicos por natureza.
  '/icons/',
  // Workbox e arquivos auxiliares do Serwist (fallback se algum chegar aqui).
  '/workbox-',
];

/** `true` quando o caminho é servido sem exigir sessão. */
export function rotaPublica(pathname: string): boolean {
  if (ROTAS_PUBLICAS.has(pathname)) return true;
  return PREFIXOS_PUBLICOS.some((p) => pathname.startsWith(p));
}
