import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  acessoSemIdentidadeAtivo,
  configuracaoAcessoSemIdentidade,
  janelaVencida,
  USUARIO_SEM_IDENTIDADE,
} from '@/infrastructure/auth/acesso-sem-identidade';

/**
 * Guarda da janela sem identidade (entrega PRODESP).
 *
 * Estes casos foram escritos procurando ESCAPAR da guarda, e não confirmando
 * que ela funciona no caminho feliz: uma chave que desliga a autenticação do
 * sistema inteiro só vale o que valem as formas de ligá-la por engano.
 */

const CHAVES = [
  'ACESSO_SEM_IDENTIDADE',
  'ACESSO_SEM_IDENTIDADE_MOTIVO',
  'ACESSO_SEM_IDENTIDADE_REVISAR_EM',
] as const;

const MOTIVO_VALIDO = 'Servidor da PRODESP sem internet, aguardando a API de login do orgao.';

let original: Record<string, string | undefined>;

beforeEach(() => {
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

function ligar(valor: string) {
  process.env.ACESSO_SEM_IDENTIDADE = valor;
  process.env.ACESSO_SEM_IDENTIDADE_MOTIVO = MOTIVO_VALIDO;
  process.env.ACESSO_SEM_IDENTIDADE_REVISAR_EM = '2026-12-01';
}

describe('acessoSemIdentidadeAtivo, fail-closed', () => {
  it('fica DESLIGADO quando a variável está ausente', () => {
    expect(acessoSemIdentidadeAtivo()).toBe(false);
  });

  /**
   * O ponto do teste. Um booleano lido de forma tolerante ligaria com
   * qualquer um destes, e cada um é uma forma plausível de alguém escrever
   * "sim" sem ser em português: `true` é o reflexo de quem programa, `1` é o
   * reflexo de quem escreve shell, e `yes` o de quem copia documentação em
   * inglês. Nenhum pode abrir o sistema.
   */
  it.each(['true', '1', 'yes', 'y', 'on', 'enabled', 'ativo', 'nao', 'false', '0', ''])(
    'NÃO liga com %j, que é a forma errada de dizer sim',
    (valor) => {
      ligar(valor);
      expect(acessoSemIdentidadeAtivo()).toBe(false);
    },
  );

  it('liga apenas com a palavra exata, tolerando espaço e caixa', () => {
    for (const valor of ['sim', 'SIM', ' sim ', 'Sim']) {
      ligar(valor);
      expect(acessoSemIdentidadeAtivo()).toBe(true);
    }
  });
});

describe('configuracaoAcessoSemIdentidade, justificativa obrigatória', () => {
  it('devolve null quando a janela está desligada, sem exigir mais nada', () => {
    expect(configuracaoAcessoSemIdentidade()).toBeNull();
  });

  it('RECUSA ligar sem motivo escrito', () => {
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    process.env.ACESSO_SEM_IDENTIDADE_REVISAR_EM = '2026-12-01';
    expect(() => configuracaoAcessoSemIdentidade()).toThrow(/MOTIVO/);
  });

  it('RECUSA motivo curto demais para dizer alguma coisa', () => {
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    process.env.ACESSO_SEM_IDENTIDADE_MOTIVO = 'porque';
    process.env.ACESSO_SEM_IDENTIDADE_REVISAR_EM = '2026-12-01';
    expect(() => configuracaoAcessoSemIdentidade()).toThrow(/MOTIVO/);
  });

  it('RECUSA ligar sem data de revisão', () => {
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    process.env.ACESSO_SEM_IDENTIDADE_MOTIVO = MOTIVO_VALIDO;
    expect(() => configuracaoAcessoSemIdentidade()).toThrow(/REVISAR_EM/);
  });

  it.each(['01/12/2026', '2026-13-01x', 'dezembro', '2026/12/01', 'em breve'])(
    'RECUSA data em formato não conferível: %j',
    (data) => {
      process.env.ACESSO_SEM_IDENTIDADE = 'sim';
      process.env.ACESSO_SEM_IDENTIDADE_MOTIVO = MOTIVO_VALIDO;
      process.env.ACESSO_SEM_IDENTIDADE_REVISAR_EM = data;
      expect(() => configuracaoAcessoSemIdentidade()).toThrow(/REVISAR_EM/);
    },
  );

  it('aceita a configuração completa', () => {
    ligar('sim');
    expect(configuracaoAcessoSemIdentidade()).toEqual({
      motivo: MOTIVO_VALIDO,
      revisarEm: '2026-12-01',
    });
  });
});

describe('janelaVencida', () => {
  const config = { motivo: MOTIVO_VALIDO, revisarEm: '2026-12-01' };

  it('não está vencida antes da data', () => {
    expect(janelaVencida(config, new Date('2026-09-02T23:00:00Z'))).toBe(false);
  });

  it('não está vencida NO dia da revisão', () => {
    expect(janelaVencida(config, new Date('2026-12-01T23:59:59Z'))).toBe(false);
  });

  it('está vencida no dia seguinte', () => {
    expect(janelaVencida(config, new Date('2026-12-02T00:00:00Z'))).toBe(true);
  });
});

describe('USUARIO_SEM_IDENTIDADE', () => {
  /**
   * O id precisa ser UUID canônico porque o Postgres recebe `${id}::uuid` e
   * quatro chaves estrangeiras NOT NULL apontam para `auth.users`. Um valor
   * fora do formato não falharia aqui: falharia no meio de um fluxo de campo,
   * com mensagem de driver.
   */
  it('tem id no formato UUID que o banco aceita', () => {
    expect(USUARIO_SEM_IDENTIDADE.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('casa exatamente com o id provisionado pela migration 0066', () => {
    expect(USUARIO_SEM_IDENTIDADE.id).toBe('00000000-0000-4000-8000-000000000001');
    expect(USUARIO_SEM_IDENTIDADE.email).toBe('acesso-sem-identidade@dmo.local');
  });

  it('se anuncia como não identificado, para a trilha não fingir uma pessoa', () => {
    expect(USUARIO_SEM_IDENTIDADE.nome.toLowerCase()).toContain('sem identifica');
  });
});
