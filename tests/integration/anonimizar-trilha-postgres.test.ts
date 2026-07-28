/**
 * Integracao do expurgo de PII da trilha (LGPD-4) contra POSTGRES REAL.
 *
 * O adapter chama `anonimizar_trilha_auditoria` (migration 0048), uma funcao
 * `SECURITY DEFINER` que escreve em tabelas com UPDATE revogado do PUBLIC.
 * Nenhum mock prova isso: nome errado de funcao, coluna renomeada ou permissao
 * faltando so apareceriam no dia em que o job rodasse em producao, que e
 * justamente quando ninguem esta olhando.
 *
 * Roda apenas com `TEST_DATABASE_URL` apontando para um Postgres descartavel
 * (o job `integracao` do CI sobe um). Sem a variavel, o arquivo e pulado e
 * nunca toca producao.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { anonimizarTrilhaAuditoria } from '@/application/use-cases/manutencao/anonimizar-trilha-auditoria';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

process.env.DATABASE_URL = URL_TESTE;

const USUARIO = '22222222-2222-4222-8222-222222222222';

rodar('anonimizacao da trilha de auditoria contra Postgres real', () => {
  let sql: Sql;
  let repo: typeof import('@/infrastructure/db/auditoria-repository.pg')['auditoriaRepository'];

  beforeAll(async () => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false, transform: { undefined: null } });
    repo = (await import('@/infrastructure/db/auditoria-repository.pg')).auditoriaRepository;
    await sql`INSERT INTO auth.users (id, email) VALUES (${USUARIO}::uuid, 'trilha@sp.gov.br')
              ON CONFLICT (id) DO NOTHING`;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql`DELETE FROM acesso_ficha`;
  });

  /** Evento de trilha com data controlada (a funcao corta por `ocorreu_em`). */
  async function registrarAcesso(prefixo: string, diasAtras: number) {
    await sql`
      INSERT INTO acesso_ficha (usuario_id, prefixo, acao, ip, user_agent, ocorreu_em)
      VALUES (${USUARIO}::uuid, ${prefixo}, 'visualizou_ficha', '203.0.113.7', 'Mozilla/5.0',
              NOW() - make_interval(days => ${diasAtras}))
    `;
  }

  async function lerAcesso(prefixo: string) {
    const [linha] = await sql<
      { prefixo: string; usuario_id: string; acao: string; ip: string | null; user_agent: string | null }[]
    >`SELECT prefixo, usuario_id, acao, ip::text AS ip, user_agent FROM acesso_ficha WHERE prefixo = ${prefixo}`;
    return linha!;
  }

  it('anonimiza o vencido e preserva o evento inteiro', async () => {
    await registrarAcesso('VENCIDO', 400);

    const r = await anonimizarTrilhaAuditoria(repo, 180);

    const linha = await lerAcesso('VENCIDO');
    expect(linha.ip).toBeNull();
    expect(linha.user_agent).toBeNull();
    // O que sustenta a auditoria de governo continua la: quem, quando, o que.
    expect(linha.usuario_id).toBe(USUARIO);
    expect(linha.acao).toBe('visualizou_ficha');
    expect(r.total).toBeGreaterThanOrEqual(1);
  });

  it('nao toca no evento dentro do prazo de retencao', async () => {
    await registrarAcesso('RECENTE', 10);

    await anonimizarTrilhaAuditoria(repo, 180);

    const linha = await lerAcesso('RECENTE');
    expect(linha.ip).toBe('203.0.113.7');
    expect(linha.user_agent).toBe('Mozilla/5.0');
  });

  it('e idempotente: a segunda passada nao encontra mais nada a anonimizar', async () => {
    await registrarAcesso('VENCIDO', 400);

    const primeira = await anonimizarTrilhaAuditoria(repo, 180);
    const segunda = await anonimizarTrilhaAuditoria(repo, 180);

    const totalTabela = (r: typeof primeira) =>
      r.porTabela.find((t) => t.tabela === 'acesso_ficha')?.linhasAnonimizadas ?? -1;
    expect(totalTabela(primeira)).toBe(1);
    expect(totalTabela(segunda)).toBe(0);
  });

  it('reporta todas as tabelas de trilha cobertas pela politica', async () => {
    const r = await anonimizarTrilhaAuditoria(repo, 180);
    expect(r.porTabela.map((t) => t.tabela).sort()).toEqual([
      'acesso_ficha',
      'ana_revisao_evento',
      'postos_evento',
      'triagem_eventos',
    ]);
  });

  // BIGINT chega como string no driver: sem conversao explicita o relatorio do
  // job viraria concatenacao ou NaN.
  it('devolve contagem numerica, nao string do driver', async () => {
    await registrarAcesso('VENCIDO', 400);
    const r = await anonimizarTrilhaAuditoria(repo, 180);
    for (const t of r.porTabela) {
      expect(typeof t.linhasAnonimizadas).toBe('number');
      expect(Number.isNaN(t.linhasAnonimizadas)).toBe(false);
    }
    expect(r.total).toBe(1);
  });
});
