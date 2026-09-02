import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Variável de ambiente VAZIA não é variável ausente, e a diferença derrubava a
 * construção da imagem inteira.
 *
 * `ENV X=$ARG` no Dockerfile, com o argumento não informado, define `X=''`. Para
 * o zod isso é a diferença entre cair no `.optional()` e ser levado ao
 * validador de formato, que reprova com "Invalid url". O build parava em
 * "Collecting page data" com uma mensagem que aponta para uma rota de cron e
 * não diz nada sobre a variável, o que manda procurar defeito no lugar errado.
 *
 * Medido em 02/09/2026: `docker build` sem os `--build-arg` do Supabase falhava
 * assim. Como o Supabase saiu da entrega, ninguém mais passa esses argumentos,
 * ou seja, o caminho quebrado passou a ser o caminho normal. E não aparecia no
 * build local, porque ali a variável de fato não existe.
 */

const CHAVES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_APP_URL',
  'DATABASE_URL',
  'ACESSO_SEM_IDENTIDADE',
  'ACESSO_SEM_IDENTIDADE_MOTIVO',
  'ACESSO_SEM_IDENTIDADE_REVISAR_EM',
] as const;

let original: Record<string, string | undefined>;

beforeEach(() => {
  vi.resetModules();
  original = {};
  for (const c of CHAVES) {
    original[c] = process.env[c];
    delete process.env[c];
  }
});

afterEach(() => {
  for (const c of CHAVES) {
    if (original[c] === undefined) delete process.env[c];
    else process.env[c] = original[c];
  }
});

async function carregarEnv() {
  const { getEnv } = await import('@/infrastructure/config/env');
  return getEnv();
}

describe('variáveis de identidade vazias, como o Docker as deixa', () => {
  beforeEach(() => {
    // O cenário real da imagem: banco e janela declarados, e as duas do
    // Supabase presentes porém VAZIAS, por causa do ARG não informado.
    process.env.DATABASE_URL = 'postgresql://build:build@127.0.0.1:5432/build';
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    process.env.ACESSO_SEM_IDENTIDADE_MOTIVO =
      'Servidor do orgao sem saida para a internet, aguardando a API de login.';
    process.env.ACESSO_SEM_IDENTIDADE_REVISAR_EM = '2099-12-31';
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
  });

  it('não reprova o boot por causa da string vazia', async () => {
    await expect(carregarEnv()).resolves.toBeDefined();
  });

  it('trata vazio como ausente, e não como autenticação configurada', async () => {
    const env = await carregarEnv();
    expect(
      env.isAuthEnabled,
      'string vazia não pode contar como Supabase configurado: contaria como ' +
        'autenticação disponível e a janela sem identidade seria recusada por conviver com ela',
    ).toBe(false);
  });

  it('a URL pública vazia cai no valor padrão em vez de reprovar', async () => {
    process.env.NEXT_PUBLIC_APP_URL = '';
    const env = await carregarEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
  });
});

describe('valor inválido de verdade continua reprovando', () => {
  /**
   * A correção trata VAZIO como ausente. Ela não pode ter virado "aceita
   * qualquer coisa": endereço mal escrito precisa continuar derrubando o boot,
   * senão o sistema sobe apontando para lugar nenhum.
   */
  it('URL malformada ainda derruba o boot', async () => {
    process.env.DATABASE_URL = 'postgresql://build:build@127.0.0.1:5432/build';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'nao-e-uma-url';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'chave';
    await expect(carregarEnv()).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
