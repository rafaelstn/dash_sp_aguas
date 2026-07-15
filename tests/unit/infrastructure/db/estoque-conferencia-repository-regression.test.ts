/**
 * Regressao ESTATICA do SQL nao-trivial da conferencia fisica (aprendizado do
 * projeto: teste verde em SQLite/mock esconde bug de Postgres). Nao exercita o
 * banco; le o source e trava as garantias que SO existem no `.pg` e nas
 * migrations: snapshot via INSERT..SELECT, coluna GENERATED da diferenca,
 * reconciliacao reusando o helper de tx (sem 2a sql.begin/conexao), idempotencia
 * por reconciliado_em, FOR UPDATE, aviso de base alterada, XOR e RLS.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = process.cwd();
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf-8');

describe('estoque-conferencias-repository.pg, snapshot + reconciliacao', () => {
  const src = ler('src/infrastructure/db/estoque-conferencias-repository.pg.ts');

  it('abre a sessao + snapshot numa transacao (sql.begin)', () => {
    expect(src).toMatch(/sql\.begin/);
  });

  it('snapshot serializado via INSERT ... SELECT (unidades ativo|defeito no escopo)', () => {
    expect(src).toMatch(/INSERT INTO estoque_conferencia_itens[\s\S]*SELECT[\s\S]*FROM estoque_unidades u/);
    expect(src).toMatch(/u\.status IN \('ativo', 'defeito'\)/);
    expect(src).toMatch(/JOIN estoque_locais l ON l\.id = u\.local_id/);
  });

  it('snapshot quantificavel via INSERT ... SELECT congela quantidade (s.quantidade)', () => {
    expect(src).toMatch(/FROM estoque_saldos s/);
    expect(src).toMatch(/s\.quantidade > 0/);
    // quantidade_sistema recebe s.quantidade (congelada) na projecao do snapshot.
    expect(src).toMatch(/s\.material_id, s\.local_id, s\.tamanho, s\.quantidade/);
  });

  it('reconciliar trava o item com FOR UPDATE dentro da transacao', () => {
    expect(src).toMatch(/FOR UPDATE/);
  });

  it('reconciliar e idempotente pela guarda reconciliado_em (no-op se ja setado)', () => {
    expect(src).toMatch(/item\.reconciliadoEm !== null/);
    expect(src).toMatch(/jaReconciliado: true/);
  });

  it('reconciliar reusa aplicarMovimentacaoNaTx com o MESMO tx (nao abre 2a sql.begin)', () => {
    expect(src).toMatch(/import \{ aplicarMovimentacaoNaTx \} from '\.\/estoque-movimentacoes-repository\.pg'/);
    expect(src).toMatch(/aplicarMovimentacaoNaTx\(\s*tx,/);
    // NUNCA chamar o registrar() publico de dentro da transacao (abriria outra conexao).
    expect(src).not.toMatch(/estoqueMovimentacoesRepository\.registrar/);
  });

  it('carimba conferencia_id na movimentacao gerada', () => {
    expect(src).toMatch(/aplicarMovimentacaoNaTx\(\s*tx,\s*\{ \.\.\.cmd, usuarioId \},\s*conferenciaId,?\s*\)/);
  });

  it('avisa base_alterada re-lendo o saldo atual (COALESCE do tamanho)', () => {
    expect(src).toMatch(/SELECT quantidade FROM estoque_saldos/);
    expect(src).toMatch(/COALESCE\(tamanho, ''\) = COALESCE\(\$\{item\.tamanho\}, ''\)/);
    expect(src).toMatch(/aviso = 'base_alterada'/);
  });

  it('guarda de IDOR: item lido por id + conferencia_id juntos', () => {
    expect(src).toMatch(/WHERE id = \$\{itemId\}::uuid AND conferencia_id = \$\{conferenciaId\}::uuid/);
  });
});

describe('estoque-movimentacoes-repository.pg, refactor do nucleo transacional', () => {
  const src = ler('src/infrastructure/db/estoque-movimentacoes-repository.pg.ts');

  it('exporta aplicarMovimentacaoNaTx(tx, cmd, conferenciaId) reusavel', () => {
    expect(src).toMatch(/export async function aplicarMovimentacaoNaTx\(/);
    expect(src).toMatch(/conferenciaId: string \| null/);
  });

  it('registrar() virou wrapper fino sobre o nucleo (sql.begin -> aplicarMovimentacaoNaTx)', () => {
    expect(src).toMatch(/sql\.begin\(async \(tx\) =>\s*\n?\s*aplicarMovimentacaoNaTx\(/);
  });

  it('COLUNAS_MOV passa a ler conferencia_id (coluna 0064)', () => {
    expect(src).toMatch(/conferencia_id, criado_em/);
  });
});

describe('migrations da conferencia, integridade declarada no banco', () => {
  it('0062 tem indice unico parcial de escopo aberto + RLS + CHECK de conclusao', () => {
    const m = ler('supabase/migrations/0062_estoque_conferencias.sql');
    expect(m).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_conf_aberta_escopo[\s\S]*WHERE status = 'aberta'/,
    );
    expect(m).toMatch(/CONSTRAINT ck_estoque_conf_concluida CHECK/);
    expect(m).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('0063 tem diferenca GENERATED STORED, XOR do alvo, CHECK de natureza, unicos e RLS', () => {
    const m = ler('supabase/migrations/0063_estoque_conferencia_itens.sql');
    expect(m).toMatch(
      /diferenca\s+INTEGER\s+GENERATED ALWAYS AS \(quantidade_contada - quantidade_sistema\) STORED/,
    );
    expect(m).toMatch(/CONSTRAINT ck_estoque_conf_item_alvo CHECK/);
    expect(m).toMatch(/CONSTRAINT ck_estoque_conf_item_natureza CHECK/);
    expect(m).toMatch(/uq_estoque_conf_item_unidade/);
    expect(m).toMatch(/uq_estoque_conf_item_material/);
    expect(m).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('0064 adiciona conferencia_id aditiva (ADD COLUMN IF NOT EXISTS) + indice parcial', () => {
    const m = ler('supabase/migrations/0064_estoque_movimentacoes_conferencia_id.sql');
    expect(m).toMatch(/ADD COLUMN IF NOT EXISTS conferencia_id UUID NULL REFERENCES estoque_conferencias/);
    expect(m).toMatch(/idx_estoque_mov_conferencia[\s\S]*WHERE conferencia_id IS NOT NULL/);
  });
});
