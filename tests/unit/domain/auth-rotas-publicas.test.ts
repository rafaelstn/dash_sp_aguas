import { describe, expect, it } from 'vitest';
import { rotaPublica, ROTAS_PUBLICAS } from '@/domain/auth/rotas-publicas';

/**
 * O caso que originou este teste: `/api/cron/*` não constava como público, e o
 * middleware respondia 307 para `/login` antes de o handler do agendamento ser
 * alcançado. O serviço de cron seguia o redirecionamento, recebia o 200 da
 * página de login e registrava sucesso. Os três jobs do projeto, incluindo o
 * expurgo de dado pessoal da LGPD, nunca executaram, e o painel do provedor
 * mostrava verde. Falha silenciosa com aparência de sucesso.
 *
 * Os testes abaixo cobrem os dois lados: o que PRECISA passar sem sessão, e o
 * que não pode passar de jeito nenhum.
 */

describe('rotaPublica: o que precisa ser servido sem sessão', () => {
  it('libera os três endpoints de agendamento', () => {
    // Se um destes voltar a falhar, o job correspondente para de rodar sem
    // emitir erro em lugar nenhum.
    expect(rotaPublica('/api/cron/sincronizar-monitor')).toBe(true);
    expect(rotaPublica('/api/cron/liberar-locks-expirados')).toBe(true);
    expect(rotaPublica('/api/cron/anonimizar-trilha')).toBe(true);
  });

  it('libera qualquer agendamento futuro sob o mesmo prefixo', () => {
    expect(rotaPublica('/api/cron/qualquer-job-novo')).toBe(true);
  });

  it('libera login, callback e encerramento de sessão', () => {
    expect(rotaPublica('/login')).toBe(true);
    expect(rotaPublica('/auth/callback')).toBe(true);
    expect(rotaPublica('/auth/sair')).toBe(true);
  });

  it('libera a verificação de saúde', () => {
    // Usada por monitoramento externo, que não tem sessão.
    expect(rotaPublica('/api/health')).toBe(true);
  });

  it('libera os artefatos do PWA', () => {
    expect(rotaPublica('/manifest.json')).toBe(true);
    expect(rotaPublica('/manifest.webmanifest')).toBe(true);
    expect(rotaPublica('/sw.js')).toBe(true);
    expect(rotaPublica('/icons/icon-192.png')).toBe(true);
    expect(rotaPublica('/workbox-abc123.js')).toBe(true);
  });
});

describe('rotaPublica: o que NÃO pode passar sem sessão', () => {
  const protegidas = [
    '/',
    '/painel',
    '/monitor',
    '/estoque',
    '/triagem',
    '/admin/usuarios',
    '/favoritos',
    '/perfil',
    '/inventario-ana',
    '/desconformidades',
    '/diagramas',
    '/app',
    '/app/minhas-fichas',
    '/api/postos',
    '/api/admin/usuarios',
    '/api/estoque/saldos',
    '/api/monitor/estacoes',
    '/api/monitor/sync',
    '/api/triagem',
    '/api/fichas/abc',
  ];

  for (const caminho of protegidas) {
    it(`mantém ${caminho} atrás de sessão`, () => {
      expect(rotaPublica(caminho)).toBe(false);
    });
  }

  it('não confunde rota que apenas COMEÇA parecida com um caminho público', () => {
    // `/loginfalso` não é `/login`. A checagem de caminho exato existe para
    // isso, e o prefixo só vale onde foi declarado de propósito.
    expect(rotaPublica('/loginfalso')).toBe(false);
    expect(rotaPublica('/api/healthcheck-interno')).toBe(false);
  });

  it('não libera /api/cron sem a barra final', () => {
    // O prefixo é `/api/cron/`. Uma rota chamada `/api/cronjobs` seria outra
    // coisa, e não deve herdar a liberação do agendamento.
    expect(rotaPublica('/api/cronjobs')).toBe(false);
    expect(rotaPublica('/api/cron')).toBe(false);
  });

  it('não deixa `/api/monitor/sync` virar público por engano', () => {
    // A sincronização manual exige aprovador logado; só o agendamento, com
    // segredo próprio, dispensa sessão. Se esta asserção cair, a carga passa a
    // poder ser disparada por qualquer um.
    expect(rotaPublica('/api/monitor/sync')).toBe(false);
  });
});

describe('ROTAS_PUBLICAS', () => {
  it('não inclui nenhuma rota de dado por engano', () => {
    // Varredura sobre a lista inteira, para que uma inclusão futura descuidada
    // seja barrada mesmo que ninguém escreva um caso novo aqui.
    for (const rota of ROTAS_PUBLICAS) {
      const ehDado =
        rota.startsWith('/api/') && rota !== '/api/health';
      expect(ehDado, `"${rota}" está pública e parece rota de dado`).toBe(false);
    }
  });
});
