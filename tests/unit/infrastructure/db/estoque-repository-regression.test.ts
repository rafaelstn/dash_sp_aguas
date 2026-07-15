/**
 * Regressao ESTATICA do SQL nao-trivial do estoque (aprendizado do projeto:
 * teste verde em SQLite/mock esconde bug de Postgres). Nao exercita o banco;
 * le o source e trava as garantias de concorrencia/integridade que SO existem
 * no `.pg` e nas migrations: UPDATE guardado (`quantidade >= q`), upsert com
 * coluna QUALIFICADA (evita AmbiguousColumn), CHECK(quantidade>=0), XOR do alvo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = process.cwd();
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf-8');

describe('estoque-movimentacoes-repository.pg, garantias de concorrencia', () => {
  const src = ler('src/infrastructure/db/estoque-movimentacoes-repository.pg.ts');

  it('roda a movimentacao numa transacao (sql.begin)', () => {
    expect(src).toMatch(/sql\.begin/);
  });

  it('serializa a unidade com FOR UPDATE', () => {
    expect(src).toMatch(/FOR UPDATE/);
  });

  it('saida usa UPDATE GUARDADO (WHERE quantidade >= q) e trata 0 linhas', () => {
    expect(src).toMatch(/SET quantidade = quantidade - \$\{q\}/);
    expect(src).toMatch(/quantidade >= \$\{q\}/);
    expect(src).toMatch(/SaldoInsuficiente/);
  });

  it('upsert de entrada QUALIFICA a coluna (estoque_saldos.quantidade), sem AmbiguousColumn', () => {
    expect(src).toMatch(/estoque_saldos\.quantidade \+ EXCLUDED\.quantidade/);
    expect(src).toMatch(/ON CONFLICT \(material_id, local_id, COALESCE\(tamanho, ''\)\)/);
  });

  it('valida a maquina de estados na baixa (transicaoValida) dentro da tx', () => {
    expect(src).toMatch(/transicaoValida\(/);
    expect(src).toMatch(/TransicaoStatusInvalida/);
  });

  it('nao le-depois-escreve o saldo (sem SELECT do saldo antes do UPDATE guardado)', () => {
    // O guard atomico proibe o padrao SELECT-para-decidir-e-depois-UPDATE, que
    // reabriria a corrida. O saldo so muda via UPDATE guardado ou upsert.
    expect(src).not.toMatch(/SELECT[^;]*FROM estoque_saldos[^;]*FOR UPDATE/i);
  });
});

describe('migrations do estoque, integridade declarada no banco', () => {
  it('0058 impoe nao-negativo no saldo (CHECK quantidade >= 0)', () => {
    const m = ler('supabase/migrations/0058_estoque_saldos.sql');
    expect(m).toMatch(/quantidade\s+INTEGER\s+NOT NULL\s+DEFAULT 0\s+CHECK \(quantidade >= 0\)/);
    expect(m).toMatch(/uq_estoque_saldos_material_local/);
    expect(m).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('0059 impoe XOR do alvo e origem<>destino na transferencia', () => {
    const m = ler('supabase/migrations/0059_estoque_movimentacoes.sql');
    expect(m).toMatch(/CONSTRAINT ck_estoque_mov_alvo CHECK/);
    expect(m).toMatch(/CONSTRAINT ck_estoque_mov_transf CHECK/);
    expect(m).toMatch(/quantidade\s+INTEGER\s+NOT NULL\s+DEFAULT 1\s+CHECK \(quantidade >= 1\)/);
    expect(m).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('0057 restringe estado e status por CHECK (enum via CHECK, padrao do projeto)', () => {
    const m = ler('supabase/migrations/0057_estoque_unidades.sql');
    expect(m).toMatch(/estado\s+TEXT\s+NULL\s+CHECK \(estado IN \('novo', 'bom', 'usado', 'defeito', 'sucata'\)\)/);
    expect(m).toMatch(/status\s+TEXT\s+NOT NULL\s+DEFAULT 'ativo'\s+CHECK \(status IN \('ativo', 'defeito', 'descarte'\)\)/);
  });

  it('0060 corrige a chave natural: dropa unico de codigo_spaguas, cria unico de codigo', () => {
    const m = ler('supabase/migrations/0060_estoque_unidades_chave_codigo.sql');
    // codigo_spaguas deixa de ser unico (e lote/projeto, nao patrimonio por unidade)
    expect(m).toMatch(/DROP INDEX IF EXISTS uq_estoque_unidades_codigo_spaguas/);
    // codigo passa a ser o identificador unico por unidade (parcial)
    expect(m).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_unidades_codigo\s+ON estoque_unidades \(codigo\) WHERE codigo IS NOT NULL/,
    );
    // codigo_spaguas continua consultavel, mas NAO-unico
    expect(m).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_estoque_unidades_codigo_spaguas\s+ON estoque_unidades \(codigo_spaguas\) WHERE codigo_spaguas IS NOT NULL/,
    );
  });
});
