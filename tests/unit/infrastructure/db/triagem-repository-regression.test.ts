/**
 * Regressão estática contra o bug em aprovar() que consultava
 * `postos.ativo` (coluna inexistente, ver migration 0002). O esquema usa
 * `deleted_at IS NULL` como flag de atividade. Versões antigas do
 * repositório quebravam toda aprovação de triagem em produção.
 *
 * Teste de smoke: lê o source do repositório e garante que a query
 * de aprovação não volte a referenciar a coluna inexistente. Não exercita
 * o Postgres real (custo alto), apenas trava regressão acidental.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PG_FILE = resolve(
  process.cwd(),
  'src/infrastructure/db/triagem-repository.pg.ts',
);

describe('triagem-repository.pg, regressão de schema', () => {
  const source = readFileSync(PG_FILE, 'utf-8');

  it('não consulta coluna postos.ativo (não existe no schema)', () => {
    expect(source).not.toMatch(/SELECT\s+ativo\s+FROM\s+postos/i);
    expect(source).not.toMatch(/postos\[0\]\.ativo/);
  });

  it('usa deleted_at IS NULL para checar posto ativo na aprovação', () => {
    expect(source).toMatch(/SELECT\s+deleted_at\s+FROM\s+postos/i);
    expect(source).toMatch(/deleted_at\s*!==\s*null/);
  });
});
