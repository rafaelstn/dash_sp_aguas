/**
 * Catraca ESTATICA do append-only do ledger (migration 0074).
 *
 * O que ela mede e o que ela NAO mede, para ninguem confundir as duas coisas:
 * ela le o TEXTO da migration e do repositorio, entao prova que a guarda
 * continua escrita e denuncia quem a remover num refactor. A prova de
 * COMPORTAMENTO (o banco recusando UPDATE e DELETE pelo papel da aplicacao) e
 * tests/integration/estoque-movimentacoes-append-only-postgres.test.ts, que roda
 * so no job `integracao` do CI, com Postgres de pe. Na bancada sem Docker, o
 * comportamento fica NAO MEDIDO e esta catraca e o que sobra.
 *
 * Mesmo padrao das outras regressoes estaticas do modulo (teste verde em mock
 * esconde bug de Postgres: o SQL que importa so existe no `.pg` e nas
 * migrations).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = process.cwd();
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf-8');

describe('migration 0074, append-only de estoque_movimentacoes', () => {
  const sql = ler('supabase/migrations/0074_estoque_movimentacoes_append_only.sql');

  it('o arquivo da migration existe e tem conteudo (ancora das demais assercoes)', () => {
    expect(sql.length).toBeGreaterThan(500);
  });

  it('camada 1: REVOKE UPDATE, DELETE do PUBLIC, na forma da 0025', () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE ON estoque_movimentacoes FROM PUBLIC;/);
  });

  it('camada 1: nomeia por RAISE a concessao DIRETA que o REVOKE do PUBLIC nao alcanca', () => {
    // Le a ACL real (aclexplode), e nao has_table_privilege, que responde true
    // por heranca de grupo e nao separa direto de herdado.
    expect(sql).toMatch(/aclexplode\(c\.relacl\)/);
    expect(sql).toMatch(/a\.privilege_type IN \('UPDATE', 'DELETE'\)/);
    expect(sql).toMatch(/a\.grantee <> c\.relowner/);
    expect(sql).toMatch(/RAISE WARNING '0074:/);
  });

  it('camada 2: gatilho cobre UPDATE **e** DELETE, por linha', () => {
    // Cobrir so UPDATE deixaria o DELETE direto apagando linha da trilha, que e
    // o pior dos dois casos (nao sobra nem vestigio).
    expect(sql).toMatch(
      /CREATE TRIGGER estoque_mov_append_only\s+BEFORE UPDATE OR DELETE ON estoque_movimentacoes\s+FOR EACH ROW EXECUTE FUNCTION trg_estoque_mov_append_only\(\)/,
    );
  });

  it('camada 2: a funcao RECUSA, com codigo distinto do de privilegio', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION trg_estoque_mov_append_only\(\)/);
    expect(sql).toMatch(/RAISE EXCEPTION\s+'estoque_movimentacoes e append-only/);
    expect(sql).toMatch(/USING ERRCODE = 'check_violation'/);
    // 42501 (insufficient_privilege) e o que a camada 1 produz: usar o mesmo
    // codigo nas duas cegaria qualquer regua que julgue a recusa pelo codigo.
    // A assercao e sobre o ERRCODE levantado, nao sobre a palavra: na primeira
    // escrita ela reprovou o arquivo correto, porque casava no comentario que
    // explica justamente por que esse codigo nao e usado.
    expect(sql).not.toMatch(/USING ERRCODE = '(insufficient_privilege|42501)'/);
  });

  it('a guarda de idempotencia do gatilho pergunta pelo par (nome, tabela)', () => {
    // So por tgname, um homonimo em outra tabela faria a migration pular o
    // CREATE e sair verde sem gatilho nenhum aqui.
    expect(sql).toMatch(
      /FROM pg_trigger\s+WHERE tgname = 'estoque_mov_append_only'\s+AND tgrelid = 'public\.estoque_movimentacoes'::regclass/,
    );
  });

  it('reescreve o COMMENT da tabela nomeando a guarda (a 0059 nao se edita)', () => {
    expect(sql).toMatch(/COMMENT ON TABLE estoque_movimentacoes IS/);
    expect(sql).toMatch(/recusados pelo gatilho estoque_mov_append_only \(0074\)/);
  });

  it('cabecalho traz reversao e ordem de deploy, como a 0064', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS estoque_mov_append_only ON estoque_movimentacoes;/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS trg_estoque_mov_append_only\(\);/);
    expect(sql).toMatch(/ORDEM DE DEPLOY/);
    expect(sql).toMatch(/Migration commitada\s*\n?--\s*!= migration aplicada\.|commitada != migration aplicada/);
  });
});

describe('o produto continua sem UPDATE/DELETE no ledger', () => {
  const repo = ler('src/infrastructure/db/estoque-movimentacoes-repository.pg.ts');

  it('o ledger e escrito por INSERT (ancora de presenca da assercao seguinte)', () => {
    expect(repo).toMatch(/INSERT INTO estoque_movimentacoes/);
  });

  it('nenhum UPDATE nem DELETE em estoque_movimentacoes no repositorio', () => {
    // Correcao de lancamento e linha nova tipo 'ajuste' (ADR 0020). Se este caso
    // reprovar, a pergunta nao e como fazer a regua passar: e por que o produto
    // passou a reescrever trilha de auditoria.
    expect(repo).not.toMatch(/UPDATE estoque_movimentacoes/);
    expect(repo).not.toMatch(/DELETE FROM estoque_movimentacoes/);
  });
});
