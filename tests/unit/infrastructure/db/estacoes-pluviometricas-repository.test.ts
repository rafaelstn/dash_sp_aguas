import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  estacoesPluviometricasRepository as repo,
  _resetEstacoesPluviometricasMock,
} from '@/infrastructure/mock/estacoes-pluviometricas-repository.mock';
import type { UpsertEstacaoPluviometrica } from '@/domain/monitor/estacao-pluviometrica';

/**
 * Testes do repositório de estações pluviométricas (Monitor, fase B1.1).
 *
 * Estratégia (mesma do projeto): exercita o adapter mock in-memory, que
 * espelha a lógica observável do .pg (filtro, ordenação, upsert idempotente
 * por sibhId). O adapter .pg real não toca Postgres aqui; é coberto por
 * regressão estática de schema no fim do arquivo (padrão
 * triagem-repository-regression).
 */

function entrada(over: Partial<UpsertEstacaoPluviometrica> = {}): UpsertEstacaoPluviometrica {
  // sibhId é a chave natural do upsert. Por padrão derivamos do prefixo para
  // que prefixos distintos gerem linhas distintas; overrides explícitos vencem.
  const prefixo = over.prefixo !== undefined ? over.prefixo : 'P-001';
  return {
    sibhId: `sibh-${prefixo ?? 'nulo'}`,
    prefixo,
    nome: 'Estação Cabreúva',
    lat: -23.3,
    lng: -47.1,
    tipo: 'automatico',
    tipoEstacao: 'pluviometrico',
    ...over,
  };
}

describe('estações pluviométricas (mock) — upsertPorSibhId', () => {
  afterEach(() => {
    _resetEstacoesPluviometricasMock();
  });

  it('insere quando o sibhId é novo e preenche defaults nuláveis', async () => {
    const e = await repo.upsertPorSibhId(entrada({ sibhId: 'sibh-42' }));
    expect(e.id).toBeTruthy();
    expect(e.prefixo).toBe('P-001');
    expect(e.sibhId).toBe('sibh-42');
    expect(e.tipoEstacao).toBe('pluviometrico');
    expect(e.bacia).toBeNull();
    expect(e.postoId).toBeNull();
    expect(e.criadoEm).toBeInstanceOf(Date);
  });

  it('grava o tipo hidrológico informado (fluviométrico/piezométrico)', async () => {
    const flu = await repo.upsertPorSibhId(
      entrada({ prefixo: 'F-001', tipoEstacao: 'fluviometrico' }),
    );
    const piezo = await repo.upsertPorSibhId(
      entrada({ prefixo: 'Z-001', tipoEstacao: 'piezometrico' }),
    );
    expect(flu.tipoEstacao).toBe('fluviometrico');
    expect(piezo.tipoEstacao).toBe('piezometrico');
  });

  it('é idempotente por sibhId: reprocessar mantém o id e atualiza campos (inclusive prefixo)', async () => {
    const primeira = await repo.upsertPorSibhId(
      entrada({ sibhId: 'sibh-99', prefixo: 'P-ANTIGO', nome: 'Nome Velho' }),
    );
    const segunda = await repo.upsertPorSibhId(
      entrada({
        sibhId: 'sibh-99',
        prefixo: 'P-NOVO',
        nome: 'Nome Novo',
        bacia: 'Tietê',
        tipo: 'manual',
        tipoEstacao: 'fluviometrico',
      }),
    );

    expect(segunda.id).toBe(primeira.id);
    expect(segunda.nome).toBe('Nome Novo');
    expect(segunda.bacia).toBe('Tietê');
    expect(segunda.tipo).toBe('manual');
    // O tipo hidrológico e o prefixo também são atualizados no reprocessamento.
    expect(segunda.tipoEstacao).toBe('fluviometrico');
    expect(segunda.prefixo).toBe('P-NOVO');

    const todas = await repo.listar();
    expect(todas.length).toBe(1);
  });

  it('caso central: mesmo prefixo em tipos diferentes coexiste (sibhId distinto, sem sobrescrever)', async () => {
    // Regressão da corrupção que a chave por prefixo causava: 364 prefixos flu
    // colidem com plu. Com a chave em sibhId, as duas linhas coexistem.
    const plu = await repo.upsertPorSibhId(
      entrada({ sibhId: 'sibh-933', prefixo: '1001855', tipoEstacao: 'pluviometrico' }),
    );
    const flu = await repo.upsertPorSibhId(
      entrada({ sibhId: 'sibh-35331', prefixo: '1001855', tipoEstacao: 'fluviometrico' }),
    );

    // IDs distintos: não houve sobrescrita.
    expect(flu.id).not.toBe(plu.id);

    const todas = await repo.listar();
    expect(todas.length).toBe(2);

    const porSibh = new Map(todas.map((e) => [e.sibhId, e]));
    expect(porSibh.get('sibh-933')!.tipoEstacao).toBe('pluviometrico');
    expect(porSibh.get('sibh-35331')!.tipoEstacao).toBe('fluviometrico');
    // Ambas mantêm o mesmo prefixo (que deixou de ser único).
    expect(porSibh.get('sibh-933')!.prefixo).toBe('1001855');
    expect(porSibh.get('sibh-35331')!.prefixo).toBe('1001855');
  });

  it('sibhIds diferentes geram linhas distintas', async () => {
    await repo.upsertPorSibhId(entrada({ prefixo: 'P-001' }));
    await repo.upsertPorSibhId(entrada({ prefixo: 'P-002' }));
    expect((await repo.listar()).length).toBe(2);
  });

  it('persiste status de transmissão: normaliza a data crua do SIBH para ISO (migration 0053)', async () => {
    const e = await repo.upsertPorSibhId(
      entrada({
        sibhId: 'sibh-online',
        transmissionStatus: 'ok',
        ultimaTransmissao: 'Wed Jul 15 2026 13:40:00 GMT+0000 (Coordinated Universal Time)',
      }),
    );
    expect(e.transmissionStatus).toBe('ok');
    // Guardado/lido como ISO 8601 (espelha o cast do timestamptz no .pg).
    expect(e.ultimaTransmissao).toBe('2026-07-15T13:40:00.000Z');

    // Releitura por id mantém os valores.
    const relida = await repo.obterPorId(e.id);
    expect(relida!.transmissionStatus).toBe('ok');
    expect(relida!.ultimaTransmissao).toBe('2026-07-15T13:40:00.000Z');
  });

  it('status de transmissão ausente/vazio vira null', async () => {
    const e = await repo.upsertPorSibhId(
      entrada({ sibhId: 'sibh-sem-status', ultimaTransmissao: '', transmissionStatus: null }),
    );
    expect(e.transmissionStatus).toBeNull();
    expect(e.ultimaTransmissao).toBeNull();
  });
});

describe('estações pluviométricas (mock) — listar e obterPorId', () => {
  afterEach(() => {
    _resetEstacoesPluviometricasMock();
  });

  it('ordena por nome', async () => {
    await repo.upsertPorSibhId(entrada({ prefixo: 'A', nome: 'Zumbi' }));
    await repo.upsertPorSibhId(entrada({ prefixo: 'B', nome: 'Abelha' }));
    const nomes = (await repo.listar()).map((e) => e.nome);
    expect(nomes).toEqual(['Abelha', 'Zumbi']);
  });

  it('filtra por bacia e por tipo combinando com AND', async () => {
    await repo.upsertPorSibhId(entrada({ prefixo: 'A', bacia: 'Tietê', tipo: 'manual' }));
    await repo.upsertPorSibhId(entrada({ prefixo: 'B', bacia: 'Tietê', tipo: 'automatico' }));
    await repo.upsertPorSibhId(entrada({ prefixo: 'C', bacia: 'PCJ', tipo: 'manual' }));

    expect((await repo.listar({ bacia: 'Tietê' })).length).toBe(2);
    expect((await repo.listar({ tipo: 'manual' })).length).toBe(2);
    expect((await repo.listar({ bacia: 'Tietê', tipo: 'manual' })).length).toBe(1);
  });

  it('filtra por tipo hidrológico, combinando com AND', async () => {
    await repo.upsertPorSibhId(entrada({ prefixo: 'A', tipoEstacao: 'pluviometrico' }));
    await repo.upsertPorSibhId(entrada({ prefixo: 'B', tipoEstacao: 'fluviometrico' }));
    await repo.upsertPorSibhId(entrada({ prefixo: 'C', tipoEstacao: 'fluviometrico', bacia: 'PCJ' }));

    expect((await repo.listar({ tipoEstacao: 'pluviometrico' })).length).toBe(1);
    expect((await repo.listar({ tipoEstacao: 'fluviometrico' })).length).toBe(2);
    expect((await repo.listar({ tipoEstacao: 'piezometrico' })).length).toBe(0);
    expect(
      (await repo.listar({ tipoEstacao: 'fluviometrico', bacia: 'PCJ' })).length,
    ).toBe(1);
  });

  it('obterPorId devolve a estação e null quando não existe', async () => {
    const e = await repo.upsertPorSibhId(entrada());
    expect((await repo.obterPorId(e.id))?.prefixo).toBe('P-001');
    expect(await repo.obterPorId('inexistente')).toBeNull();
  });
});

describe('estacoes-pluviometricas-repository.pg — regressão de schema', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/infrastructure/db/estacoes-pluviometricas-repository.pg.ts'),
    'utf-8',
  );

  it('usa a tabela e colunas reais da migration 0045', () => {
    expect(source).toMatch(/FROM\s+estacoes_pluviometricas/);
    expect(source).toMatch(/INSERT\s+INTO\s+estacoes_pluviometricas/);
  });

  it('persiste a coluna tipo_estacao (migration 0051) no insert e no update', () => {
    // Coluna no INSERT.
    expect(source).toMatch(/INSERT\s+INTO\s+estacoes_pluviometricas[\s\S]*tipo_estacao/);
    // Atualizada no ON CONFLICT via EXCLUDED (qualificado, sem ambiguidade).
    expect(source).toMatch(/tipo_estacao\s*=\s*EXCLUDED\.tipo_estacao/);
  });

  it('upsert conflita por sibh_id (migration 0052), não mais por prefixo', () => {
    expect(source).toMatch(/ON\s+CONFLICT\s+\(sibh_id\)\s+WHERE\s+sibh_id\s+IS\s+NOT\s+NULL/);
    // A chave antiga (prefixo) não pode mais ser o alvo do conflito.
    expect(source).not.toMatch(/ON\s+CONFLICT\s+\(prefixo\)/);
    // prefixo passa a ser atualizado no DO UPDATE (qualificado com EXCLUDED).
    expect(source).toMatch(/prefixo\s*=\s*EXCLUDED\.prefixo/);
  });

  it('persiste transmission_status e ultima_transmissao (migration 0053) no insert, update e select', () => {
    // Colunas no INSERT.
    expect(source).toMatch(/INSERT\s+INTO\s+estacoes_pluviometricas[\s\S]*transmission_status/);
    expect(source).toMatch(/INSERT\s+INTO\s+estacoes_pluviometricas[\s\S]*ultima_transmissao/);
    // Atualizadas no ON CONFLICT via EXCLUDED (qualificado, sem ambiguidade).
    expect(source).toMatch(/transmission_status\s*=\s*EXCLUDED\.transmission_status/);
    expect(source).toMatch(/ultima_transmissao\s*=\s*EXCLUDED\.ultima_transmissao/);
    // No SELECT (via COLUNAS).
    expect(source).toMatch(/COLUNAS\s*=\s*sql`[^`]*transmission_status[^`]*ultima_transmissao/);
  });

  it('normaliza a data crua do SIBH e casta explicitamente para timestamptz', () => {
    // O formato cru do SIBH (Date#toString) não casta em timestamptz; o repo
    // normaliza pra ISO antes e faz o cast explícito (parâmetro pode ser null).
    expect(source).toMatch(/normalizarTimestampSibh\(/);
    expect(source).toMatch(/::timestamptz/);
  });

  it('todas as queries passam pela tag parametrizada sql (sem string crua)', () => {
    // Não deve existir execução de SQL via sql.unsafe nem montagem de texto
    // com concatenação de variável de usuário neste repo.
    expect(source).not.toMatch(/sql\.unsafe/);
    expect(source).not.toMatch(/FROM\s+["'`]\s*\+/);
  });
});
