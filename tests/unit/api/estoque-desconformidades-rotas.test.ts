/**
 * Orquestração das rotas da aba "Desconformidades" do estoque sobre o repositório
 * mock: contrato de resposta do GET, decisão do PATCH (nota aparada, unidade
 * opcional, reabrir limpando), códigos 400/404 e log sem a nota. O repositório pg
 * foi provado à parte contra o Postgres do ensaio.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const usuarioAtual = vi.fn();
const gestor = vi.fn();
const logInfo = vi.fn();

vi.mock('@/app/api/_helpers/auth', () => ({
  exigirUsuario: () => usuarioAtual(),
  exigirGestorEstoque: () => gestor(),
}));

vi.mock('@/infrastructure/security/rate-limit', () => ({
  POLITICAS: { leituraEstoque: {}, movimentacaoEstoque: {}, conferenciaEstoque: {} },
  consumirRateLimit: () => ({ permitido: true, restante: 99, resetEm: 0 }),
  aplicarHeadersRateLimit: () => {},
}));

vi.mock('@/infrastructure/logging/logger', () => ({
  logger: { info: (...a: unknown[]) => logInfo(...a), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/infrastructure/repositories', async () => {
  const d = await import('@/infrastructure/mock/estoque-desconformidades-repository.mock');
  const u = await import('@/infrastructure/mock/estoque-unidades-repository.mock');
  return {
    estoqueDesconformidadesRepository: d.estoqueDesconformidadesRepository,
    estoqueUnidadesRepository: u.estoqueUnidadesRepository,
  };
});

import { GET } from '@/app/api/estoque/desconformidades/route';
import { PATCH } from '@/app/api/estoque/desconformidades/[id]/route';
import {
  _resetEstoqueDesconformidadesMock,
  _semearDesconformidadeMock,
} from '@/infrastructure/mock/estoque-desconformidades-repository.mock';
import { estoqueStore } from '@/infrastructure/mock/estoque-store.mock';

const USUARIO = { id: '11111111-1111-4111-8111-111111111111', email: 'gestor@exemplo-dmo.test', nome: null };
const UNIDADE = '22222222-2222-4222-8222-222222222222';
const INEXISTENTE = '33333333-3333-4333-8333-333333333333';

function get(qs = '') {
  const url = new URL(`http://localhost/api/estoque/desconformidades${qs}`);
  return GET({ nextUrl: url } as unknown as Parameters<typeof GET>[0]);
}

function patch(id: string, corpo: unknown) {
  const req = new Request(`http://localhost/api/estoque/desconformidades/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  }) as unknown as Parameters<typeof PATCH>[0];
  return PATCH(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  _resetEstoqueDesconformidadesMock();
  estoqueStore.unidades.clear();
  usuarioAtual.mockResolvedValue(USUARIO);
  gestor.mockResolvedValue(USUARIO);
  logInfo.mockReset();
});

describe('GET /api/estoque/desconformidades', () => {
  it('401 sem sessão', async () => {
    usuarioAtual.mockResolvedValue(NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 }));
    expect((await get()).status).toBe(401);
  });

  it('contagem ignora o status, respeita o tipo; aberta vem primeiro', async () => {
    _semearDesconformidadeMock({ tipo: 'chave_repetida', detalhe: 'x', status: 'resolvida', nota: 'ok ok', resolvidaPor: USUARIO.id, resolvidaEm: new Date() });
    const aberta = _semearDesconformidadeMock({ tipo: 'chave_repetida', detalhe: 'y' });
    _semearDesconformidadeMock({ tipo: 'quantidade_vazia', detalhe: 'z' });

    const todas = await (await get('?tipo=chave_repetida')).json();
    expect(todas.total).toBe(2);
    expect(todas.itens[0].id).toBe(aberta.id);
    expect(todas.contagem).toEqual({ aberta: 1, resolvida: 1, ignorada: 0 });
    expect(todas).toMatchObject({ pagina: 1, porPagina: 50 });

    const soAbertas = await (await get('?status=aberta&tipo=chave_repetida')).json();
    expect(soAbertas.total).toBe(1);
    expect(soAbertas.contagem).toEqual({ aberta: 1, resolvida: 1, ignorada: 0 });
  });

  it('400 com porPagina 201 e com status inválido', async () => {
    const r1 = await get('?porPagina=201');
    expect(r1.status).toBe(400);
    expect((await r1.json()).erro).toBe('consulta_invalida');
    expect((await get('?status=fechada')).status).toBe(400);
  });
});

describe('PATCH /api/estoque/desconformidades/[id]', () => {
  it('403 quando não é gestor de estoque', async () => {
    gestor.mockResolvedValue(NextResponse.json({ erro: 'sem_permissao' }, { status: 403 }));
    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    expect((await patch(d.id, { status: 'resolvida', nota: 'ok ok' })).status).toBe(403);
  });

  it('resolve com nota aparada e unidadeId; quem decide vem do auth; log sem nota', async () => {
    estoqueStore.unidades.set(UNIDADE, { id: UNIDADE } as never);
    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    const r = await patch(d.id, { status: 'resolvida', nota: '  cadastrado à mão  ', unidadeId: UNIDADE, resolvidaPor: INEXISTENTE });
    expect(r.status).toBe(200);
    const dto = await r.json();
    expect(dto).toMatchObject({ status: 'resolvida', nota: 'cadastrado à mão', unidadeId: UNIDADE, resolvidaPor: USUARIO.id });
    expect(typeof dto.resolvidaEm).toBe('string');

    expect(logInfo).toHaveBeenCalledTimes(1);
    const [evento, campos] = logInfo.mock.calls[0]!;
    expect(evento).toBe('estoque.desconformidades.decidida');
    expect(campos).toMatchObject({ statusAnterior: 'aberta', statusNovo: 'resolvida' });
    expect(JSON.stringify(logInfo.mock.calls[0])).not.toContain('cadastrado');
  });

  it('resolve sem unidadeId', async () => {
    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    const r = await patch(d.id, { status: 'resolvida', nota: 'ok ok' });
    expect(r.status).toBe(200);
    expect((await r.json()).unidadeId).toBeNull();
  });

  it('400 corpo_invalido: nota vazia, nota só de espaços, status inválido, JSON quebrado', async () => {
    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    for (const corpo of [
      { status: 'resolvida', nota: '' },
      { status: 'ignorada', nota: '    ' },
      { status: 'resolvida' },
      { status: 'fechada', nota: 'ok ok' },
      '{nao e json',
    ]) {
      const r = await patch(d.id, corpo);
      expect(r.status).toBe(400);
      const b = await r.json();
      expect(b.erro).toBe('corpo_invalido');
      expect(typeof b.mensagem).toBe('string');
    }
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('404 desconformidade_nao_encontrada e 404 unidade_nao_encontrada', async () => {
    const r1 = await patch(INEXISTENTE, { status: 'resolvida', nota: 'ok ok' });
    expect(r1.status).toBe(404);
    expect((await r1.json()).erro).toBe('desconformidade_nao_encontrada');

    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    const r2 = await patch(d.id, { status: 'resolvida', nota: 'ok ok', unidadeId: INEXISTENTE });
    expect(r2.status).toBe(404);
    expect((await r2.json()).erro).toBe('unidade_nao_encontrada');
  });

  it('reabrir limpa nota, unidade, quem e quando', async () => {
    estoqueStore.unidades.set(UNIDADE, { id: UNIDADE } as never);
    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    await patch(d.id, { status: 'resolvida', nota: 'ok ok', unidadeId: UNIDADE });
    const r = await patch(d.id, { status: 'aberta', nota: 'ab', unidadeId: UNIDADE });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: 'aberta', nota: null, unidadeId: null, resolvidaPor: null, resolvidaEm: null });
    expect(logInfo.mock.calls[1]?.[1]).toMatchObject({ statusAnterior: 'resolvida', statusNovo: 'aberta' });
  });

  it('reabrir leva ao log quem, quando e com que unidade a decisão apagada foi tomada, sem a nota', async () => {
    estoqueStore.unidades.set(UNIDADE, { id: UNIDADE } as never);
    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    const resolvida = await (await patch(d.id, { status: 'resolvida', nota: 'nota secreta', unidadeId: UNIDADE })).json();
    await patch(d.id, { status: 'aberta' });

    const campos = logInfo.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(campos.decisaoAnterior).toEqual({
      resolvidaPor: USUARIO.id,
      resolvidaEm: resolvida.resolvidaEm,
      unidadeId: UNIDADE,
    });
    expect(JSON.stringify(logInfo.mock.calls)).not.toContain('nota secreta');
    expect((logInfo.mock.calls[0]?.[1] as Record<string, unknown>).decisaoAnterior).toEqual({
      resolvidaPor: null,
      resolvidaEm: null,
      unidadeId: null,
    });
  });
});

describe('PATCH /api/estoque/desconformidades/[id] com statusEsperado (decisão concorrente)', () => {
  it('409 desconformidade_alterada quando o status mudou, sem gravar nem logar decisão', async () => {
    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    const primeira = await patch(d.id, { status: 'ignorada', nota: 'decisão de A', statusEsperado: 'aberta' });
    expect(primeira.status).toBe(200);

    const segunda = await patch(d.id, { status: 'resolvida', nota: 'decisão de B', statusEsperado: 'aberta' });
    expect(segunda.status).toBe(409);
    expect(await segunda.json()).toEqual({
      erro: 'desconformidade_alterada',
      mensagem: 'Esta desconformidade foi alterada por outra pessoa. Atualize a lista.',
    });

    const lista = await (await get()).json();
    expect(lista.itens[0]).toMatchObject({ id: d.id, status: 'ignorada', nota: 'decisão de A' });
    expect(logInfo.mock.calls.filter((c) => c[0] === 'estoque.desconformidades.decidida')).toHaveLength(1);
  });

  it('200 quando o status esperado confere, inclusive para reabrir', async () => {
    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    const r1 = await patch(d.id, { status: 'resolvida', nota: 'ok ok', statusEsperado: 'aberta' });
    expect(r1.status).toBe(200);
    const r2 = await patch(d.id, { status: 'aberta', statusEsperado: 'resolvida' });
    expect(r2.status).toBe(200);
    expect((await r2.json()).status).toBe('aberta');
  });

  it('sem statusEsperado mantém o comportamento anterior: sobrescreve', async () => {
    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    await patch(d.id, { status: 'ignorada', nota: 'decisão de A' });
    const r = await patch(d.id, { status: 'resolvida', nota: 'decisão de B' });
    expect(r.status).toBe(200);
    expect((await r.json()).nota).toBe('decisão de B');
  });

  it('400 corpo_invalido com statusEsperado fora do enum ou nulo', async () => {
    const d = _semearDesconformidadeMock({ tipo: 'item_sem_descricao', detalhe: 'x' });
    for (const statusEsperado of ['fechada', null, 1]) {
      const r = await patch(d.id, { status: 'resolvida', nota: 'ok ok', statusEsperado });
      expect(r.status).toBe(400);
      expect((await r.json()).erro).toBe('corpo_invalido');
    }
    expect((await get()).status).toBe(200);
    expect((await (await get()).json()).itens[0].status).toBe('aberta');
  });

  it('404 continua valendo para id inexistente com statusEsperado', async () => {
    const r = await patch(INEXISTENTE, { status: 'resolvida', nota: 'ok ok', statusEsperado: 'aberta' });
    expect(r.status).toBe(404);
    expect((await r.json()).erro).toBe('desconformidade_nao_encontrada');
  });
});
