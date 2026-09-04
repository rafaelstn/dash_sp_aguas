import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guarda: importar um repositório `.pg.ts` NÃO pode abrir conexão nem validar
 * ambiente.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O QUE ESTA GUARDA EXISTE PARA IMPEDIR
 * ─────────────────────────────────────────────────────────────────────────
 * `infrastructure/db/client.ts` promete, no próprio docblock, que "o módulo
 * pode ser importado sem efeito colateral, nenhuma conexão é aberta e nenhuma
 * variável é validada até que alguém efetivamente execute uma query", e diz
 * para que serve: "permite que os repositórios `.pg.ts` coexistam com os mocks
 * no mesmo bundle sem quebrar o boot".
 *
 * `repositories.ts` depende dessa promessa: ele importa os dois lados no topo e
 * só depois escolhe entre mock e PostgreSQL por `isDemoMode`. Se o import do
 * lado PostgreSQL estourar, a escolha nunca acontece, e o modo demo morre no
 * boot levando junto TODA página e TODA rota, porque tudo passa por ali.
 *
 * A promessa era falsa. `sql` é um Proxy que cria o cliente no primeiro uso, e
 * aplicar a template tag É uso: `const COLUNAS = sql\`id, nome\`` em escopo de
 * módulo executa na hora do import. Nove arquivos faziam isso, com doze
 * fragmentos, e nenhum teste percebia porque a bancada sempre teve
 * `DATABASE_URL`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE A VARREDURA É POR DIRETÓRIO, E NÃO POR LISTA
 * ─────────────────────────────────────────────────────────────────────────
 * Lista de arquivos tem porta dos fundos: o próximo repositório `.pg.ts` nasce
 * fora dela e a guarda fica verde sem cobri-lo. Lendo o diretório, arquivo novo
 * entra sozinho, e a única forma de escapar é não ser um `.pg.ts`, que é
 * exatamente a marca que define o que precisa ser coberto.
 */

const DIR_DB = join(process.cwd(), 'src', 'infrastructure', 'db');

function repositoriosPg(): string[] {
  return readdirSync(DIR_DB)
    .filter((nome) => nome.endsWith('.pg.ts'))
    .sort();
}

describe('importar repositório .pg em modo demo', () => {
  beforeEach(() => {
    vi.resetModules();
    // Modo demo é DATABASE_URL vazia ou ausente (env.ts). Em `test` isso é
    // permitido; o fail-fast de produção continua valendo e não é afrouxado
    // aqui: NODE_ENV segue sendo `test`.
    vi.stubEnv('DATABASE_URL', '');
    // O singleton do cliente vive em globalThis e sobrevive a resetModules.
    // Sem limpá-lo, um teste anterior que já criou o cliente faria esta guarda
    // passar sem medir nada, que é o curto-circuito clássico de guarda.
    (globalThis as Record<string, unknown>).__pg_singleton__ = undefined;
  });

  it('a varredura acha os repositórios, senão a guarda estaria vazia', () => {
    // Guarda da guarda: um dia alguém renomeia o padrão de arquivo e esta
    // suíte passaria percorrendo lista vazia, verde e cega.
    expect(repositoriosPg().length).toBeGreaterThanOrEqual(5);
  });

  it.each(repositoriosPg())('%s importa sem abrir conexão', async (arquivo) => {
    const modulo = `@/infrastructure/db/${arquivo.replace(/\.ts$/, '')}`;
    await expect(import(modulo)).resolves.toBeDefined();
  });

  it('o composition root inteiro importa em modo demo', async () => {
    // É este o import que toda página e toda rota fazem. Se ele cair, cai tudo.
    await expect(import('@/infrastructure/repositories')).resolves.toBeDefined();
  });

  it('e ainda assim executar query em modo demo continua sendo recusado', async () => {
    // A correção não pode ter virado permissão: adiar a criação do cliente é
    // uma coisa, deixar o modo demo falar com banco inexistente é outra. Sem
    // este caso, trocar o `throw` por um cliente mudo passaria despercebido.
    const { sql } = await import('@/infrastructure/db/client');
    await expect(async () => {
      await sql`SELECT 1`;
    }).rejects.toThrow(/modo demo/i);
  });
});
