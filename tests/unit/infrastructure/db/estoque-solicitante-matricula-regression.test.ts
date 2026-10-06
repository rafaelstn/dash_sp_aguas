/**
 * Catraca ESTÁTICA do campo `solicitante_matricula` (migration 0075,
 * 06/10/2026). Não exercita banco: lê o source e a migration.
 *
 * O defeito que ela existe para reprovar é de OMISSÃO, e por isso nenhum teste
 * de comportamento o pega: a tabela tem DUAS listas de colunas e DOIS INSERTs no
 * mesmo adapter (`src/infrastructure/db/estoque-movimentacoes-repository.pg.ts`).
 * Quem acrescenta coluna e atualiza só o caminho que estava usando deixa a outra
 * metade silenciosamente sem o campo: a trilha paginada mostraria a matrícula e
 * a planilha exportada não, ou a saída serializada gravaria e a quantificável
 * não, as duas sem erro nenhum.
 *
 * Como ela se mantém viva: a lista de colunas do export é DERIVADA de
 * `COLUNAS_MOV` dentro do próprio teste, nome por nome. Coluna nova em
 * `COLUNAS_MOV` sem o par `em.<coluna>` no SELECT do export reprova sozinha, sem
 * ninguém ter de lembrar de editar este arquivo. Lista escrita à mão aqui
 * envelheceria e passaria a aprovar a omissão seguinte.
 *
 * O que ela NÃO mede: que o Postgres aceita o SQL, que a migration foi aplicada
 * e que a constraint existe no catálogo. Isso é
 * tests/integration/estoque-movimentacoes-solicitante-postgres.test.ts, no job
 * `integracao` do CI. Migration commitada não é migration aplicada.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = process.cwd();
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf-8');

const CAMINHO_PG = 'src/infrastructure/db/estoque-movimentacoes-repository.pg.ts';
const CAMINHO_0075 =
  'supabase/migrations/0075_estoque_movimentacoes_solicitante_matricula.sql';
const COLUNA = 'solicitante_matricula';

const srcPg = ler(CAMINHO_PG);
const m0075 = ler(CAMINHO_0075);

/**
 * `COLUNAS_MOV`, o template de colunas do ledger. O recorte termina na crase que
 * fecha o template: fronteira real, e não `[\s\S]*?`, que atravessaria o resto
 * do arquivo e faria a asserção passar por achar a coluna em OUTRO lugar
 * qualquer (foi assim que um mutante sobreviveu a uma régua minha em
 * 05/10/2026).
 */
function listaColunasMov(): string[] {
  const m = srcPg.match(/const COLUNAS_MOV = \(\) => sql`([^`]*)`/);
  // Âncora de PRESENÇA: sem ela, renomear `COLUNAS_MOV` faria a régua aprovar
  // por não achar nada para reprovar.
  expect(m, `${CAMINHO_PG}: COLUNAS_MOV nao encontrado`).not.toBeNull();
  return m![1]!
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/** O SELECT qualificado de `listarParaExport`, recortado pelo mesmo critério. */
function selectDoExport(): string {
  const m = srcPg.match(/SELECT em\.id,([^`]*?)FROM estoque_movimentacoes em/);
  expect(m, `${CAMINHO_PG}: SELECT de listarParaExport nao encontrado`).not.toBeNull();
  return `SELECT em.id,${m![1]!}`;
}

/** Os INSERTs no ledger, um por caminho de escrita. */
function insertsNoLedger(): string[] {
  return [
    ...srcPg.matchAll(/INSERT INTO estoque_movimentacoes \(([^`]*?)RETURNING/g),
  ].map((m) => m[1]!);
}

describe('as DUAS listas de colunas do ledger concordam', () => {
  it('COLUNAS_MOV carrega a coluna do solicitante', () => {
    expect(listaColunasMov()).toContain(COLUNA);
  });

  it('cada coluna de COLUNAS_MOV tem o par em.<coluna> no SELECT do export', () => {
    const colunas = listaColunasMov();
    const select = selectDoExport();
    // Contagem do PRÓPRIO escopo, nomeada: lista vazia aprovaria tudo.
    expect(colunas.length).toBeGreaterThanOrEqual(16);
    const faltando = colunas.filter((c) => !select.includes(`em.${c}`));
    expect(faltando).toEqual([]);
  });

  it('o SELECT do export não inventa coluna do ledger que COLUNAS_MOV não tem', () => {
    // O outro sentido da catraca. Sem ele, coluna removida de COLUNAS_MOV e
    // esquecida no export viraria erro 42703 só em produção, no download.
    const colunas = listaColunasMov();
    const doExport = [...selectDoExport().matchAll(/\bem\.([a-z_]+)/g)].map((m) => m[1]!);
    expect(doExport.length).toBeGreaterThanOrEqual(16);
    const sobrando = [...new Set(doExport)].filter((c) => !colunas.includes(c));
    expect(sobrando).toEqual([]);
  });
});

describe('os DOIS INSERTs no ledger gravam o solicitante', () => {
  it('existem exatamente dois caminhos de escrita, e a régua varre os dois', () => {
    // Catraca de QUANTIDADE: um terceiro INSERT no ledger reprova aqui e obriga
    // quem o escreveu a decidir o que fazer com o campo, em vez de herdar NULL
    // calado. Serializado e quantificavel sao os dois caminhos de hoje.
    expect(insertsNoLedger()).toHaveLength(2);
  });

  it('cada INSERT nomeia a coluna e passa o valor do comando', () => {
    const inserts = insertsNoLedger();
    for (const [i, bloco] of inserts.entries()) {
      expect(bloco, `INSERT ${i + 1}: coluna ausente`).toContain(COLUNA);
      // O valor vem do COMANDO do domínio, e não de variável local montada no
      // adapter: é o domínio que valida o formato.
      expect(bloco, `INSERT ${i + 1}: valor ausente`).toContain('cmd.solicitanteMatricula');
    }
  });

  it('a linha lida e o mapeamento para o domínio carregam o campo', () => {
    // Sem isto, gravar sem ler devolveria `undefined` no DTO e a tela mostraria
    // vazio para toda saída, sem erro nenhum.
    expect(srcPg).toMatch(/solicitante_matricula: string \| null;/);
    expect(srcPg).toMatch(/solicitanteMatricula: l\.solicitante_matricula/);
  });
});

describe('a migration 0075 usa NOT VALID e não mexe no passado', () => {
  it('as duas constraints entram com NOT VALID', () => {
    for (const nome of [
      'ck_estoque_mov_matricula_formato',
      'ck_estoque_mov_saida_solicitante',
    ]) {
      // Fronteira = o ponto e vírgula que fecha o ALTER TABLE. `[^;]` não
      // atravessa statement, então o `NOT VALID` que a asserção procura tem de
      // estar NESTE comando, e não em outro lugar do arquivo.
      const bloco = m0075.match(new RegExp(`ADD CONSTRAINT ${nome}([^;]*);`));
      expect(bloco, `${nome}: ADD CONSTRAINT nao encontrado`).not.toBeNull();
      expect(bloco![1]!, `${nome}: sem NOT VALID`).toMatch(/NOT VALID/);
    }
  });

  it('cada ADD CONSTRAINT é guardado pelo par (conname, conrelid)', () => {
    // `conname` é único por TABELA, não por banco: guarda só pelo nome faria a
    // migration pular o ADD CONSTRAINT por causa de homônima em outra tabela e
    // sair verde sem guarda nenhuma. Mesmo par da 0074 com (tgname, tgrelid).
    const guardas = [...m0075.matchAll(/conname = '([a-z_]+)'\s*\n\s*AND conrelid =/g)];
    expect(guardas.map((g) => g[1]!).sort()).toEqual([
      'ck_estoque_mov_matricula_formato',
      'ck_estoque_mov_saida_solicitante',
    ]);
  });

  it('não existe backfill nem isenção por DATA', () => {
    // Âncora de PRESENÇA primeiro: asserção de ausência sobre arquivo que não
    // foi lido, ou que mudou de nome, aprovaria calada.
    expect(m0075).toContain('ADD COLUMN IF NOT EXISTS solicitante_matricula TEXT');
    expect(m0075).toMatch(/NOT VALID/);
    // O que foi deliberadamente retirado do contrato em 06/10/2026: a data de
    // corte sobre `criado_em` e qualquer escrita em linha existente. A única
    // isenção é semântica (`conferencia_id IS NOT NULL`), e o passado é
    // responsabilidade do NOT VALID.
    expect(m0075).not.toMatch(/criado_em\s*[<>]/);
    expect(m0075).not.toMatch(/^\s*UPDATE estoque_movimentacoes/m);
    expect(m0075).toContain('conferencia_id IS NOT NULL');
  });

  it('o COMMENT de cada constraint datado explica o NOT VALID a quem ler o banco', () => {
    // Quem mexer no banco olha o catálogo, não o relatório de quem escreveu a
    // migration. Por isso a explicação mora no COMMENT, e esta régua reprova
    // quem reescrever o comentário sem ela.
    const comentarios = [
      ...m0075.matchAll(/COMMENT ON CONSTRAINT ([a-z_]+) ON estoque_movimentacoes IS\s*'([^']*)'/g),
    ];
    expect(comentarios.map((c) => c[1]!).sort()).toEqual([
      'ck_estoque_mov_matricula_formato',
      'ck_estoque_mov_saida_solicitante',
    ]);
    for (const c of comentarios) {
      const texto = c[2]!;
      expect(texto, `${c[1]}: sem a data`).toContain('06/10/2026');
      expect(texto, `${c[1]}: nao diz que e NOT VALID de proposito`).toMatch(
        /NOT VALID de proposito/,
      );
      expect(texto, `${c[1]}: nao avisa do VALIDATE CONSTRAINT`).toMatch(
        /VALIDATE CONSTRAINT/,
      );
    }
  });

  it('o cabeçalho registra a convivência com o gatilho da 0074 e o que não foi medido', () => {
    expect(m0075).toContain('estoque_mov_append_only');
    expect(m0075).toMatch(/BEFORE UPDATE OR DELETE/);
    expect(m0075).toMatch(/A MASCARA REAL DA MATRICULA DO ORGAO NAO FOI MEDIDA/);
    // A migration aponta quem mede no lugar da bancada sem Docker. Doc que cita
    // caso de teste pelo caminho quebra ao renomear, e é esta linha que
    // denuncia.
    expect(m0075).toContain(
      'tests/integration/estoque-movimentacoes-solicitante-postgres.test.ts',
    );
  });

  it('o caso de integração citado pela migration existe de fato', () => {
    // A linha acima é um ponteiro: ponteiro com alvo ausente REPROVA, senão a
    // migration promete uma prova que ninguém roda.
    const integracao = ler('tests/integration/estoque-movimentacoes-solicitante-postgres.test.ts');
    expect(integracao).toContain('ck_estoque_mov_saida_solicitante');
    expect(integracao).toContain('convalidated');
  });
});
