import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Em produção, o cadastro de posto PRECISA ter origem declarada.
 *
 * Esta guarda existe por causa de um defeito que custou uma sessão inteira para
 * ser achado, em 03/09/2026: sem as variáveis do SQL Server do órgão, a
 * aplicação cai no adaptador PostgreSQL, cuja tabela `postos` tem **0 linhas**
 * em produção (o banco nasce vazio por desenho: posto e medição vêm do órgão ao
 * vivo, ADR-0023). O sintoma é a busca não retornar nada.
 *
 * **Um erro de configuração se disfarçava de resultado de busca.** Não havia
 * erro, não havia log, e "nenhum posto encontrado" é uma resposta plausível
 * para quem está olhando. Falha silenciosa que se parece com dado é a categoria
 * mais cara de defeito, e é exatamente o que o boot passa a recusar.
 */

const CHAVES = [
  'NODE_ENV',
  'DATABASE_URL',
  'SQLSERVER_HOST',
  'SQLSERVER_USUARIO',
  'SQLSERVER_SENHA',
  'SQLSERVER_BANCO',
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
  // Cenário do servidor do órgão: banco da aplicação e janela sem identidade
  // declarados. O que varia nos casos é só a origem do cadastro.
  //
  // `NODE_ENV` é somente-leitura para o TypeScript, então vai por `stubEnv`.
  vi.stubEnv('NODE_ENV', 'production');
  process.env.DATABASE_URL = 'postgresql://u:p@db:5432/spaguas_dmo';
  process.env.ACESSO_SEM_IDENTIDADE = 'sim';
  process.env.ACESSO_SEM_IDENTIDADE_MOTIVO =
    'Servidor do orgao sem API de login propria, identidade sera fornecida.';
  process.env.ACESSO_SEM_IDENTIDADE_REVISAR_EM = '2099-12-31';
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const c of CHAVES) {
    if (c === 'NODE_ENV') continue;
    if (original[c] === undefined) delete process.env[c];
    else process.env[c] = original[c];
  }
});

function preencherOrigem() {
  process.env.SQLSERVER_HOST = '10.0.0.1';
  process.env.SQLSERVER_USUARIO = 'leitura';
  process.env.SQLSERVER_SENHA = 'x';
  process.env.SQLSERVER_BANCO = 'Dbfch';
}

async function carregar() {
  const { getEnv } = await import('@/infrastructure/config/env');
  return getEnv();
}

describe('produção sem a origem do cadastro', () => {
  it('RECUSA subir quando falta tudo', async () => {
    await expect(carregar()).rejects.toThrow(/SQLSERVER_HOST/);
  });

  /**
   * Uma de cada vez: configuração parcial é o caso realista (alguém preenche
   * host e usuário e esquece a senha), e é o que passaria despercebido se a
   * checagem exigisse "nenhuma preenchida" em vez de "todas preenchidas".
   */
  it.each([
    'SQLSERVER_HOST',
    'SQLSERVER_USUARIO',
    'SQLSERVER_SENHA',
    'SQLSERVER_BANCO',
  ])('RECUSA subir quando falta só %s', async (chave) => {
    preencherOrigem();
    delete process.env[chave];
    await expect(carregar()).rejects.toThrow(new RegExp(chave));
  });

  it('trata string VAZIA como ausente, que é como o Docker a deixa', async () => {
    preencherOrigem();
    process.env.SQLSERVER_SENHA = '   ';
    await expect(carregar()).rejects.toThrow(/SQLSERVER_SENHA/);
  });

  it('a mensagem diz o que acontece, e não só o que falta', async () => {
    await expect(carregar()).rejects.toThrow(/busca de postos responde sem resultado/);
  });

  it('sobe quando a origem está declarada', async () => {
    preencherOrigem();
    await expect(carregar()).resolves.toBeDefined();
  });
});

describe('fora de produção', () => {
  /**
   * A bancada roda com o PostgreSQL local de propósito, e exigir o SQL Server
   * do órgão em desenvolvimento tornaria impossível trabalhar sem VPN.
   */
  it.each(['development', 'test'])('NÃO exige a origem em %s', async (ambiente) => {
    vi.stubEnv('NODE_ENV', ambiente);
    delete process.env.ACESSO_SEM_IDENTIDADE;
    await expect(carregar()).resolves.toBeDefined();
  });
});
