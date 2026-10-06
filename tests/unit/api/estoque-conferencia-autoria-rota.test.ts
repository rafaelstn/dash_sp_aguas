/**
 * `GET /api/estoque/conferencias/[id]/itens` entrega os itens a qualquer logado
 * e a AUTORIA só a quem gere o estoque (decisão do André, PO de Segurança, em
 * 06/10/2026; motivo escrito no docblock da rota).
 *
 * Este arquivo mede o QUARTO caminho para a mesma projeção de identidade de
 * `auth.users`. Os três primeiros foram fechados no mesmo dia
 * (`movimentacoes`, `export`, `unidades/[id]`); este ficou aberto porque fechar
 * caminho sem listar quem mais consome a projeção deixa sempre o seguinte.
 *
 * COMO ESTE ARQUIVO MEDE, E POR QUE ASSIM
 * ---------------------------------------
 * Importa o helper REAL de auth e `podeGerenciarEstoque` REAL, mockando só o
 * que está embaixo: a sessão, o rate limit, o logger e o barrel de
 * repositórios. Com o helper mockado, trocar a guarda por `exigirUsuario`
 * continuaria verde.
 *
 * As asserções são três, e nenhuma sozinha basta:
 *   1. CONTAGEM de chamadas ao repositório de identidade: sem gestão ele não é
 *      consultado (0), com gestão é (1). Guarda que resolvesse a identidade e
 *      só omitisse o campo teria lido o dado à toa; e sem a âncora do caso com
 *      gestão, uma guarda que recusasse todo mundo ficaria verde.
 *   2. AUSÊNCIA do identificador cru no corpo servido, buscada no JSON inteiro,
 *      com ÂNCORA DE PRESENÇA no mesmo teste: o mesmo UUID e o mesmo nome APARECEM
 *      no corpo do gestor. Sem a âncora, um corpo vazio passaria.
 *   3. CAMADA por presença (`obterPapelChamadoCom`), que separa "recusado pela
 *      sessão" de "recusado pelo papel" e prova por onde a liberação passou.
 *
 * O caso da janela sem identidade está aqui de propósito e é o que impede esta
 * mudança de ser lida como mais do que é: com `ACESSO_SEM_IDENTIDADE=sim` o
 * usuário institucional é tratado como gestor e a autoria CONTINUA visível,
 * porque o painel do órgão inteiro entra como aquele usuário. A restrição só
 * passa a valer com a autenticação individual ligada, e é assim que está escrito
 * na rota.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Papel } from '@/domain/auth/papel';

const CONFERENCIA_ID = '22222222-2222-4222-8222-222222222222';
const OPERADOR_ID = '33333333-3333-4333-8333-333333333333';
const RECONCILIADOR_ID = '44444444-4444-4444-8444-444444444444';

const estado = vi.hoisted(() => ({
  usuario: null as { id: string; email: string; nome: string | null } | null,
  papel: 'user' as Papel,
  obterPapelChamadoCom: [] as string[],
  listarItensChamado: 0,
  resolverChamado: 0,
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

vi.mock('@/infrastructure/repositories', () => ({
  papeisRepository: {
    obterPapel: async (id: string) => {
      estado.obterPapelChamadoCom.push(id);
      return estado.papel;
    },
    ehAprovador: async () => false,
  },
  estoqueConferenciasRepository: {
    listarItens: async () => {
      estado.listarItensChamado += 1;
      return {
        itens: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            conferenciaId: CONFERENCIA_ID,
            unidadeId: '66666666-6666-4666-8666-666666666666',
            materialId: null,
            localEsperadoId: null,
            tamanho: null,
            origem: 'esperado',
            situacao: 'encontrado',
            localEncontradoId: null,
            quantidadeSistema: 1,
            quantidadeContada: 1,
            diferenca: 0,
            observacao: null,
            contadoPor: OPERADOR_ID,
            contadoEm: new Date('2026-10-01T12:00:00Z'),
            movimentacaoId: null,
            reconciliadoPor: RECONCILIADOR_ID,
            reconciliadoEm: new Date('2026-10-02T12:00:00Z'),
            criadoEm: new Date('2026-10-01T10:00:00Z'),
            atualizadoEm: new Date('2026-10-02T12:00:00Z'),
          },
        ],
        total: 1,
      };
    },
  },
  usuariosIdentidadeRepository: {
    resolver: async (ids: readonly string[]) => {
      estado.resolverChamado += 1;
      const mapa = new Map<string, { email: string | null; nome: string | null }>();
      for (const id of ids) {
        if (id === OPERADOR_ID) mapa.set(id, { email: 'maria@exemplo-dmo.test', nome: 'Maria Souza' });
        if (id === RECONCILIADOR_ID) mapa.set(id, { email: 'joao@exemplo-dmo.test', nome: 'João Lima' });
      }
      return mapa;
    },
  },
}));

import { GET } from '@/app/api/estoque/conferencias/[id]/itens/route';
import { USUARIO_SEM_IDENTIDADE } from '@/domain/auth/usuario-sem-identidade';

const PESSOA = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'assistente@exemplo-dmo.test',
  nome: null,
};

function chamar() {
  return GET(new NextRequest(`http://localhost/api/estoque/conferencias/${CONFERENCIA_ID}/itens`), {
    params: Promise.resolve({ id: CONFERENCIA_ID }),
  });
}

beforeEach(() => {
  estado.usuario = PESSOA;
  estado.papel = 'user';
  estado.obterPapelChamadoCom = [];
  estado.listarItensChamado = 0;
  estado.resolverChamado = 0;
  delete process.env.ACESSO_SEM_IDENTIDADE;
});

describe('autoria da conferência exige gestão de estoque', () => {
  it('sem sessão responde 401 e não lê a conferência', async () => {
    estado.usuario = null;
    const r = await chamar();
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ erro: 'nao_autenticado' });
    expect(estado.listarItensChamado).toBe(0);
    expect(estado.resolverChamado).toBe(0);
  });

  it('gestor vê a autoria, e é ele a âncora de presença dos outros casos', async () => {
    estado.papel = 'admin';
    const r = await chamar();
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.autoriaVisivel).toBe(true);
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.itens[0].contadoPorRotulo).toBe('Maria Souza');
    expect(corpo.itens[0].reconciliadoPorRotulo).toBe('João Lima');
    expect(corpo.itens[0].contadoPor).toBe(OPERADOR_ID);
    // Presença no corpo servido: é esta string que o caso do `user` exige ausente.
    const bruto = JSON.stringify(corpo);
    expect(bruto).toContain(OPERADOR_ID);
    expect(bruto).toContain('Maria Souza');
    expect(estado.resolverChamado).toBe(1);
    expect(estado.obterPapelChamadoCom).toEqual([PESSOA.id]);
  });

  it('logado sem gestão recebe os itens sem autoria, e a identidade não é consultada', async () => {
    estado.papel = 'user';
    const r = await chamar();
    expect(r.status).toBe(200);
    const corpo = await r.json();
    // A rota NÃO fecha: o item continua vindo, com contagem e divergência.
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.total).toBe(1);
    expect(corpo.itens[0].quantidadeContada).toBe(1);
    // "Você não vê" é diferente de "não há" (item 10 do padrao-ui).
    expect(corpo.autoriaVisivel).toBe(false);
    expect(corpo.itens[0].contadoPor).toBeNull();
    expect(corpo.itens[0].contadoPorRotulo).toBeNull();
    expect(corpo.itens[0].reconciliadoPor).toBeNull();
    expect(corpo.itens[0].reconciliadoPorRotulo).toBeNull();
    // O carimbo de tempo FICA: é estado do item, não identificação de pessoa.
    expect(corpo.itens[0].contadoEm).not.toBeNull();
    // Ausência no corpo inteiro, não só nos campos que eu lembrei de olhar.
    const bruto = JSON.stringify(corpo);
    expect(bruto).not.toContain(OPERADOR_ID);
    expect(bruto).not.toContain(RECONCILIADOR_ID);
    expect(bruto).not.toContain('Maria Souza');
    expect(bruto).not.toContain('maria@exemplo-dmo.test');
    // Efeito: a identidade nem foi lida (não é só omissão na serialização).
    expect(estado.resolverChamado).toBe(0);
    // Camada: a recusa da autoria veio da consulta de papel, com o id da sessão.
    expect(estado.obterPapelChamadoCom).toEqual([PESSOA.id]);
  });

  it('super_admin vê a autoria', async () => {
    estado.papel = 'super_admin';
    const corpo = await (await chamar()).json();
    expect(corpo.autoriaVisivel).toBe(true);
    expect(estado.resolverChamado).toBe(1);
  });

  it('na janela sem identidade a autoria CONTINUA visível (alcance real da guarda)', async () => {
    // Medição, não opinião: nesta janela o órgão inteiro entra como o usuário
    // institucional, que `podeGerenciarEstoque` libera ANTES de olhar o papel.
    // Fechar a autoria só passa a restringir algo com autenticação individual.
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    estado.usuario = { ...USUARIO_SEM_IDENTIDADE };
    estado.papel = 'user';
    const corpo = await (await chamar()).json();
    expect(corpo.autoriaVisivel).toBe(true);
    expect(corpo.itens[0].contadoPorRotulo).toBe('Maria Souza');
    expect(estado.resolverChamado).toBe(1);
    // A liberação foi pelo id institucional: a camada de papel nem foi consultada.
    expect(estado.obterPapelChamadoCom).toEqual([]);
  });

  it('com a janela DESLIGADA o mesmo id institucional perde a autoria', async () => {
    // Fail-closed: sem este caso, o anterior não distinguiria "liberado pela
    // janela" de "liberado sempre".
    process.env.ACESSO_SEM_IDENTIDADE = 'nao';
    estado.usuario = { ...USUARIO_SEM_IDENTIDADE };
    estado.papel = 'user';
    const corpo = await (await chamar()).json();
    expect(corpo.autoriaVisivel).toBe(false);
    expect(corpo.itens[0].contadoPor).toBeNull();
    expect(estado.resolverChamado).toBe(0);
    expect(estado.obterPapelChamadoCom).toEqual([USUARIO_SEM_IDENTIDADE.id]);
  });
});
