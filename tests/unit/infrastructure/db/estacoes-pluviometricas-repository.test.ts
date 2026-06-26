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
 * por prefixo). O adapter .pg real não toca Postgres aqui; é coberto por
 * regressão estática de schema no fim do arquivo (padrão
 * triagem-repository-regression).
 */

function entrada(over: Partial<UpsertEstacaoPluviometrica> = {}): UpsertEstacaoPluviometrica {
  return {
    prefixo: 'P-001',
    nome: 'Estação Cabreúva',
    lat: -23.3,
    lng: -47.1,
    tipo: 'automatico',
    ...over,
  };
}

describe('estações pluviométricas (mock) — upsertPorPrefixo', () => {
  afterEach(() => {
    _resetEstacoesPluviometricasMock();
  });

  it('insere quando o prefixo é novo e preenche defaults nuláveis', async () => {
    const e = await repo.upsertPorPrefixo(entrada());
    expect(e.id).toBeTruthy();
    expect(e.prefixo).toBe('P-001');
    expect(e.bacia).toBeNull();
    expect(e.postoId).toBeNull();
    expect(e.sibhId).toBeNull();
    expect(e.criadoEm).toBeInstanceOf(Date);
  });

  it('é idempotente: reprocessar o mesmo prefixo mantém o id e atualiza campos', async () => {
    const primeira = await repo.upsertPorPrefixo(entrada({ nome: 'Nome Velho' }));
    const segunda = await repo.upsertPorPrefixo(
      entrada({ nome: 'Nome Novo', bacia: 'Tietê', tipo: 'manual' }),
    );

    expect(segunda.id).toBe(primeira.id);
    expect(segunda.nome).toBe('Nome Novo');
    expect(segunda.bacia).toBe('Tietê');
    expect(segunda.tipo).toBe('manual');

    const todas = await repo.listar();
    expect(todas.length).toBe(1);
  });

  it('prefixos diferentes geram linhas distintas', async () => {
    await repo.upsertPorPrefixo(entrada({ prefixo: 'P-001' }));
    await repo.upsertPorPrefixo(entrada({ prefixo: 'P-002' }));
    expect((await repo.listar()).length).toBe(2);
  });
});

describe('estações pluviométricas (mock) — listar e obterPorId', () => {
  afterEach(() => {
    _resetEstacoesPluviometricasMock();
  });

  it('ordena por nome', async () => {
    await repo.upsertPorPrefixo(entrada({ prefixo: 'A', nome: 'Zumbi' }));
    await repo.upsertPorPrefixo(entrada({ prefixo: 'B', nome: 'Abelha' }));
    const nomes = (await repo.listar()).map((e) => e.nome);
    expect(nomes).toEqual(['Abelha', 'Zumbi']);
  });

  it('filtra por bacia e por tipo combinando com AND', async () => {
    await repo.upsertPorPrefixo(entrada({ prefixo: 'A', bacia: 'Tietê', tipo: 'manual' }));
    await repo.upsertPorPrefixo(entrada({ prefixo: 'B', bacia: 'Tietê', tipo: 'automatico' }));
    await repo.upsertPorPrefixo(entrada({ prefixo: 'C', bacia: 'PCJ', tipo: 'manual' }));

    expect((await repo.listar({ bacia: 'Tietê' })).length).toBe(2);
    expect((await repo.listar({ tipo: 'manual' })).length).toBe(2);
    expect((await repo.listar({ bacia: 'Tietê', tipo: 'manual' })).length).toBe(1);
  });

  it('obterPorId devolve a estação e null quando não existe', async () => {
    const e = await repo.upsertPorPrefixo(entrada());
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

  it('upsert casa com o índice único parcial de prefixo', () => {
    expect(source).toMatch(/ON\s+CONFLICT\s+\(prefixo\)\s+WHERE\s+prefixo\s+IS\s+NOT\s+NULL/);
  });

  it('todas as queries passam pela tag parametrizada sql (sem string crua)', () => {
    // Não deve existir execução de SQL via sql.unsafe nem montagem de texto
    // com concatenação de variável de usuário neste repo.
    expect(source).not.toMatch(/sql\.unsafe/);
    expect(source).not.toMatch(/FROM\s+["'`]\s*\+/);
  });
});
