/**
 * O TERCEIRO caminho para a trilha de estoque: `GET /api/estoque/unidades/[id]`.
 *
 * Em 06/10/2026 fechei `GET /api/estoque/movimentacoes` e `GET /api/estoque/export`
 * em gestor (`tests/unit/api/estoque-leitura-gestor-rotas.test.ts`) e deixei este
 * aberto: ele chama o MESMO `estoqueMovimentacoesRepository.listar` e resolve nome
 * ou e-mail do operador, então entregava a trilha completa, com a
 * `solicitanteMatricula` da 0075, a qualquer usuário logado. O defeito nasceu de
 * fechar dois caminhos sem listar quem mais consumia a projeção, e esta régua
 * existe para que o próximo caminho a ser aberto reprove aqui.
 *
 * O contrato NÃO é 403, e é isso que o teste fixa: o detalhe da unidade é leitura
 * de catálogo e continua aberto a `user`; só a trilha é omitida, com
 * `historico: null` e `historicoVisivel: false`. `null` é diferente de `[]`: a
 * tela precisa poder dizer "você não vê" em vez de "não há" (item 10 do
 * `padrao-ui.md`). Por isso o caso do `user` afirma que a unidade VEIO junto: uma
 * guarda que respondesse 403 passaria pela asserção do histórico e quebraria o
 * catálogo.
 *
 * COMO ESTE ARQUIVO MEDE
 * ----------------------
 * Mesmo molde do arquivo vizinho: importa o helper REAL e mocka só o que está
 * embaixo (sessão, rate limit, logger, barrel de repositórios). Com o helper
 * mockado, trocar a guarda da rota continuaria verde.
 *
 * A asserção nomeia a CAMADA por presença, não julga só pelo número:
 *   - sem sessão, 401 e `obterPapel` NÃO consultado (parou na camada de sessão);
 *   - com sessão e papel `user`, `obterPapel` consultado com o id da sessão, e o
 *     repositório de movimentações NÃO chamado, que é o efeito: omitir o campo
 *     depois de ler o dado já teria trazido a trilha para a memória do processo.
 *
 * O caso do admin semeia uma saída REAL com matrícula antes de ler. Sem ele, o
 * estado de partida vazio deixaria `historico: null` e `historico: []`
 * indistinguíveis, e uma guarda que recusasse todo mundo ficaria verde.
 *
 * Alcance, medido no mesmo dia em `src/infrastructure/auth/permissao-estoque.ts`:
 * `podeGerenciarEstoque` libera o usuário institucional enquanto a janela sem
 * identidade do ADR-0024 estiver ativa. Nessa janela esta guarda NÃO restringe
 * nada, porque o painel do órgão inteiro entra como aquele id. Os dois últimos
 * casos fixam isso nos dois estados da janela: sem eles, alguém trocaria a guarda
 * por `exigirAdmin` e o órgão pararia de ver a trilha sem nenhuma régua reprovar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Papel } from '@/domain/auth/papel';

const estado = vi.hoisted(() => ({
  usuario: null as { id: string; email: string; nome: string | null } | null,
  papel: 'user' as Papel,
  obterPapelChamadoCom: [] as string[],
  listarChamado: 0,
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
    },
    estoqueUnidadesRepository: uni.estoqueUnidadesRepository,
    usuariosIdentidadeRepository: ident.usuariosIdentidadeRepository,
  };
});

import { GET } from '@/app/api/estoque/unidades/[id]/route';
import { USUARIO_SEM_IDENTIDADE } from '@/domain/auth/usuario-sem-identidade';
import { _resetEstoqueMock } from '@/infrastructure/mock/estoque-store.mock';
import { estoqueUnidadesRepository } from '@/infrastructure/mock/estoque-unidades-repository.mock';
import { estoqueMovimentacoesRepository } from '@/infrastructure/mock/estoque-movimentacoes-repository.mock';

const PESSOA = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'assistente@exemplo-dmo.test',
  nome: null,
};

const MATRICULA = 'MAT-4471';

let unidadeId = '';

function chamar(id = unidadeId) {
  const request = new NextRequest(`http://localhost/api/estoque/unidades/${id}`);
  return GET(request, { params: Promise.resolve({ id }) });
}

beforeEach(async () => {
  _resetEstoqueMock();
  estado.usuario = PESSOA;
  estado.papel = 'user';
  estado.obterPapelChamadoCom = [];
  estado.listarChamado = 0;
  delete process.env.ACESSO_SEM_IDENTIDADE;

  const unidade = await estoqueUnidadesRepository.criar({
    descricao: 'Molinete fluviométrico',
  });
  unidadeId = unidade.id;
  // Dado real na trilha: sem esta saída, `historico: null` e `historico: []`
  // ficariam indistinguíveis e os opostos passariam juntos.
  await estoqueMovimentacoesRepository.registrar({
    tipo: 'saida',
    alvo: { natureza: 'serializado', unidadeId },
    quantidade: 1,
    localOrigemId: null,
    localDestinoId: null,
    tamanho: null,
    motivo: 'seed do teste',
    usuarioId: PESSOA.id,
    solicitanteMatricula: MATRICULA,
  });
  estado.listarChamado = 0;
});

describe('GET /api/estoque/unidades/[id]: catálogo aberto, trilha só para gestor', () => {
  it('sem sessão responde 401 e para na camada de sessão', async () => {
    estado.usuario = null;
    const r = await chamar();
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ erro: 'nao_autenticado' });
    expect(estado.obterPapelChamadoCom).toEqual([]);
    expect(estado.listarChamado).toBe(0);
  });

  it('logado com papel user vê a unidade e NÃO a trilha, sem o repositório ser lido', async () => {
    estado.papel = 'user';
    const r = await chamar();
    expect(r.status).toBe(200);
    const corpo = await r.json();
    // Catálogo continua aberto: uma guarda que respondesse 403 quebraria isto.
    expect(corpo.unidade).toMatchObject({ id: unidadeId, descricao: 'Molinete fluviométrico' });
    // "Você não vê", e não "não há".
    expect(corpo.historico).toBeNull();
    expect(corpo.historicoVisivel).toBe(false);
    // A recusa veio da camada de papel, a segunda, com o id da sessão.
    expect(estado.obterPapelChamadoCom).toEqual([PESSOA.id]);
    // Efeito: a trilha nem foi lida antes de ser omitida.
    expect(estado.listarChamado).toBe(0);
  });

  it('admin recebe a trilha com a matrícula do solicitante', async () => {
    estado.papel = 'admin';
    const r = await chamar();
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.historicoVisivel).toBe(true);
    expect(estado.listarChamado).toBe(1);
    // Âncora de PRESENÇA do dado que motivou fechar a rota: é a matrícula que
    // identifica a pessoa, e é ela que o caso do `user` precisa não receber.
    expect(corpo.historico).toHaveLength(1);
    expect(corpo.historico[0]).toMatchObject({
      unidadeId,
      tipo: 'saida',
      solicitanteMatricula: MATRICULA,
    });
    // E o rótulo do operador, que também é dado pessoal, vem resolvido.
    expect(corpo.historico[0].operador).toBeTruthy();
  });

  it('super_admin recebe a trilha', async () => {
    estado.papel = 'super_admin';
    const corpo = await (await chamar()).json();
    expect(corpo.historicoVisivel).toBe(true);
    expect(corpo.historico).toHaveLength(1);
  });

  it('usuário institucional da janela sem identidade recebe a trilha com papel user', async () => {
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    estado.usuario = { ...USUARIO_SEM_IDENTIDADE };
    estado.papel = 'user';
    const corpo = await (await chamar()).json();
    expect(corpo.historicoVisivel).toBe(true);
    expect(estado.listarChamado).toBe(1);
    // Presença da porta usada: liberou pelo id institucional, antes do papel.
    expect(estado.obterPapelChamadoCom).toEqual([]);
  });

  it('com a janela DESLIGADA o mesmo id institucional perde a trilha', async () => {
    // Fail-closed do `acessoSemIdentidadeAtivo`: sem este caso, o anterior não
    // distinguiria "liberado pela janela" de "liberado sempre".
    process.env.ACESSO_SEM_IDENTIDADE = 'nao';
    estado.usuario = { ...USUARIO_SEM_IDENTIDADE };
    estado.papel = 'user';
    const corpo = await (await chamar()).json();
    expect(corpo.historico).toBeNull();
    expect(corpo.historicoVisivel).toBe(false);
    expect(estado.obterPapelChamadoCom).toEqual([USUARIO_SEM_IDENTIDADE.id]);
    expect(estado.listarChamado).toBe(0);
  });
});
