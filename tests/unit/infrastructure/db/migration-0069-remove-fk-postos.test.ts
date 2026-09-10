/**
 * Guarda de TEXTO da migration 0069, que roda na bancada sem Docker.
 *
 * A prova forte e a regua de catalogo (tests/integration/acoplamento-postos-fk-
 * postgres.test.ts), que so roda no CI com Postgres. Esta guarda barata pega
 * mais cedo o caso de alguem editar a 0069 e remover um dos DROP: cada uma das
 * nove FKs medidas em producao em 10/09/2026 tem que continuar sendo removida
 * pelo nome real, que e o que `DROP CONSTRAINT IF EXISTS` precisa acertar para
 * ter efeito (a 0067 provou que texto so vale quando acerta o nome do catalogo).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CAMINHO = resolve(
  process.cwd(),
  'supabase/migrations/0069_dados_proprios_sem_fk_para_postos.sql',
);
const sql = readFileSync(CAMINHO, 'utf-8');

// As nove, pelo nome real do catalogo de producao (10/09/2026).
const CONSTRAINTS = [
  'fichas_visita_prefixo_fkey',
  'fichas_triagem_prefixo_fkey',
  'postos_favoritos_prefixo_fkey',
  'postos_fotos_prefixo_fkey',
  'posto_indexacao_cache_prefixo_fkey',
  'postos_caminhos_prefixo_fkey',
  'postos_evento_posto_id_fkey',
  'ana_revisao_estacao_posto_id_fkey',
  'ana_revisao_estacao_match_sugerido_posto_id_fkey',
];

describe('0069 remove as nove FKs para postos, de forma reaplicavel', () => {
  it.each(CONSTRAINTS)('remove %s pelo nome real', (nome) => {
    expect(sql).toMatch(
      new RegExp(`DROP CONSTRAINT IF EXISTS\\s+${nome}\\b`),
    );
  });

  it('tem a rede de seguranca que varre o catalogo por nome divergente', () => {
    expect(sql).toMatch(/confrelid\s*=\s*'postos'::regclass/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS %I/);
  });

  it('NAO remove coluna nem indice: some so a restricao', () => {
    // O prefixo e a chave natural e os indices por prefixo ficam. Remover coluna
    // aqui seria outra decisao (o caso da 0068), e nao e o desta migration.
    expect(sql).not.toMatch(/DROP COLUMN/);
    expect(sql).not.toMatch(/DROP INDEX/);
  });
});
