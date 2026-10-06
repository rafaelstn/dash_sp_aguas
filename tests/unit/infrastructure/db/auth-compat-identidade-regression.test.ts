/**
 * Catraca ESTATICA do par shim + consulta de identidade.
 *
 * Defeito que ela trava (medido em 05/10/2026, estava em producao): o
 * repositorio de identidade le uma coluna JSONB de `auth.users` que o shim
 * `db/auth-compat.sql` nao declarava, e no Postgres puro da entrega a consulta
 * levantava 42703 undefined_column. Os dois arquivos falavam de colunas
 * diferentes e nada no projeto comparava os dois.
 *
 * O que ela mede: que os DOIS LADOS citam a MESMA coluna, derivando o nome do
 * lado mais rico (o SQL do repositorio) em vez de repetir o literal aqui. Regua
 * com o nome escrito a mao passaria a medir o proprio texto no dia em que o
 * repositorio trocasse de coluna.
 *
 * O que ela NAO mede: comportamento. Que o banco aceita a consulta e que o nome
 * resolve dos dois lados (vazio e preenchido) e
 * tests/integration/auth-compat-identidade-postgres.test.ts, que roda so no job
 * `integracao` do CI. Na bancada sem Docker isso fica NAO MEDIDO.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = process.cwd();
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf-8');

const shim = ler('db/auth-compat.sql');
const repoIdentidade = ler('src/infrastructure/db/usuarios-identidade-repository.pg.ts');
const resolverOperadores = ler('src/application/use-cases/estoque/resolver-operadores.ts');

/**
 * Extrai do SQL do repositorio a coluna JSONB e a chave que ele le
 * (`<coluna>->>'<chave>'`). Devolve os dois para a assercao poder NOMEAR o que
 * faltou; grupo de match em TS e `string | undefined`, por isso o retorno
 * coletado em vez de indexado direto na assercao.
 */
function colunaLidaPeloRepositorio(): { coluna: string; chave: string } | null {
  const m = repoIdentidade.match(/(\w+)->>'(\w+)'/);
  if (!m || !m[1] || !m[2]) return null;
  return { coluna: m[1], chave: m[2] };
}

describe('o shim declara a coluna que a consulta de identidade le', () => {
  it('o repositorio de identidade le uma coluna JSONB de auth.users (ancora de presenca)', () => {
    // Sem esta ancora, apagar o SELECT do repositorio deixaria as assercoes de
    // ausencia abaixo verdes sobre nada.
    expect(repoIdentidade).toMatch(/FROM auth\.users u/);
    expect(colunaLidaPeloRepositorio()).not.toBeNull();
  });

  it('a coluna lida pelo repositorio esta declarada no CREATE TABLE do shim', () => {
    const lida = colunaLidaPeloRepositorio();
    expect(lida).not.toBeNull();
    const { coluna } = lida!;
    // O recorte termina no `;` do proprio CREATE TABLE. Com `[\s\S]*?` (sem
    // limite) esta assercao passava tambem quando a coluna existia SO no ALTER
    // la embaixo: medido em 06/10/2026, o mutante que apagava a coluna do
    // CREATE TABLE sobrevivia, porque o recorte atravessava o fim do comando.
    expect(shim).toMatch(
      new RegExp(`CREATE TABLE IF NOT EXISTS auth\\.users \\([^;]*?${coluna}\\s+jsonb`),
    );
  });

  it('o ALTER idempotente alcanca o banco que ja subiu sem a coluna', () => {
    const lida = colunaLidaPeloRepositorio();
    expect(lida).not.toBeNull();
    const { coluna } = lida!;
    // CREATE TABLE IF NOT EXISTS nao faz nada quando a tabela ja existe, e e
    // esse o estado de todo ambiente que subiu com a versao anterior do shim.
    // Caso separado do de cima de proposito: juntos, um unico expect verde pelo
    // outro lado deixava o mutante passar.
    expect(shim).toMatch(
      new RegExp(`ALTER TABLE auth\\.users\\s+ADD COLUMN IF NOT EXISTS ${coluna} jsonb`),
    );
  });

  it('a coluna nasce NOT NULL com default de objeto vazio nos DOIS comandos', () => {
    // Nulo no objeto inteiro faria `->>'nome'` devolver nulo por outro motivo, e
    // a degradacao deixaria de ser distinguivel de ausencia de conta.
    // As duas assercoes sao recortadas por comando, pelo mesmo motivo do caso
    // acima: `raw_user_meta_data jsonb NOT NULL DEFAULT` casava no ALTER e dava
    // o CREATE TABLE por bom.
    expect(shim).toMatch(
      /CREATE TABLE IF NOT EXISTS auth\.users \([^;]*?raw_user_meta_data\s+jsonb NOT NULL DEFAULT '\{\}'::jsonb/,
    );
    expect(shim).toMatch(
      /ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb NOT NULL DEFAULT '\{\}'::jsonb;/,
    );
  });

  it('o comentario do shim diz de onde vem o conteudo real e o que acontece ate la', () => {
    // Doc que mente e pior que ausente: quem ler o shim precisa entender que {}
    // e desenho, e nao esquecimento.
    expect(shim).toMatch(/42703/);
    expect(shim).toMatch(/camada de identidade definitiva/);
    expect(shim).toMatch(/cai para o e-mail por desenho/);
  });

  it('o ramo degradado do resolvedor de operadores CONTINUA existindo', () => {
    // O conserto foi no schema, nao aqui: o degradado protege a trilha no dia em
    // que a identidade estiver fora do ar. Se este caso reprovar, alguem tirou a
    // rede por achar que o schema a tornou desnecessaria.
    expect(resolverOperadores).toMatch(/degradado: true/);
    expect(resolverOperadores).toMatch(/catch/);
  });
});
