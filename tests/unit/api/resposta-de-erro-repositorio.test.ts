/**
 * `FalhaRepositorio` na tradução de erro para HTTP.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOIS DEFEITOS, E O SEGUNDO SÓ APARECEU AO CORRIGIR O PRIMEIRO
 * ─────────────────────────────────────────────────────────────────────────
 * 1. `FalhaRepositorio` não tinha ramo em `respostaDeErro` e caía no genérico.
 *    Somado ao formulário de ficha, que imprimia `body.erro` (o SLUG) existindo
 *    `body.mensagem` ao lado, quem preenchia uma ficha inteira e falhava lia
 *    **`erro_interno`** na tela.
 *
 * 2. A mensagem deste erro é `Falha no repositório (op): ${String(causa)}`, e a
 *    causa de um driver carrega a consulta e os PARÂMETROS LIGADOS. Devolvê-la
 *    ou registrá-la põe dado de cidadão numa tela e num log que não estão sob o
 *    controle de acesso do banco. Num sistema de governo isso é a rule `governo`
 *    (auditoria de acesso a dado de cidadão) virando o contrário do que promete.
 *
 * Por isso os casos aqui são de PRESENÇA e de AUSÊNCIA, e os de ausência têm
 * âncora de presença junto: asserção que só afirma o que NÃO está no corpo fica
 * verde sobre qualquer resposta de erro, inclusive a errada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FalhaRepositorio } from '@/domain/errors';

const registros = vi.hoisted(() => ({ chamadas: [] as unknown[][] }));

vi.mock('@/infrastructure/logging/logger', () => ({
  logger: {
    error: (...args: unknown[]) => {
      registros.chamadas.push(args);
    },
    warn: () => {},
    info: () => {},
    debug: () => {},
  },
}));

const { respostaDeErro } = await import('@/app/api/_helpers/erros');

/** Valor que jamais pode sair do servidor: é o dado de um titular. */
const DADO_DE_TITULAR = 'fulano.silva@orgao.sp.gov.br';

/**
 * Erro do `postgres.js` como ele chega de verdade: `detail` de uma violação de
 * índice único é literalmente `Key (coluna)=(valor) already exists`.
 */
function erroDoDriver() {
  return Object.assign(new Error(`duplicate key value violates unique constraint`), {
    name: 'PostgresError',
    code: '23505',
    detail: `Key (email)=(${DADO_DE_TITULAR}) already exists.`,
    schema_name: 'public',
    table_name: 'fichas_triagem',
    constraint_name: 'uq_fichas_triagem_idempotency',
    routine: '_bt_check_unique',
    where: `PL/pgSQL function trg() line 3 at SQL statement, email ${DADO_DE_TITULAR}`,
  });
}

describe('respostaDeErro/FalhaRepositorio', () => {
  beforeEach(() => {
    registros.chamadas = [];
  });

  it('responde 500 com slug próprio, e não cai no genérico erro_interno', async () => {
    const resp = respostaDeErro(
      'POST /api/postos/[prefixo]/fichas',
      { prefixo: '3D-001' },
      new FalhaRepositorio('fichasVisita.criar', erroDoDriver()),
    );
    const corpo = await resp.json();

    expect(resp.status).toBe(500);
    expect(corpo.erro).toBe('falha_repositorio');
    expect(corpo.erro).not.toBe('erro_interno');
  });

  it('a mensagem é para a pessoa: diz o que houve, o que fazer, e não é o slug', async () => {
    const resp = respostaDeErro('rota', {}, new FalhaRepositorio('op', erroDoDriver()));
    const corpo = await resp.json();

    // Âncora de presença: sem ela, as asserções de forma abaixo passariam sobre
    // um corpo vazio.
    expect(typeof corpo.mensagem).toBe('string');
    expect(corpo.mensagem.length).toBeGreaterThan(40);
    // Não é slug: slug não tem espaço nem acento, e é isso que a pessoa lia.
    expect(corpo.mensagem).not.toMatch(/^[a-z_]+$/);
    expect(corpo.mensagem).toContain(' ');
    // Diz o que fazer, que é o que falta numa tela de erro que só acusa.
    expect(corpo.mensagem.toLowerCase()).toContain('tente');
    // E dá o fio entre o que a pessoa viu e o que o servidor registrou.
    expect(corpo.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('o corpo NÃO carrega a mensagem do driver nem o dado do titular', async () => {
    const resp = respostaDeErro('rota', {}, new FalhaRepositorio('op', erroDoDriver()));
    const corpo = await resp.json();

    // Âncora de presença primeiro (a resposta é a certa), depois a ausência.
    expect(corpo.erro).toBe('falha_repositorio');
    const serializado = JSON.stringify(corpo);
    expect(serializado).not.toContain(DADO_DE_TITULAR);
    expect(serializado).not.toContain('duplicate key');
    expect(serializado).not.toContain('Falha no repositório');
    expect(serializado).not.toContain('uq_fichas_triagem_idempotency');
  });

  it('o LOG também não carrega valor de linha, e mesmo assim identifica o defeito', async () => {
    respostaDeErro('rota', { prefixo: '3D-001' }, new FalhaRepositorio('op', erroDoDriver()));

    expect(registros.chamadas.length).toBe(1);
    const [evento, contexto] = registros.chamadas[0] as [string, Record<string, unknown>];

    // Presença: o log serve para diagnosticar.
    expect(evento).toBe('falha_repositorio');
    expect(contexto.operacao).toBe('op');
    expect(contexto.causaClasse).toBe('PostgresError');
    expect(contexto.code).toBe('23505');
    expect(contexto.constraint_name).toBe('uq_fichas_triagem_idempotency');
    expect(contexto.table_name).toBe('fichas_triagem');

    // Ausência: `detail` e `where` citam o valor, e `message` vem junto do
    // `String(causa)` que a mensagem do erro embute.
    const serializado = JSON.stringify(contexto);
    expect(serializado).not.toContain(DADO_DE_TITULAR);
    expect(serializado).not.toContain('duplicate key');
    expect(contexto.detail).toBeUndefined();
    expect(contexto.where).toBeUndefined();
  });

  it('causa que não é erro de banco não quebra a tradução', async () => {
    // O ramo tem de valer para qualquer causa: `FalhaRepositorio` embrulha
    // timeout, socket fechado e o que mais vier do driver.
    const resp = respostaDeErro('rota', {}, new FalhaRepositorio('op', 'texto solto'));
    const corpo = await resp.json();

    expect(resp.status).toBe(500);
    expect(corpo.erro).toBe('falha_repositorio');
    const [, contexto] = registros.chamadas[0] as [string, Record<string, unknown>];
    expect(contexto.causaClasse).toBe('string');
  });

  it('erro que não é FalhaRepositorio continua no genérico', async () => {
    // Guarda da guarda: um ramo novo posto antes do genérico poderia sequestrar
    // o resto. Aqui se afirma que ele não sequestrou.
    respostaDeErro('rota', {}, new Error('qualquer outra coisa'));
    const [evento] = registros.chamadas[0] as [string];
    expect(evento).toBe('erro_inesperado');
  });
});
