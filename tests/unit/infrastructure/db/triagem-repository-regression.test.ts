/**
 * Regressão estática do `aprovar()` quanto ao CADASTRO de posto.
 *
 * Duas gerações do mesmo defeito, e a segunda nasceu da correção da primeira:
 *
 *   1. A versão original consultava `postos.ativo`, coluna que nunca existiu
 *      (o esquema usa `deleted_at IS NULL`, migration 0002). Toda aprovação
 *      quebrava em produção.
 *   2. A correção daquilo passou a consultar `SELECT deleted_at FROM postos`
 *      dentro da transação. Estava certa em 2026 e deixou de estar com o
 *      ADR-0023, que tirou o cadastro do nosso banco: `postos` ficou VAZIA por
 *      desenho (`count(*) = 0`, medido em 10/09/2026), `postos[0]` virou
 *      sempre `undefined`, e toda aprovação passou a responder 409
 *      `posto_inativo` para posto ATIVO no órgão.
 *
 * Por isso a segunda asserção deste arquivo foi INVERTIDA, e não apagada.
 * A pergunta continua existindo; ela mudou de dono, e agora é feita ao
 * `postosRepository` pelo use case `aprovarFichaTriagem`.
 *
 * Esta régua lê TEXTO. O comportamento contra Postgres real, com a tabela
 * vazia, é provado em `tests/integration/triagem-aprovacao-postgres.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PG_FILE = resolve(
  process.cwd(),
  'src/infrastructure/db/triagem-repository.pg.ts',
);

/**
 * Código sem comentário.
 *
 * Régua que varre por marca tem de medir o que EXECUTA. Sem isto, ela acusa o
 * comentário que EXPLICA a remoção — e foi o que aconteceu na primeira
 * execução desta versão, mandando apagar justamente a explicação de por que a
 * consulta saiu. É o mesmo defeito que a régua das migrations tinha em
 * `estacoes-pluviometricas-repository.test.ts`, corrigido no mesmo dia: guarda
 * que aponta a versão certa de uma linha é pior que guarda ausente.
 *
 * Conservadora de propósito: não interpreta literal de string. Errar acusando
 * demais custa uma conversa; errar não vendo custa o acoplamento de volta.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

describe('triagem-repository.pg, regressão de schema', () => {
  const bruto = readFileSync(PG_FILE, 'utf-8');
  const source = semComentarios(bruto);

  it('não consulta coluna postos.ativo (não existe no schema)', () => {
    expect(source).not.toMatch(/SELECT\s+ativo\s+FROM\s+postos/i);
    expect(source).not.toMatch(/postos\[0\]\.ativo/);
  });

  it('NÃO consulta `postos` na aprovação: o cadastro não mora mais aqui', () => {
    // Esta afirmação era a INVERSA até 10/09/2026: exigia
    // `SELECT deleted_at FROM postos` dentro da transação de aprovação, e por
    // isso reprovava a correção. Não foi apagada, foi INVERTIDA: apagar deixa o
    // caminho livre, e a volta por descuido não seria denunciada.
    //
    // O que mudou não é o texto da consulta, é DE QUEM é a pergunta. O ADR-0023
    // tirou o cadastro do nosso banco e deixou `postos` vazia por desenho, então
    // qualquer `SELECT ... FROM postos` aqui volta a responder 409
    // `posto_inativo` para posto ATIVO, que foi o defeito medido em produção.
    // Quem pergunta agora é `aprovarFichaTriagem`, ao `postosRepository`.
    expect(source).not.toMatch(/FROM\s+postos\b/i);
    expect(source).not.toMatch(/'posto_inativo'/);
  });

  it('a régua enxerga: os padrões reconhecem o trecho que foi removido', () => {
    // Guarda da guarda. As duas afirmações acima são de AUSÊNCIA, e ausência
    // fica verde sobre arquivo vazio, sobre caminho errado e sobre expressão
    // que deixou de casar qualquer coisa. Aqui se prova que os dois padrões
    // ainda reconhecem o código que existia, e que o arquivo lido é o de
    // verdade.
    const trechoRemovido = [
      'const postos = await tx`SELECT deleted_at FROM postos WHERE prefixo = x`;',
      "if (!postos[0] || postos[0].deleted_at !== null) {",
      "  throw new EstadoTriagemInvalido('posto_inativo', 'aprovada');",
      '}',
    ].join('\n');
    expect(trechoRemovido).toMatch(/FROM\s+postos\b/i);
    expect(trechoRemovido).toMatch(/'posto_inativo'/);

    // Âncora de presença: o arquivo lido É o repositório de triagem, e não um
    // caminho que passou a não existir (o que zeraria as duas asserções).
    expect(source).toMatch(/INSERT INTO fichas_visita/);
    expect(source.length).toBeGreaterThan(1000);

    // E a limpeza de comentário não pode virar a porta dos fundos: o texto
    // BRUTO ainda cita `FROM postos` (na explicação de por que a consulta
    // saiu), e é justamente essa diferença que prova que a régua mede código.
    expect(bruto).toMatch(/FROM\s+postos\b/i);
    expect(semComentarios('// SELECT x FROM postos\ncodigo();')).not.toMatch(
      /FROM\s+postos\b/i,
    );
    expect(semComentarios('await tx`SELECT deleted_at FROM postos`;')).toMatch(
      /FROM\s+postos\b/i,
    );
  });
});
