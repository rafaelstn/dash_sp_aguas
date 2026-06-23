/**
 * Atomicidade do aceitar-match ANA (item P1).
 *
 * Antes, a rota fazia duas transações separadas: postosRepository.atualizar
 * (transação 1) e anaRevisaoRepository.aceitarMatch (transação 2). Se a 2ª
 * falhasse, o posto ficava com prefixo_ana setado e a estação ANA pendente
 * (estado inconsistente, sem compensação).
 *
 * Agora as duas escritas (postos + ana_revisao_estacao) rodam dentro de um
 * único `sql.begin`. Este teste mocka o client `sql` e prova:
 *   1. tudo acontece dentro de UMA transação (um único begin);
 *   2. as 4 escritas usam o mesmo `tx`;
 *   3. se a escrita na estação ANA falha, o erro propaga (begin rejeita =
 *      rollback atômico) e nada é silenciado;
 *   4. posto inexistente/removido vira erro tipado (sem tocar a estação).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Mock do client `sql` ──────────────────────────────────────────────────
// `sql` é tagged template + `sql.begin(cb)`. Modelamos `tx` como tagged
// template que casa o texto da query a um resultado, com opção de injetar
// falha numa query específica. Estado fica em `vi.hoisted` para sobreviver ao
// hoist do `vi.mock` (que sobe pro topo do arquivo).
type Resultado = unknown[];

const estado = vi.hoisted(() => ({
  beginCount: 0,
  queriesTx: [] as string[],
  postoRows: [
    { id: 'posto-1', prefixo_ana: null, deleted_at: null },
  ] as Resultado,
  falharEm: null as RegExp | null,
}));

vi.mock('@/infrastructure/db/client', () => {
  function texto(strings: TemplateStringsArray): string {
    return strings.join(' ').replace(/\s+/g, ' ').trim();
  }
  function tx(strings: TemplateStringsArray, ...args: unknown[]): Promise<Resultado> {
    void args;
    const q = texto(strings);
    estado.queriesTx.push(q);
    if (estado.falharEm && estado.falharEm.test(q)) {
      return Promise.reject(new Error('falha simulada na query'));
    }
    if (/SELECT id, prefixo_ana, deleted_at\s+FROM postos/i.test(q)) {
      return Promise.resolve(estado.postoRows);
    }
    return Promise.resolve([]);
  }
  const sqlMock = Object.assign(
    (...args: unknown[]) => {
      void args;
      return Promise.resolve([]);
    },
    {
      async begin(cb: (t: typeof tx) => Promise<unknown>) {
        estado.beginCount += 1;
        // Semântica do postgres.js: callback que rejeita => begin rejeita
        // (rollback). Não há commit parcial.
        return cb(tx);
      },
    },
  );
  return { sql: sqlMock };
});

import { anaRevisaoRepository } from '@/infrastructure/db/ana-revisao-repository.pg';
import { PostoNaoEncontrado, PostoRemovido } from '@/domain/errors';

const ATOR = { usuarioId: 'user-1', ip: '10.0.0.1', userAgent: 'vitest' };
const PARAMS = {
  estacaoId: 'estacao-1',
  postoIdSugerido: 'posto-1',
  prefixoSugerido: '3D-001',
  codigoAna: '12345678',
  referenciaExternaId: 'estacao-1',
  observacaoPosto: 'Aceito match.',
  origemEvento: 'aceitar_match_ana',
};

describe('aceitarMatch: atomicidade', () => {
  afterEach(() => {
    estado.beginCount = 0;
    estado.queriesTx = [];
    estado.postoRows = [{ id: 'posto-1', prefixo_ana: null, deleted_at: null }];
    estado.falharEm = null;
    vi.clearAllMocks();
  });

  it('escreve nas duas tabelas dentro de UMA única transação', async () => {
    await anaRevisaoRepository.aceitarMatch(PARAMS, ATOR);

    expect(estado.beginCount).toBe(1);
    const juntas = estado.queriesTx.join('\n');
    expect(juntas).toMatch(/UPDATE postos\s+SET prefixo_ana/i);
    expect(juntas).toMatch(/INSERT INTO postos_evento/i);
    expect(juntas).toMatch(/UPDATE ana_revisao_estacao/i);
    expect(juntas).toMatch(/INSERT INTO ana_revisao_evento/i);
  });

  it('se a escrita na estação ANA falha, o erro propaga (rollback atômico)', async () => {
    estado.falharEm = /UPDATE ana_revisao_estacao/i;

    await expect(anaRevisaoRepository.aceitarMatch(PARAMS, ATOR)).rejects.toThrow();

    // Tudo aconteceu sob um único begin: não houve commit separado do posto.
    expect(estado.beginCount).toBe(1);
    // O UPDATE do posto chegou a ser emitido, mas dentro da MESMA transação
    // que rejeitou — logo é descartado pelo rollback do begin.
    expect(estado.queriesTx.join('\n')).toMatch(/UPDATE postos\s+SET prefixo_ana/i);
  });

  it('posto inexistente vira PostoNaoEncontrado sem tocar a estação ANA', async () => {
    estado.postoRows = [];

    await expect(
      anaRevisaoRepository.aceitarMatch(PARAMS, ATOR),
    ).rejects.toBeInstanceOf(PostoNaoEncontrado);

    expect(estado.queriesTx.join('\n')).not.toMatch(/UPDATE ana_revisao_estacao/i);
  });

  it('posto removido vira PostoRemovido sem tocar a estação ANA', async () => {
    estado.postoRows = [{ id: 'posto-1', prefixo_ana: null, deleted_at: new Date() }];

    await expect(
      anaRevisaoRepository.aceitarMatch(PARAMS, ATOR),
    ).rejects.toBeInstanceOf(PostoRemovido);

    expect(estado.queriesTx.join('\n')).not.toMatch(/UPDATE ana_revisao_estacao/i);
  });
});
