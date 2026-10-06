/**
 * As quatro trilhas que a migration 0076 tornou imutaveis, e o unico jeito
 * legitimo de uma suite de integracao limpar linha delas.
 *
 * POR QUE ESTE APOIO EXISTE
 * -------------------------
 * Antes da 0076 a imutabilidade dessas tabelas era `REVOKE UPDATE, DELETE ...
 * FROM PUBLIC`, que nao media o acesso do DONO da tabela, e a aplicacao conecta
 * como dono (ADR-0024). A 0076 poe o gatilho, que recusa inclusive para o dono,
 * e com isso TRES suites de integracao que limpavam a propria massa com DELETE
 * escopado passam a ser recusadas.
 *
 * A saida errada seria TRUNCATE (nao dispara gatilho de linha): o banco de teste
 * do job `integracao` e COMPARTILHADO entre as suites e carrega o estado semeado
 * por `ops/testing/regua-migrations/semear-estado-de-producao.sql`, entao
 * truncar apagaria massa de terceiro.
 *
 * A saida certa e desligar o gatilho EXPLICITAMENTE, e dentro de uma transacao:
 * `ALTER TABLE ... DISABLE TRIGGER` e transacional no PostgreSQL, logo um erro
 * no meio da limpeza devolve o gatilho LIGADO pelo rollback. Desligar fora de
 * transacao (ou esquecer o ENABLE) deixaria as suites seguintes verdes sobre
 * guarda desligada, que e o pior resultado possivel de uma regua de seguranca.
 *
 * O ENABLE no fim nao e decoracao: transacional quer dizer "pode ser desfeito",
 * e nao "volta sozinho no commit". Sem ele, o commit PERSISTE o gatilho
 * desligado.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import type { Sql, TransactionSql } from 'postgres';

/**
 * Tabela de trilha -> nome do gatilho de append-only criado pela 0076.
 *
 * Fonte unica para as suites e para a regua
 * `tests/integration/trilhas-append-only-postgres.test.ts`, que confere este
 * mapa contra o CATALOGO do banco. Tabela nova entra aqui e la junto.
 *
 * `estoque_movimentacoes` NAO entra: o gatilho dela e da 0074, tem regua propria
 * e a suite do estoque limpa com TRUNCATE, que nao dispara gatilho de linha.
 */
export const TRILHAS_APPEND_ONLY = {
  acesso_ficha: 'acesso_ficha_append_only',
  triagem_eventos: 'triagem_eventos_append_only',
  ana_revisao_evento: 'ana_revisao_evento_append_only',
  postos_evento: 'postos_evento_append_only',
} as const;

export type TrilhaAppendOnly = keyof typeof TRILHAS_APPEND_ONLY;

/**
 * Tabelas com `REVOKE UPDATE, DELETE` nas migrations cuja imutabilidade foi
 * decidida como NAO, com o motivo escrito. Nao sao trilha: por desenho elas
 * mudam, e forcar append-only nelas quebraria o produto (medido em 06/10/2026 e
 * registrado no cabecalho da 0076).
 *
 * Entrada nova aqui exige o motivo ao lado. Isto NAO e lugar de guardar tabela
 * que ninguem avaliou: e exatamente a diferenca entre decisao e esquecimento que
 * a catraca de completude cobra.
 */
export const EXCLUIDAS_DO_APPEND_ONLY = new Map<string, string>([
  [
    'usuarios_papeis',
    'estado: tem atualizado_em com gatilho proprio, e o painel faz upsert do papel',
  ],
  ['fichas_triagem', 'estado: maquina de estados, com quatro UPDATE no repositorio'],
  ['triagem_locks', 'mutex: apagar a linha E o modo de liberar o lock'],
  ['cron_heartbeats', 'sinal de vida com retencao de 7 dias declarada na 0027'],
]);

/** Append-only garantido por OUTRA migration, com regua propria. */
export const APPEND_ONLY_DE_OUTRA_MIGRATION = new Map<string, string>([
  [
    'estoque_movimentacoes',
    '0074, medida em tests/integration/estoque-movimentacoes-append-only-postgres.test.ts',
  ],
]);

/**
 * Tabelas nomeadas em `REVOKE UPDATE, DELETE ON <t>` EXECUTAVEL nas migrations.
 *
 * Linha comentada NAO conta, porque o que decide e o efeito e nao o texto: e o
 * caso da 0005, cujo REVOKE vive dentro de um bloco de comentario e por isso
 * nunca rodou. Quem denuncia aquilo nao e esta varredura, e o caso de catalogo
 * que exige o gatilho em `acesso_ficha`.
 *
 * `raiz` e a raiz do repositorio (`process.cwd()` em quem chama).
 */
export function tabelasComRevokeNasMigrations(raiz: string): string[] {
  const dir = joinPath(raiz, 'supabase', 'migrations');
  const achadas = new Set<string>();
  for (const nome of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    for (const linha of readFileSync(joinPath(dir, nome), 'utf8').split('\n')) {
      if (/^\s*--/.test(linha)) continue;
      const m = /REVOKE\s+UPDATE\s*,\s*DELETE\s+ON\s+([a-z_][a-z0-9_]*)/i.exec(linha);
      if (m) achadas.add(m[1]!.toLowerCase());
    }
  }
  return [...achadas].sort();
}

/**
 * Roda `fn` com o gatilho de append-only de `tabela` desligado, dentro de uma
 * transacao que o liga de volta antes do commit.
 *
 * Uso: limpeza de massa de teste. NUNCA em codigo de produto, e nunca para
 * "consertar" linha de trilha: correcao de trilha e linha NOVA.
 *
 * O nome da tabela e do gatilho vem do mapa acima e nao de parametro livre, por
 * isso a interpolacao no `unsafe` nao abre injecao (nao existe forma
 * parametrizada de ALTER TABLE).
 */
export async function comGatilhoDesligado<T>(
  sql: Sql,
  tabela: TrilhaAppendOnly,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const gatilho = TRILHAS_APPEND_ONLY[tabela];
  // O resultado sai por variavel, e nao pelo retorno de `begin`: o
  // `UnwrapPromiseArray` do postgres.js desembrulha array devolvido pela
  // transacao, o que mudaria o tipo de quem retornasse uma lista de linhas.
  let resultado!: T;
  await sql.begin(async (tx) => {
    await tx.unsafe(`ALTER TABLE ${tabela} DISABLE TRIGGER ${gatilho}`);
    resultado = await fn(tx);
    await tx.unsafe(`ALTER TABLE ${tabela} ENABLE TRIGGER ${gatilho}`);
  });
  return resultado;
}
