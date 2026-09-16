import { describe, expect, it } from 'vitest';
import {
  decidirDesconformidadeSchema,
  listarDesconformidadesQuerySchema,
  statusDesconformidadeEnum,
  tipoDesconformidadeEnum,
} from '@/app/api/estoque/desconformidades/_schemas';
import { STATUS_DESCONFORMIDADE, TIPOS_DESCONFORMIDADE } from '@/domain/estoque/desconformidade';

const UUID = '5b7c0f7e-2a51-4d3b-9e0a-8f1c2d3e4f50';

describe('paridade dos enums de desconformidade com o domínio', () => {
  it('tipos: mesma lista nos dois lados', () => {
    expect([...tipoDesconformidadeEnum.options].sort()).toEqual([...TIPOS_DESCONFORMIDADE].sort());
    expect(TIPOS_DESCONFORMIDADE).toHaveLength(7);
  });

  it('status: mesma lista nos dois lados', () => {
    expect([...statusDesconformidadeEnum.options].sort()).toEqual([...STATUS_DESCONFORMIDADE].sort());
  });
});

describe('decidirDesconformidadeSchema', () => {
  it('reprova resolvida sem nota', () => {
    const r = decidirDesconformidadeSchema.safeParse({ status: 'resolvida' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['nota']);
  });

  it('reprova resolvida com nota vazia', () => {
    expect(decidirDesconformidadeSchema.safeParse({ status: 'resolvida', nota: '' }).success).toBe(false);
  });

  it('reprova nota só de espaços: o trim vem antes da conta', () => {
    expect(decidirDesconformidadeSchema.safeParse({ status: 'ignorada', nota: '      ' }).success).toBe(false);
    expect(decidirDesconformidadeSchema.safeParse({ status: 'resolvida', nota: '  ab  ' }).success).toBe(false);
  });

  it('reprova nota com 501 caracteres e aprova com 500', () => {
    expect(
      decidirDesconformidadeSchema.safeParse({ status: 'resolvida', nota: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(
      decidirDesconformidadeSchema.safeParse({ status: 'resolvida', nota: 'x'.repeat(500) }).success,
    ).toBe(true);
  });

  it('aprova 3 caracteres depois do trim e devolve a nota aparada', () => {
    const r = decidirDesconformidadeSchema.safeParse({ status: 'resolvida', nota: '  abc  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nota).toBe('abc');
  });

  it('reprova status inválido', () => {
    expect(decidirDesconformidadeSchema.safeParse({ status: 'fechada', nota: 'ok ok' }).success).toBe(false);
    expect(decidirDesconformidadeSchema.safeParse({ nota: 'ok ok' }).success).toBe(false);
  });

  it('reprova unidadeId que não é uuid', () => {
    expect(
      decidirDesconformidadeSchema.safeParse({ status: 'resolvida', nota: 'ok ok', unidadeId: '123' }).success,
    ).toBe(false);
  });

  it('aceita unidadeId opcional com resolvida', () => {
    expect(
      decidirDesconformidadeSchema.safeParse({ status: 'resolvida', nota: 'ok ok', unidadeId: UUID }).success,
    ).toBe(true);
    expect(decidirDesconformidadeSchema.safeParse({ status: 'resolvida', nota: 'ok ok' }).success).toBe(true);
  });

  it('aceita reabrir sem nota, e com nota curta (é descartada)', () => {
    expect(decidirDesconformidadeSchema.safeParse({ status: 'aberta' }).success).toBe(true);
    expect(decidirDesconformidadeSchema.safeParse({ status: 'aberta', nota: 'ab' }).success).toBe(true);
  });
});

describe('listarDesconformidadesQuerySchema', () => {
  it('consulta vazia usa os padrões', () => {
    const r = listarDesconformidadesQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ status: undefined, tipo: undefined, pagina: 1, porPagina: 50 });
  });

  it('status e tipo vazios valem como ausentes', () => {
    const r = listarDesconformidadesQuerySchema.safeParse({ status: '', tipo: '', pagina: '', porPagina: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ status: undefined, tipo: undefined, pagina: 1, porPagina: 50 });
  });

  it('aprova porPagina 200 e reprova 201', () => {
    expect(listarDesconformidadesQuerySchema.safeParse({ porPagina: '200' }).success).toBe(true);
    expect(listarDesconformidadesQuerySchema.safeParse({ porPagina: '201' }).success).toBe(false);
  });

  it('reprova pagina 0, pagina não inteira e status inválido', () => {
    expect(listarDesconformidadesQuerySchema.safeParse({ pagina: '0' }).success).toBe(false);
    expect(listarDesconformidadesQuerySchema.safeParse({ pagina: '1.5' }).success).toBe(false);
    expect(listarDesconformidadesQuerySchema.safeParse({ pagina: 'abc' }).success).toBe(false);
    expect(listarDesconformidadesQuerySchema.safeParse({ status: 'fechada' }).success).toBe(false);
    expect(listarDesconformidadesQuerySchema.safeParse({ tipo: 'outro' }).success).toBe(false);
  });
});
