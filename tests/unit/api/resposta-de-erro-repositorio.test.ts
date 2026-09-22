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
import fs from 'node:fs';
import path from 'node:path';
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

const { respostaDeErro, rotaDeLeitura, MENSAGEM_FALHA_LEITURA, MENSAGEM_FALHA_ESCRITA } =
  await import('@/app/api/_helpers/erros');

function listarTs(dir: string, saida: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listarTs(p, saida);
    else if (/\.tsx?$/.test(e.name)) saida.push(p);
  }
  return saida;
}

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

  it('consulta que falha fala em consultar; escrita mantém o texto de dado preenchido', async () => {
    const leitura = await respostaDeErro(
      'GET /api/postos/mapa',
      {},
      new FalhaRepositorio('listarPontosMapa', 'timeout'),
    ).json();
    const escrita = await respostaDeErro(
      'POST /api/postos/[prefixo]/fichas',
      {},
      new FalhaRepositorio('fichasVisita.criar', erroDoDriver()),
    ).json();

    // Presença: as duas respostas são deste ramo, com slug e código.
    expect(leitura.erro).toBe('falha_repositorio');
    expect(escrita.erro).toBe('falha_repositorio');
    expect(leitura.correlationId).toBeTruthy();

    expect(leitura.mensagem).toBe(MENSAGEM_FALHA_LEITURA);
    expect(leitura.mensagem).toContain('consultar');
    expect(leitura.mensagem.toLowerCase()).toContain('tente');
    expect(leitura.mensagem).not.toContain('gravar');
    expect(leitura.mensagem).not.toContain('preenchidos');

    expect(escrita.mensagem).toBe(MENSAGEM_FALHA_ESCRITA);
    expect(escrita.mensagem).toContain('Os dados preenchidos continuam nesta tela');
  });

  it('o verbo decide, nos formatos de rótulo que existem no código', () => {
    expect(rotaDeLeitura('GET /api/postos/mapa')).toBe(true);
    expect(rotaDeLeitura('HEAD /api/postos')).toBe(true);
    expect(rotaDeLeitura('api triagem GET')).toBe(true);
    expect(rotaDeLeitura('POST /api/postos')).toBe(false);
    expect(rotaDeLeitura('PATCH /api/fichas/[id]')).toBe(false);
    expect(rotaDeLeitura('DELETE /api/fichas/[id]')).toBe(false);
    // Palavra que contém GET não é o verbo.
    expect(rotaDeLeitura('POST /api/budget/GETTER')).toBe(false);
    // Sem verbo: fica com a mensagem de escrita, a que não faz perder dado.
    expect(rotaDeLeitura('rota')).toBe(false);
  });

  it('todo rótulo passado a respostaDeErro em src/ é literal e começa pelo verbo HTTP', () => {
    const arquivos = listarTs(path.resolve(process.cwd(), 'src'));
    const chamadas: { arquivo: string; rotulo: string | null }[] = [];
    for (const arquivo of arquivos) {
      const texto = fs.readFileSync(arquivo, 'utf8');
      for (const m of texto.matchAll(/respostaDeErro\(/g)) {
        const resto = texto.slice(m.index + m[0].length);
        // A própria declaração da função.
        if (/^\s*rota\s*:/.test(resto)) continue;
        const literal = resto.match(/^\s*(['"`])([^'"`$]*)\1\s*,/);
        chamadas.push({ arquivo, rotulo: literal ? literal[2]! : null });
      }
    }
    // Presença: medido em 17/09/2026, 85 chamadas. Menos que isso é a varredura
    // que parou de achar, e não o código que mudou.
    expect(chamadas.length).toBeGreaterThanOrEqual(80);
    const indecidiveis = chamadas.filter((c) => c.rotulo === null);
    expect(indecidiveis).toEqual([]);
    const semVerbo = chamadas.filter(
      (c) => !/^(GET|HEAD|POST|PUT|PATCH|DELETE) |\b(GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(c.rotulo!),
    );
    expect(semVerbo).toEqual([]);
  });

  it('erro que não é FalhaRepositorio continua no genérico', async () => {
    // Guarda da guarda: um ramo novo posto antes do genérico poderia sequestrar
    // o resto. Aqui se afirma que ele não sequestrou.
    respostaDeErro('rota', {}, new Error('qualquer outra coisa'));
    const [evento] = registros.chamadas[0] as [string];
    expect(evento).toBe('erro_inesperado');
  });
});
