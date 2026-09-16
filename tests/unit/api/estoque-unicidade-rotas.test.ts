/**
 * Colunas UNIQUE do estoque gravadas pela API respondem 409 com mensagem de
 * negócio, e não 500 `falha_repositorio` com "tente de novo" (achado M1 do QA).
 *
 * Roda sobre os repositórios MOCK, que espelham os índices únicos do banco
 * (uq_estoque_unidades_codigo, uq_estoque_categorias_nome, uq_estoque_locais_chave,
 * uq_estoque_materiais_dedup). O adapter pg é provado contra o Postgres real em
 * tests/integration/estoque-unicidade-postgres.test.ts.
 *
 * Todo caso de conflito tem âncora de PRESENÇA (o que foi gravado antes continua
 * lá, e o caso legítimo passa), porque um 409 que recusasse tudo também ficaria
 * verde numa asserção só de status.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gestor = vi.fn();

vi.mock('@/app/api/_helpers/auth', () => ({
  exigirUsuario: () => gestor(),
  exigirGestorEstoque: () => gestor(),
}));

vi.mock('@/infrastructure/security/rate-limit', () => ({
  POLITICAS: { leituraEstoque: {}, movimentacaoEstoque: {}, conferenciaEstoque: {} },
  consumirRateLimit: () => ({ permitido: true, restante: 99, resetEm: 0 }),
  aplicarHeadersRateLimit: () => {},
}));

vi.mock('@/infrastructure/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/infrastructure/repositories', async () => {
  const u = await import('@/infrastructure/mock/estoque-unidades-repository.mock');
  const c = await import('@/infrastructure/mock/estoque-categorias-repository.mock');
  const l = await import('@/infrastructure/mock/estoque-locais-repository.mock');
  const m = await import('@/infrastructure/mock/estoque-materiais-repository.mock');
  return {
    estoqueUnidadesRepository: u.estoqueUnidadesRepository,
    estoqueCategoriasRepository: c.estoqueCategoriasRepository,
    estoqueLocaisRepository: l.estoqueLocaisRepository,
    estoqueMateriaisRepository: m.estoqueMateriaisRepository,
    estoqueMovimentacoesRepository: {},
    usuariosIdentidadeRepository: {},
  };
});

import { POST as postUnidade } from '@/app/api/estoque/unidades/route';
import { PATCH as patchUnidade } from '@/app/api/estoque/unidades/[id]/route';
import { POST as postCategoria } from '@/app/api/estoque/categorias/route';
import { PATCH as patchCategoria } from '@/app/api/estoque/categorias/[id]/route';
import { POST as postLocal } from '@/app/api/estoque/locais/route';
import { PATCH as patchLocal } from '@/app/api/estoque/locais/[id]/route';
import { POST as postMaterial } from '@/app/api/estoque/materiais/route';
import { PATCH as patchMaterial } from '@/app/api/estoque/materiais/[id]/route';
import { _resetEstoqueMock, estoqueStore } from '@/infrastructure/mock/estoque-store.mock';

const USUARIO = { id: '11111111-1111-4111-8111-111111111111', email: 'gestor@exemplo-dmo.test', nome: null };

type Handler = (req: never, ctx: never) => Promise<Response>;

function requisicao(metodo: 'POST' | 'PATCH', caminho: string, corpo: unknown) {
  return new Request(`http://localhost${caminho}`, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

async function post(handler: Handler, caminho: string, corpo: unknown) {
  return handler(requisicao('POST', caminho, corpo) as never, undefined as never);
}

async function patch(handler: Handler, caminho: string, id: string, corpo: unknown) {
  return handler(
    requisicao('PATCH', `${caminho}/${id}`, corpo) as never,
    { params: Promise.resolve({ id }) } as never,
  );
}

beforeEach(() => {
  _resetEstoqueMock();
  gestor.mockResolvedValue(USUARIO);
});

describe('unidades: código de etiqueta repetido', () => {
  it('POST com código já existente responde 409 com o corpo combinado, sem gravar a segunda', async () => {
    const r1 = await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'Pluviômetro', codigo: '1SPA26PENHA' });
    expect(r1.status).toBe(201);

    const r2 = await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'Outro', codigo: '1SPA26PENHA' });
    expect(r2.status).toBe(409);
    expect(await r2.json()).toEqual({
      erro: 'codigo_duplicado',
      mensagem: 'Já existe um item com o código 1SPA26PENHA.',
      codigo: '1SPA26PENHA',
    });
    expect(estoqueStore.unidades.size).toBe(1);
  });

  it('POST com código novo e POST sem código continuam 201 (o índice é parcial)', async () => {
    await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'A', codigo: '1SPA26PENHA' });
    expect((await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'B', codigo: '2SPA26PENHA' })).status).toBe(201);
    expect((await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'Modem 1' })).status).toBe(201);
    expect((await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'Modem 2' })).status).toBe(201);
    expect(estoqueStore.unidades.size).toBe(4);
  });

  it('PATCH trocando para código de outra unidade responde 409; manter o próprio código passa', async () => {
    await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'A', codigo: '1SPA26PENHA' });
    const b = await (await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'B', codigo: '2SPA26PENHA' })).json();

    const r = await patch(patchUnidade as Handler, '/api/estoque/unidades', b.id, { codigo: '1SPA26PENHA' });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      erro: 'codigo_duplicado',
      mensagem: 'Já existe um item com o código 1SPA26PENHA.',
      codigo: '1SPA26PENHA',
    });
    expect(estoqueStore.unidades.get(b.id)?.codigo).toBe('2SPA26PENHA');

    const proprio = await patch(patchUnidade as Handler, '/api/estoque/unidades', b.id, { codigo: '2SPA26PENHA', descricao: 'B editada' });
    expect(proprio.status).toBe(200);
    expect((await proprio.json()).descricao).toBe('B editada');
  });

  it('código que só difere na caixa responde 409 no POST e no PATCH; a própria unidade troca a caixa e grava como veio', async () => {
    const a = await (await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'A', codigo: '001SPA26Arara' })).json();
    const b = await (await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'B', codigo: '002SPA26Arara' })).json();

    const r1 = await post(postUnidade as Handler, '/api/estoque/unidades', { descricao: 'C', codigo: '001spa26arara' });
    expect(r1.status).toBe(409);
    expect(await r1.json()).toEqual({
      erro: 'codigo_duplicado',
      mensagem: 'Já existe um item com o código 001spa26arara.',
      codigo: '001spa26arara',
    });
    expect(estoqueStore.unidades.size).toBe(2);

    const r2 = await patch(patchUnidade as Handler, '/api/estoque/unidades', b.id, { codigo: '001spa26arara' });
    expect(r2.status).toBe(409);
    expect((await r2.json()).erro).toBe('codigo_duplicado');
    expect(estoqueStore.unidades.get(b.id)?.codigo).toBe('002SPA26Arara');

    const proprio = await patch(patchUnidade as Handler, '/api/estoque/unidades', a.id, { codigo: '001spa26ARARA' });
    expect(proprio.status).toBe(200);
    expect(estoqueStore.unidades.get(a.id)?.codigo).toBe('001spa26ARARA');
  });
});

describe('categorias: nome repetido ignorando caixa', () => {
  it('POST responde 409 categoria_duplicada; PATCH para nome de outra também', async () => {
    expect((await post(postCategoria as Handler, '/api/estoque/categorias', { nome: 'Cabos' })).status).toBe(201);
    const outra = await (await post(postCategoria as Handler, '/api/estoque/categorias', { nome: 'Sensores' })).json();

    const r1 = await post(postCategoria as Handler, '/api/estoque/categorias', { nome: 'cabos' });
    expect(r1.status).toBe(409);
    expect(await r1.json()).toEqual({
      erro: 'categoria_duplicada',
      mensagem: 'Já existe uma categoria com o nome cabos.',
      nome: 'cabos',
    });

    const r2 = await patch(patchCategoria as Handler, '/api/estoque/categorias', outra.id, { nome: 'CABOS' });
    expect(r2.status).toBe(409);
    expect((await r2.json()).erro).toBe('categoria_duplicada');
    expect(estoqueStore.categorias.get(outra.id)?.nome).toBe('Sensores');

    expect((await patch(patchCategoria as Handler, '/api/estoque/categorias', outra.id, { nome: 'sensores' })).status).toBe(200);
  });
});

describe('locais: mesma unidade, sala, prateleira e armário', () => {
  it('POST responde 409 local_duplicado com o rótulo; PATCH para a chave de outro também', async () => {
    expect((await post(postLocal as Handler, '/api/estoque/locais', { unidade: 'PENHA', sala: '2', prateleira: '5b' })).status).toBe(201);
    const outro = await (await post(postLocal as Handler, '/api/estoque/locais', { unidade: 'PENHA', sala: '3' })).json();

    const r1 = await post(postLocal as Handler, '/api/estoque/locais', { unidade: 'PENHA', sala: ' 2 ', prateleira: '5B' });
    expect(r1.status).toBe(409);
    expect(await r1.json()).toEqual({
      erro: 'local_duplicado',
      mensagem: 'Já existe o local PENHA / SALA 2 / PRAT 5B.',
      rotulo: 'PENHA / SALA 2 / PRAT 5B',
    });

    const r2 = await patch(patchLocal as Handler, '/api/estoque/locais', outro.id, { sala: '2', prateleira: '5B' });
    expect(r2.status).toBe(409);
    expect((await r2.json()).erro).toBe('local_duplicado');
    expect(estoqueStore.locais.get(outro.id)?.rotulo).toBe('PENHA / SALA 3');

    expect((await patch(patchLocal as Handler, '/api/estoque/locais', outro.id, { observacao: 'ok' })).status).toBe(200);
    expect(estoqueStore.locais.size).toBe(2);
  });
});

describe('materiais: mesma natureza, descrição, marca e modelo', () => {
  it('POST responde 409 material_duplicado; outra natureza passa; PATCH para a chave de outro responde 409', async () => {
    const base = { descricao: 'Cabo PP', marca: 'Sil', modelo: '2x1', natureza: 'quantificavel' };
    expect((await post(postMaterial as Handler, '/api/estoque/materiais', base)).status).toBe(201);

    const r1 = await post(postMaterial as Handler, '/api/estoque/materiais', { ...base, descricao: 'cabo pp', marca: 'SIL' });
    expect(r1.status).toBe(409);
    expect(await r1.json()).toEqual({
      erro: 'material_duplicado',
      mensagem: 'Já existe um material com a mesma descrição, marca e modelo nesta natureza.',
    });

    const serializado = await post(postMaterial as Handler, '/api/estoque/materiais', { ...base, natureza: 'serializado' });
    expect(serializado.status).toBe(201);
    const idSerializado = (await serializado.json()).id;

    const r2 = await patch(patchMaterial as Handler, '/api/estoque/materiais', idSerializado, { natureza: 'quantificavel' });
    expect(r2.status).toBe(409);
    expect((await r2.json()).erro).toBe('material_duplicado');
    expect(estoqueStore.materiais.get(idSerializado)?.natureza).toBe('serializado');

    expect((await patch(patchMaterial as Handler, '/api/estoque/materiais', idSerializado, { modelo: '3x1' })).status).toBe(200);
    expect(estoqueStore.materiais.size).toBe(2);
  });
});
