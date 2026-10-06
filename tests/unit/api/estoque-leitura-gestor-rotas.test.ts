/**
 * As duas LEITURAS da trilha de estoque exigem gestor, e não qualquer logado
 * (decisão do Rafael em 06/10/2026, no mesmo trabalho da migration 0075):
 *   GET /api/estoque/movimentacoes  (trilha paginada)
 *   GET /api/estoque/export         (planilha, aba de movimentações)
 *
 * Motivo: a trilha passou a devolver `solicitanteMatricula`, que identifica a
 * pessoa que retirou material, e a planilha leva a mesma coluna para fora do
 * controle de acesso do painel.
 *
 * COMO ESTE ARQUIVO MEDE, E POR QUE ASSIM
 * ---------------------------------------
 * Ele importa o helper REAL (`src/app/api/_helpers/auth.ts`) e mocka só o que
 * está embaixo dele: a sessão (`@/infrastructure/auth/current-user`) e o barrel
 * de repositórios. O arquivo vizinho
 * `tests/unit/api/estoque-unicidade-rotas.test.ts` mocka o helper INTEIRO, e por
 * isso não consegue medir isto: com o helper mockado, trocar
 * `exigirGestorEstoque` por `exigirUsuario` na rota continuaria verde.
 *
 * A asserção nomeia a CAMADA por presença, e não julga só pelo código de erro:
 *   - 401 sem sessão, e `obterPapel` NÃO consultado (parou na camada de sessão);
 *   - 403 com sessão e papel `user`, e `obterPapel` consultado com o id (a
 *     recusa veio da camada de papel, a segunda, e não da primeira);
 *   - em toda recusa, o repositório de movimentações NÃO foi chamado, que é o
 *     efeito: guarda que respondesse 403 depois de ler o dado teria vazado.
 * Sem a asserção sobre `obterPapel`, 401 e 403 só se distinguiriam pelo número,
 * e qualquer uma das duas camadas poderia estar produzindo os dois.
 *
 * Medição refeita no instante de escrever este teste, em 06/10/2026, lendo
 * `src/infrastructure/auth/permissao-estoque.ts`: `podeGerenciarEstoque` é
 * `if (acessoSemIdentidadeAtivo() && usuarioId === USUARIO_SEM_IDENTIDADE.id)
 * return true; return ehAdmin(await papeisRepository.obterPapel(usuarioId));`.
 * É isso que mantém as duas leituras abertas para o órgão na janela sem
 * identidade, cujo papel é `user`, e é por isso que o último caso existe: se
 * alguém trocar `exigirGestorEstoque` por `exigirAdmin`, o painel inteiro do
 * órgão para de ler a trilha, e nenhum outro caso aqui reprovaria.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { Papel } from '@/domain/auth/papel';

const estado = vi.hoisted(() => ({
  usuario: null as { id: string; email: string; nome: string | null } | null,
  papel: 'user' as Papel,
  obterPapelChamadoCom: [] as string[],
  listarChamado: 0,
  exportChamado: 0,
}));

vi.mock('@/infrastructure/auth/current-user', () => ({
  obterUsuarioAtual: async () => estado.usuario,
}));

vi.mock('@/infrastructure/security/rate-limit', () => ({
  POLITICAS: { leituraEstoque: {}, movimentacaoEstoque: {}, conferenciaEstoque: {} },
  consumirRateLimit: () => ({ permitido: true, restante: 99, resetEm: 0 }),
  aplicarHeadersRateLimit: () => {},
}));

vi.mock('@/infrastructure/logging/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

vi.mock('@/infrastructure/repositories', async () => {
  const mov = await import('@/infrastructure/mock/estoque-movimentacoes-repository.mock');
  const ident = await import('@/infrastructure/mock/usuarios-identidade-repository.mock');
  const uni = await import('@/infrastructure/mock/estoque-unidades-repository.mock');
  const sal = await import('@/infrastructure/mock/estoque-saldos-repository.mock');
  const real = mov.estoqueMovimentacoesRepository;
  return {
    papeisRepository: {
      obterPapel: async (id: string) => {
        estado.obterPapelChamadoCom.push(id);
        return estado.papel;
      },
      ehAprovador: async () => false,
    },
    estoqueMovimentacoesRepository: {
      ...real,
      listar: async (...args: Parameters<typeof real.listar>) => {
        estado.listarChamado += 1;
        return real.listar(...args);
      },
      listarParaExport: async (...args: Parameters<typeof real.listarParaExport>) => {
        estado.exportChamado += 1;
        return real.listarParaExport(...args);
      },
    },
    estoqueUnidadesRepository: uni.estoqueUnidadesRepository,
    estoqueSaldosRepository: sal.estoqueSaldosRepository,
    usuariosIdentidadeRepository: ident.usuariosIdentidadeRepository,
  };
});

import { GET as getMovimentacoes } from '@/app/api/estoque/movimentacoes/route';
import { GET as getExport } from '@/app/api/estoque/export/route';
import { USUARIO_SEM_IDENTIDADE } from '@/domain/auth/usuario-sem-identidade';
import { _resetEstoqueMock } from '@/infrastructure/mock/estoque-store.mock';

const PESSOA = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'assistente@exemplo-dmo.test',
  nome: null,
};

function req(caminho: string) {
  return new NextRequest(`http://localhost${caminho}`);
}

const chamarTrilha = () => getMovimentacoes(req('/api/estoque/movimentacoes'));
const chamarExport = () => getExport(req('/api/estoque/export?tipo=movimentacoes'));

/** As duas leituras fechadas, varridas pelo MESMO corpo de caso. */
const LEITURAS: ReadonlyArray<{
  nome: string;
  chamar: () => Promise<NextResponse | Response>;
  contador: () => number;
}> = [
  {
    nome: 'GET /api/estoque/movimentacoes',
    chamar: chamarTrilha,
    contador: () => estado.listarChamado,
  },
  {
    nome: 'GET /api/estoque/export?tipo=movimentacoes',
    chamar: chamarExport,
    contador: () => estado.exportChamado,
  },
];

beforeEach(() => {
  _resetEstoqueMock();
  estado.usuario = PESSOA;
  estado.papel = 'user';
  estado.obterPapelChamadoCom = [];
  estado.listarChamado = 0;
  estado.exportChamado = 0;
  delete process.env.ACESSO_SEM_IDENTIDADE;
});

describe('leitura da trilha de estoque exige gestor (0075)', () => {
  // Varredura explícita das duas rotas: sem o laço, fechar uma e esquecer a
  // outra ficaria verde.
  it('as duas leituras do contrato estão na varredura', () => {
    expect(LEITURAS).toHaveLength(2);
  });

  for (const leitura of LEITURAS) {
    describe(leitura.nome, () => {
      it('sem sessão responde 401 e para na camada de sessão', async () => {
        estado.usuario = null;
        const r = await leitura.chamar();
        expect(r.status).toBe(401);
        expect(await r.json()).toMatchObject({ erro: 'nao_autenticado' });
        // Camada por presença: a de papel nem foi consultada.
        expect(estado.obterPapelChamadoCom).toEqual([]);
        expect(leitura.contador()).toBe(0);
      });

      it('logado com papel user responde 403 pela camada de papel, sem ler o dado', async () => {
        estado.papel = 'user';
        const r = await leitura.chamar();
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({ erro: 'sem_papel_admin' });
        // A recusa veio da SEGUNDA camada: a sessão existia e o papel foi
        // consultado para o id daquela sessão.
        expect(estado.obterPapelChamadoCom).toEqual([PESSOA.id]);
        // Efeito: nada foi lido do repositório antes de recusar.
        expect(leitura.contador()).toBe(0);
      });

      it('admin passa e o repositório é lido', async () => {
        estado.papel = 'admin';
        const r = await leitura.chamar();
        expect(r.status).toBe(200);
        expect(estado.obterPapelChamadoCom).toEqual([PESSOA.id]);
        // Âncora de PRESENÇA: sem este caso, uma guarda que recusasse TODO
        // mundo deixaria os dois casos acima verdes.
        expect(leitura.contador()).toBe(1);
      });

      it('super_admin passa', async () => {
        estado.papel = 'super_admin';
        expect((await leitura.chamar()).status).toBe(200);
        expect(leitura.contador()).toBe(1);
      });

      it('usuário institucional da janela sem identidade passa com papel user', async () => {
        // O que torna seguro fechar estas leituras na janela atual: o órgão
        // opera como este id, cujo papel é `user`, e `podeGerenciarEstoque` o
        // libera ANTES de consultar o papel.
        process.env.ACESSO_SEM_IDENTIDADE = 'sim';
        estado.usuario = { ...USUARIO_SEM_IDENTIDADE };
        estado.papel = 'user';
        expect((await leitura.chamar()).status).toBe(200);
        expect(leitura.contador()).toBe(1);
        // Presença da porta usada: a liberação foi pelo id institucional, e nao
        // por papel, então a camada de papel nem foi consultada.
        expect(estado.obterPapelChamadoCom).toEqual([]);
      });

      it('com a janela DESLIGADA o mesmo id institucional é recusado', async () => {
        // Fail-closed do `acessoSemIdentidadeAtivo`: sem este caso, o anterior
        // não distinguiria "liberado pela janela" de "liberado sempre".
        process.env.ACESSO_SEM_IDENTIDADE = 'nao';
        estado.usuario = { ...USUARIO_SEM_IDENTIDADE };
        estado.papel = 'user';
        const r = await leitura.chamar();
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({ erro: 'sem_papel_admin' });
        expect(estado.obterPapelChamadoCom).toEqual([USUARIO_SEM_IDENTIDADE.id]);
        expect(leitura.contador()).toBe(0);
      });
    });
  }
});
