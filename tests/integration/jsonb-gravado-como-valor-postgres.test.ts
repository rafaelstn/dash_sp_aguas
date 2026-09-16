/**
 * Toda coluna jsonb gravada pelos repositórios PostgreSQL tem de chegar ao
 * banco como OBJETO ou ARRAY, e voltar pelo mesmo repositório como objeto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O DEFEITO QUE ESTE ARQUIVO REPROVA
 * ─────────────────────────────────────────────────────────────────────────
 * O padrão `${JSON.stringify(x)}::jsonb` com postgres-js grava um jsonb do tipo
 * STRING: o `::jsonb` faz o servidor declarar o parâmetro como jsonb, e o driver
 * serializa DE NOVO o texto que já era JSON. O banco guarda `"{\"a\":1}"`
 * (`jsonb_typeof = 'string'`), com `prepare` true e false (medido em 16/09/2026).
 *
 * Na leitura o driver devolve uma string JavaScript, e cada leitor quebra de um
 * jeito: o diagrama reabre VAZIO (`Array.isArray` falha e o mapeamento cai em
 * `[]`), a ficha e a triagem entregam uma string onde a tela espera objeto, e o
 * histórico do posto passa a listar índices de caractere.
 *
 * A escrita correta é `sql.json(valor)`. A guarda estática que impede a volta
 * do padrão é `tests/unit/db/jsonb-sem-json-stringify.test.ts`; esta prova o
 * EFEITO no banco, que a estática não enxerga.
 *
 * Roda apenas com `TEST_DATABASE_URL`; sem a variável o arquivo é pulado.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';
import type { ElementoDiagrama } from '@/domain/diagramas/tipos';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

process.env.DATABASE_URL = URL_TESTE;

const TECNICO = '5a5a5a5a-1111-4111-8111-111111111111';
const APROVADOR = '5a5a5a5a-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** Marca própria deste arquivo, para a limpeza não alcançar dado de ninguém. */
const MARCA = 'ZZ-TESTE-JSONB';
const META = { ip: '127.0.0.1', userAgent: 'vitest' };
const ATOR = { usuarioId: APROVADOR, ip: '127.0.0.1', userAgent: 'vitest' };

type Repos = {
  diagramas: typeof import('@/infrastructure/db/diagramas-repository.pg')['diagramasRepository'];
  fichas: typeof import('@/infrastructure/db/fichas-visita-repository.pg')['fichasVisitaRepository'];
  triagem: typeof import('@/infrastructure/db/triagem-repository.pg')['triagemRepository'];
  postos: typeof import('@/infrastructure/db/postos-repository.pg')['postosRepository'];
  ana: typeof import('@/infrastructure/db/ana-revisao-repository.pg')['anaRevisaoRepository'];
};

rodar('jsonb gravado pelos repositórios chega como objeto, não como string', () => {
  let sql: Sql;
  let r: Repos;

  beforeAll(async () => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false });
    r = {
      diagramas: (await import('@/infrastructure/db/diagramas-repository.pg')).diagramasRepository,
      fichas: (await import('@/infrastructure/db/fichas-visita-repository.pg')).fichasVisitaRepository,
      triagem: (await import('@/infrastructure/db/triagem-repository.pg')).triagemRepository,
      postos: (await import('@/infrastructure/db/postos-repository.pg')).postosRepository,
      ana: (await import('@/infrastructure/db/ana-revisao-repository.pg')).anaRevisaoRepository,
    };
    await sql`
      INSERT INTO auth.users (id, email) VALUES
        (${TECNICO}::uuid, 'tecnico.jsonb@exemplo-nx.test'),
        (${APROVADOR}::uuid, 'aprovador.jsonb@exemplo-nx.test')
      ON CONFLICT (id) DO NOTHING`;
    await limpar();
  });

  afterEach(async () => {
    await limpar();
  });

  afterAll(async () => {
    await limpar();
    await sql`DELETE FROM auth.users WHERE id IN (${TECNICO}::uuid, ${APROVADOR}::uuid)`;
    await sql.end({ timeout: 5 });
  });

  async function limpar() {
    // Ordem: eventos antes das fichas (FK ON DELETE RESTRICT).
    await sql`DELETE FROM triagem_eventos WHERE triagem_id IN (
      SELECT id FROM fichas_triagem WHERE prefixo = ${MARCA})`;
    await sql`DELETE FROM triagem_locks WHERE triagem_id IN (
      SELECT id FROM fichas_triagem WHERE prefixo = ${MARCA})`;
    await sql`UPDATE fichas_triagem SET ficha_origem_id = NULL WHERE prefixo = ${MARCA}`;
    await sql`DELETE FROM fichas_triagem WHERE prefixo = ${MARCA}`;
    await sql`DELETE FROM fichas_visita WHERE prefixo = ${MARCA}`;
    await sql`DELETE FROM diagramas WHERE nome LIKE ${MARCA + '%'}`;
    await sql`DELETE FROM postos_evento WHERE posto_id IN (SELECT id FROM postos WHERE prefixo = ${MARCA})`;
    await sql`DELETE FROM postos WHERE prefixo = ${MARCA}`;
    // Cascata apaga estação e ana_revisao_evento (FK ON DELETE CASCADE).
    await sql`DELETE FROM ana_revisao_lote WHERE nome = ${MARCA}`;
    // `#>> '{}'` lê o texto nos dois formatos, objeto e string, para a limpeza
    // alcançar também a linha gravada pelo código defeituoso.
    await sql`DELETE FROM cron_heartbeats WHERE payload #>> '{}' LIKE ${'%' + MARCA + '%'}`;
  }

  function entradaTriagem(dados: Record<string, unknown>) {
    return {
      prefixo: MARCA,
      codTipoDocumento: 3 as const,
      dataVisita: new Date('2026-05-08T00:00:00Z'),
      horaInicio: null,
      horaFim: null,
      tecnicoId: TECNICO,
      tecnicoNome: 'Técnico de teste',
      latitudeCapturada: null,
      longitudeCapturada: null,
      precisaoGpsM: null,
      observacoes: null,
      dados,
    };
  }

  async function tipos(consulta: Promise<{ t: string | null }[]>): Promise<(string | null)[]> {
    return (await consulta).map((l) => l.t);
  }

  it('diagramas: criar, salvarElementos e duplicar gravam array e o editor reabre com os elementos', async () => {
    const elementos = [{ id: 'n1', tipo: 'chuva', x: 1, y: 2 }] as unknown as ElementoDiagrama[];
    const criado = await r.diagramas.criar({ nome: `${MARCA} a`, elementos }, APROVADOR);
    expect(await tipos(sql`SELECT jsonb_typeof(elementos) t FROM diagramas WHERE id = ${criado.id}::uuid`))
      .toEqual(['array']);

    const outros = [...elementos, { id: 'n2', tipo: 'nivel', x: 3, y: 4 }] as unknown as ElementoDiagrama[];
    await r.diagramas.salvarElementos(criado.id, outros);
    expect(await tipos(sql`SELECT jsonb_typeof(elementos) t FROM diagramas WHERE id = ${criado.id}::uuid`))
      .toEqual(['array']);
    // Pelo caminho do produto: o editor abre o que foi salvo, e não `[]`.
    expect((await r.diagramas.obter(criado.id))?.elementos).toEqual(outros);

    const copia = await r.diagramas.duplicar(criado.id, APROVADOR);
    expect(await tipos(sql`SELECT jsonb_typeof(elementos) t FROM diagramas WHERE id = ${copia.id}::uuid`))
      .toEqual(['array']);
    expect((await r.diagramas.obter(copia.id))?.elementos).toEqual(outros);
  });

  it('fichas_visita: criar e atualizar gravam objeto e a leitura devolve objeto', async () => {
    const ficha = await r.fichas.criar({
      prefixo: MARCA,
      codTipoDocumento: 3,
      dataVisita: new Date('2026-05-08T00:00:00Z'),
      horaInicio: null,
      horaFim: null,
      tecnicoNome: 'Técnico de teste',
      tecnicoId: TECNICO,
      latitudeCapturada: null,
      longitudeCapturada: null,
      observacoes: null,
      dados: { regua: 1.25, nota: 'ação' },
    });
    expect(await tipos(sql`SELECT jsonb_typeof(dados) t FROM fichas_visita WHERE id = ${ficha.id}::uuid`))
      .toEqual(['object']);

    await r.fichas.atualizar(ficha.id, { dados: { regua: 2 } });
    expect(await tipos(sql`SELECT jsonb_typeof(dados) t FROM fichas_visita WHERE id = ${ficha.id}::uuid`))
      .toEqual(['object']);
    expect((await r.fichas.obterPorId(ficha.id))?.dados).toEqual({ regua: 2 });
  });

  it('triagem: submeter, devolver, reenviar, aprovar e registrarEvento gravam objeto em dados e payload', async () => {
    const dados = { tipo_inspecao: 'fluviometrica', leituras: [1, 2] };
    const a = await r.triagem.submeter(entradaTriagem(dados), META);
    expect((await r.triagem.obterPorId(a.id))?.dados).toEqual(dados);

    await r.triagem.iniciarRevisao(a.id, APROVADOR, META);
    await r.triagem.devolver(a.id, APROVADOR, 'motivo de devolução com mais de vinte', META);
    const b = await r.triagem.reenviarAposDevolucao(a.id, entradaTriagem(dados), META);
    await r.triagem.iniciarRevisao(b.id, APROVADOR, META);
    const { fichaVisitaId } = await r.triagem.aprovar(b.id, APROVADOR, META);
    await r.triagem.registrarEvento({
      triagemId: b.id,
      evento: 'revisao_liberada',
      estadoAnterior: null,
      estadoNovo: null,
      atorId: APROVADOR,
      payload: { motivo: 'teste' },
    });

    expect(await tipos(sql`SELECT jsonb_typeof(dados) t FROM fichas_triagem WHERE prefixo = ${MARCA} ORDER BY criada_em`))
      .toEqual(['object', 'object']);
    // A aprovação COPIA os dados para fichas_visita: é o caminho que dobrava a
    // serialização em cima de um valor que já voltava como string.
    expect(await tipos(sql`SELECT jsonb_typeof(dados) t FROM fichas_visita WHERE id = ${fichaVisitaId}::uuid`))
      .toEqual(['object']);
    expect((await r.fichas.obterPorId(fichaVisitaId))?.dados).toEqual(dados);

    const eventos = await sql<{ evento: string; t: string | null }[]>`
      SELECT evento, jsonb_typeof(payload) t FROM triagem_eventos
       WHERE triagem_id IN (${a.id}::uuid, ${b.id}::uuid) AND payload IS NOT NULL`;
    const porEvento = Object.fromEntries(eventos.map((e) => [e.evento, e.t]));
    expect(porEvento).toMatchObject({
      submetida: 'object',
      reenvio_apos_devolucao: 'object',
      aprovada: 'object',
      revisao_liberada: 'object',
    });
    const lidos = await r.triagem.listarEventos(b.id);
    expect(lidos.find((e) => e.evento === 'aprovada')?.payload).toEqual({ fichaVisitaId });
  });

  it('triagem: evento sem payload continua gravando NULL de SQL, e não o jsonb null', async () => {
    const a = await r.triagem.submeter(entradaTriagem({}), META);
    await r.triagem.registrarEvento({
      triagemId: a.id,
      evento: 'revisao_liberada',
      estadoAnterior: null,
      estadoNovo: null,
      atorId: APROVADOR,
      payload: null,
    });
    const [linha] = await sql<{ nulo: boolean }[]>`
      SELECT payload IS NULL AS nulo FROM triagem_eventos
       WHERE triagem_id = ${a.id}::uuid AND evento = 'revisao_liberada'`;
    expect(linha?.nulo).toBe(true);
  });

  it('cron_heartbeats: o payload do heartbeat é objeto', async () => {
    // `registrarHeartbeat` engole erro de propósito, então a prova é a LINHA.
    await r.triagem.registrarHeartbeat('triagem-liberar-locks-expirados', 12, { marca: MARCA, liberados: 0 });
    const linhas = await tipos(sql`
      SELECT jsonb_typeof(payload) t FROM cron_heartbeats WHERE payload #>> '{}' LIKE ${'%' + MARCA + '%'}`);
    expect(linhas).toEqual(['object']);
  });

  it('postos_evento e ana_revisao_evento: criar, atualizar, remover, aceitarMatch, aplicarRevisao e aplicarBulk gravam objeto', async () => {
    const posto = await r.postos.criar({ prefixo: MARCA, nomeEstacao: 'Posto de teste' }, ATOR);
    await r.postos.atualizar(MARCA, { nomeEstacao: 'Posto renomeado' }, ATOR);

    const [lote] = await sql<{ id: string }[]>`
      INSERT INTO ana_revisao_lote (nome) VALUES (${MARCA}) RETURNING id`;
    const estacoes = await sql<{ id: string }[]>`
      INSERT INTO ana_revisao_estacao (lote_id, codigo_ana) VALUES
        (${lote!.id}::uuid, 'ZZJSONB1'), (${lote!.id}::uuid, 'ZZJSONB2')
      RETURNING id`;
    const [e1, e2] = estacoes.map((e) => e.id);

    await r.ana.aceitarMatch(
      { estacaoId: e1!, postoIdSugerido: posto.id, prefixoSugerido: MARCA, codigoAna: 'ZZJSONB1' },
      ATOR,
    );
    await r.ana.aplicarRevisao(e2!, { novoStatus: 'descartada' }, ATOR);
    // Controle: o lote passa texto por `::text[]` e converte no servidor, o que
    // já gravava objeto antes da correção. Fica aqui para a régua não perder o caminho.
    await r.ana.aplicarBulk(lote!.id, { estacaoIds: [e2!], acao: 'restaurar' }, ATOR);
    await r.postos.remover(MARCA, ATOR);

    const pe = await sql<{ evento: string; antes: string | null; depois: string | null }[]>`
      SELECT evento, jsonb_typeof(valores_antes) antes, jsonb_typeof(valores_depois) depois
        FROM postos_evento WHERE posto_id = ${posto.id}::uuid ORDER BY ocorreu_em, evento`;
    expect(pe.map((l) => [l.evento, l.antes, l.depois]).sort()).toEqual(
      [
        ['atualizado', 'object', 'object'],
        ['atualizado', 'object', 'object'],
        ['criado', null, 'object'],
        ['removido', 'object', null],
      ].sort(),
    );

    const ae = await sql<{ evento: string; antes: string | null; depois: string | null }[]>`
      SELECT evento, jsonb_typeof(valores_antes) antes, jsonb_typeof(valores_depois) depois
        FROM ana_revisao_evento WHERE estacao_id IN (${e1!}::uuid, ${e2!}::uuid)`;
    expect(ae.map((l) => [l.evento, l.antes, l.depois]).sort()).toEqual(
      [
        ['descartada', 'object', 'object'],
        ['restaurada', 'object', 'object'],
        ['revisada', null, 'object'],
      ].sort(),
    );

    // Pelo caminho do produto: o histórico do posto recebe objeto.
    const hist = await r.postos.listarEventos(posto.id, 20);
    const criado = hist.find((h) => h.evento === 'criado');
    expect(criado?.valoresDepois).toMatchObject({ prefixo: MARCA, nomeEstacao: 'Posto de teste' });
  });
});
