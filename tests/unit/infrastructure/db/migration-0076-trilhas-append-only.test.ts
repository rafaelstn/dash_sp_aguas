/**
 * Guarda de TEXTO da migration 0076, e a catraca de completude das trilhas.
 * Roda na bancada sem Docker, e no CI roda em TODO run, nao so no job que sobe
 * Postgres.
 *
 * A prova forte e a regua de catalogo e de efeito
 * (tests/integration/trilhas-append-only-postgres.test.ts), que precisa de banco
 * de pe. Esta guarda barata existe por dois motivos distintos:
 *
 * 1. pega mais cedo a edicao que esvazia a 0076 (remover um CREATE TRIGGER,
 *    trocar o sentinela da mensagem, apagar um dos DROP CONSTRAINT);
 * 2. carrega a CATRACA DE COMPLETUDE, que e o que impede a 0076 de envelhecer:
 *    toda tabela que receber `REVOKE UPDATE, DELETE` numa migration futura tem
 *    de ter decisao escrita sobre append-only. Sem ela, o defeito medido em
 *    06/10/2026 se repete: COMMENT e cabecalho afirmando imutabilidade que o
 *    banco nao sustenta, porque privilegio nao media o acesso do DONO da tabela
 *    e a aplicacao conecta como dono (ADR-0024).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPEND_ONLY_DE_OUTRA_MIGRATION,
  EXCLUIDAS_DO_APPEND_ONLY,
  TRILHAS_APPEND_ONLY,
  tabelasComRevokeNasMigrations,
} from '../../../apoio/trilha-append-only';

const CAMINHO = resolve(process.cwd(), 'supabase/migrations/0076_trilhas_append_only.sql');
const sql = readFileSync(CAMINHO, 'utf-8');

/**
 * O mesmo arquivo SEM as linhas de comentario. Quase tudo aqui mede ISTO, nos
 * dois sentidos, e por dois motivos diferentes:
 *
 * - AUSENCIA: o cabecalho da 0076 explica por extenso que `TRUNCATE` nao
 *   dispara gatilho de linha e continua sendo o buraco conhecido. Regua que
 *   varre o arquivo cru reprovaria justamente a documentacao do risco, mandando
 *   apaga-la.
 * - PRESENCA: medido em 06/10/2026, com o mutante que comentava
 *   `DROP CONSTRAINT IF EXISTS postos_evento_ator_id_fkey`. No texto cru a
 *   linha comentada ainda casava, e a regua ficou VERDE sobre a FK de volta,
 *   que e o defeito que a 0076 existe para fechar. Comentar e a forma mais
 *   provavel de alguem desligar um pedaco desta migration, entao e exatamente o
 *   caso que a regua tem de pegar.
 *
 * A excecao e o caso do cabecalho, que mede o comentario de proposito e por
 * isso le `sql`.
 */
const executavel = sql
  .split('\n')
  .filter((linha) => !/^\s*--/.test(linha))
  .join('\n');

/** FKs cuja acao referencial ESCREVIA em linha ja gravada da trilha. */
const FKS_REMOVIDAS = [
  'triagem_eventos_ator_id_fkey',
  'ana_revisao_evento_ator_id_fkey',
  'ana_revisao_evento_estacao_id_fkey',
  'postos_evento_ator_id_fkey',
];

describe('0076 poe a segunda camada de append-only nas quatro trilhas', () => {
  it.each(Object.entries(TRILHAS_APPEND_ONLY))(
    'cria o gatilho de %s com o nome que o apoio e as suites usam',
    (tabela, gatilho) => {
      // O par (tabela, gatilho) tem de bater com o mapa de
      // tests/apoio/trilha-append-only.ts, que e quem as outras suites usam para
      // desligar o gatilho na limpeza: nome divergente deixaria a limpeza
      // falhando no CI com cara de produto quebrado.
      expect(executavel).toMatch(new RegExp(`'${tabela}'\\s*,\\s*'${gatilho}'`));
    },
  );

  it('o gatilho e BEFORE UPDATE OR DELETE e FOR EACH ROW', () => {
    // AFTER nao impede a escrita, e FOR EACH STATEMENT nao ve a linha: os dois
    // deixariam o arquivo com cara de guarda e sem guarda.
    expect(executavel).toMatch(/BEFORE UPDATE OR DELETE ON %I/);
    expect(executavel).toMatch(/FOR EACH ROW EXECUTE FUNCTION trg_trilha_append_only\(\)/);
  });

  it('a recusa carrega o sentinela que SO ela produz, e nao o codigo do privilegio', () => {
    // Quem nomeia a camada que recusou e a mensagem, nunca o codigo: gatilho que
    // levanta com 42501 fica indistinguivel do `permission denied` do
    // privilegio, e a assercao que julga pelo codigo cega quando ha duas
    // camadas. Por isso `check_violation`, e por isso o prefixo no texto.
    expect(executavel).toMatch(/'trilha-append-only:%: % recusado\./);
    expect(executavel).toMatch(/USING ERRCODE = 'check_violation'/);
    expect(executavel).not.toMatch(/USING ERRCODE = 'insufficient_privilege'/);
    expect(executavel).not.toMatch(/USING ERRCODE = '42501'/);
  });

  it('a excecao de LGPD e de MAO UNICA: so ip e user_agent, so para NULL, resto identico', () => {
    // Sem a comparacao do resto da linha, anular o ip no mesmo UPDATE abriria
    // caminho para reescrever qualquer campo da trilha; sem exigir que o estado
    // ANTERIOR tivesse PII, a porta serviria para gravar NULL por cima de nada.
    // O `::text` nos operandos de `jsonb - ` nao e enfeite: sem ele o Postgres
    // nao decide entre `jsonb - text`, `- text[]` e `- integer`.
    expect(executavel).toMatch(/antes\s*-\s*'ip'::text\s*-\s*'user_agent'::text/);
    expect(executavel).toMatch(/depois\s*-\s*'ip'::text\s*-\s*'user_agent'::text/);
    expect(executavel).toMatch(/\(depois ->> 'ip'\) IS NULL/);
    expect(executavel).toMatch(/\(antes ->> 'ip'\) IS NOT NULL/);
    // E a excecao vale so no UPDATE: DELETE nao tem versao legitima.
    expect(executavel).toMatch(/IF TG_OP = 'UPDATE' THEN/);
  });

  it.each(FKS_REMOVIDAS)('remove %s, cuja acao referencial escrevia na trilha', (nome) => {
    // Pelo nome real, que e o que `DROP CONSTRAINT IF EXISTS` precisa acertar
    // para ter efeito (licao da 0067 e da 0069).
    expect(executavel).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS\\s+${nome}\\b`));
  });

  it('tem a rede de seguranca que varre o catalogo por acao de escrita', () => {
    // Nome divergente em producao nao pode deixar a FK de pe: a varredura julga
    // pela ACAO (CASCADE, SET NULL, SET DEFAULT), nao pelo nome.
    expect(executavel).toMatch(/confdeltype IN \('c', 'n', 'd'\)/);
    expect(executavel).toMatch(/confupdtype IN \('c', 'n', 'd'\)/);
    expect(executavel).toMatch(/DROP CONSTRAINT IF EXISTS %I/);
  });

  it('a criacao do gatilho e idempotente pelo PAR (tgname, tgrelid)', () => {
    // `tgname` e unico por TABELA, nao por banco: guarda so pelo nome deixaria
    // a segunda tabela sem gatilho na reaplicacao.
    expect(executavel).toMatch(/FROM pg_trigger/);
    expect(executavel).toMatch(/WHERE tgname =/);
    expect(executavel).toMatch(/AND tgrelid =/);
  });

  it('NAO apaga tabela nem altera dado: a migration so mexe em schema', () => {
    // Trilha de auditoria de orgao publico. Migration que apaga linha aqui nao
    // e migration, e incidente. Medido no EXECUTAVEL: o cabecalho explica o
    // buraco do TRUNCATE de proposito, e isso tem de continuar escrito.
    expect(executavel).not.toMatch(/DROP TABLE/i);
    expect(executavel).not.toMatch(/\bTRUNCATE\b/i);
    expect(executavel).not.toMatch(/^\s*DELETE FROM/im);
    // `UPDATE` aparece em REVOKE e em BEFORE UPDATE: o que nao pode existir e
    // um comando de escrita em linha.
    expect(executavel).not.toMatch(/^\s*UPDATE\s+[a-z_]+\s+SET/im);
  });

  it('o cabecalho registra a ordem de deploy e o que NAO foi medido', () => {
    // Doc que mente e pior que ausente: o cabecalho tem de dizer que nada
    // rodou contra banco de pe nesta bancada, senao a proxima leitura trata a
    // migration como validada em producao.
    expect(sql).toMatch(/ORDEM DE DEPLOY/i);
    expect(sql).toMatch(/O QUE NAO FOI MEDIDO/i);
  });
});

describe('catraca: toda tabela com REVOKE UPDATE, DELETE tem decisao escrita', () => {
  const comRevoke = tabelasComRevokeNasMigrations(process.cwd());

  it('a varredura FUNCIONA: ela nomeia as oito tabelas conhecidas', () => {
    // Guarda da guarda. Se a expressao parar de casar, a catraca abaixo recebe
    // conjunto vazio e declara conformidade por vacuidade, que e o modo mais
    // comum de uma regua morrer sem ninguem notar.
    for (const esperada of [
      ...Object.keys(TRILHAS_APPEND_ONLY),
      ...EXCLUIDAS_DO_APPEND_ONLY.keys(),
      ...APPEND_ONLY_DE_OUTRA_MIGRATION.keys(),
    ]) {
      expect(comRevoke, `a varredura nao achou o REVOKE de ${esperada}`).toContain(esperada);
    }
  });

  it('a varredura ignora REVOKE comentado: a 0005 nao conta como protegida', () => {
    // Medido em 06/10/2026: o REVOKE de `acesso_ficha` esta dentro de um bloco
    // de comentario na 0005 e nunca rodou, e a 0025 citava `acesso_ficha` como
    // "mesmo padrao" ao justificar o proprio REVOKE. O que faz a tabela aparecer
    // na varredura hoje e o REVOKE da propria 0076, executavel. Se algum dia a
    // 0076 sair, `acesso_ficha` cai da varredura e esta assercao avisa, em vez
    // de a catraca continuar verde sobre nada.
    expect(executavel).toMatch(/^\s*REVOKE UPDATE, DELETE ON acesso_ficha\s+FROM PUBLIC;/m);
  });

  it('nenhuma tabela com REVOKE ficou sem decisao de append-only', () => {
    const decididas = new Set([
      ...Object.keys(TRILHAS_APPEND_ONLY),
      ...EXCLUIDAS_DO_APPEND_ONLY.keys(),
      ...APPEND_ONLY_DE_OUTRA_MIGRATION.keys(),
    ]);
    const semDecisao = comRevoke.filter((t) => !decididas.has(t));
    expect(
      semDecisao,
      'tabela com REVOKE UPDATE, DELETE e sem decisao escrita de append-only: ' +
        `${semDecisao.join(', ')}. Ou entra no mapa TRILHAS_APPEND_ONLY com gatilho ` +
        'na migration, ou entra em EXCLUIDAS_DO_APPEND_ONLY com o motivo.',
    ).toEqual([]);
  });

  it('toda EXCLUIDA carrega o motivo, e nao so o nome', () => {
    const semMotivo = [...EXCLUIDAS_DO_APPEND_ONLY.entries()]
      .filter(([, motivo]) => motivo.trim().length < 20)
      .map(([tabela]) => tabela);
    expect(semMotivo, `excluida sem motivo escrito: ${semMotivo.join(', ')}`).toEqual([]);
  });
});
