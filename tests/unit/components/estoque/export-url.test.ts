import { describe, it, expect } from 'vitest';
import {
  urlExportarSerializado,
  urlExportarQuantificavel,
  urlExportarMovimentacoes,
} from '@/components/features/estoque/api';

/**
 * Garante que os construtores de URL do export batem com o contrato do backend
 * (`GET /api/estoque/export?tipo=...`): `tipo` sempre presente, filtros vazios
 * ignorados e, em movimentacoes, o tipo de movimento vai como `tipoMov`.
 */

function paramsDe(url: string): URLSearchParams {
  const [caminho, query] = url.split('?');
  expect(caminho).toBe('/api/estoque/export');
  return new URLSearchParams(query ?? '');
}

describe('urlExportarSerializado', () => {
  it('sem filtros envia apenas tipo=serializado', () => {
    const p = paramsDe(urlExportarSerializado({}));
    expect(p.get('tipo')).toBe('serializado');
    expect([...p.keys()]).toEqual(['tipo']);
  });

  it('inclui apenas os filtros setados, ignorando vazios', () => {
    const p = paramsDe(
      urlExportarSerializado({
        unidade: 'PENHA',
        local: 'loc-1',
        estado: undefined,
        status: 'ativo',
        busca: 'router',
      }),
    );
    expect(p.get('tipo')).toBe('serializado');
    expect(p.get('unidade')).toBe('PENHA');
    expect(p.get('local')).toBe('loc-1');
    expect(p.get('status')).toBe('ativo');
    expect(p.get('busca')).toBe('router');
    expect(p.has('estado')).toBe(false);
    expect(p.has('materialId')).toBe(false);
  });
});

describe('urlExportarQuantificavel', () => {
  it('envia tipo=quantificavel com unidade/local (sem categoria/busca de cliente)', () => {
    const p = paramsDe(urlExportarQuantificavel({ unidade: 'ARARAQUARA', local: 'loc-9' }));
    expect(p.get('tipo')).toBe('quantificavel');
    expect(p.get('unidade')).toBe('ARARAQUARA');
    expect(p.get('local')).toBe('loc-9');
    expect(p.has('categoria')).toBe(false);
    expect(p.has('busca')).toBe(false);
  });
});

describe('urlExportarMovimentacoes', () => {
  it('sem argumento exporta a trilha inteira (so tipo=movimentacoes)', () => {
    const p = paramsDe(urlExportarMovimentacoes());
    expect(p.get('tipo')).toBe('movimentacoes');
    expect([...p.keys()]).toEqual(['tipo']);
  });

  it('filtra por item via unidadeId', () => {
    const p = paramsDe(urlExportarMovimentacoes({ unidadeId: 'u-123' }));
    expect(p.get('tipo')).toBe('movimentacoes');
    expect(p.get('unidadeId')).toBe('u-123');
  });

  it('filtra por material via materialId', () => {
    const p = paramsDe(urlExportarMovimentacoes({ materialId: 'm-456' }));
    expect(p.get('materialId')).toBe('m-456');
  });

  it('o tipo de movimento vai como tipoMov (nao como tipo)', () => {
    const p = paramsDe(urlExportarMovimentacoes({ tipoMov: 'transferencia' }));
    expect(p.get('tipo')).toBe('movimentacoes');
    expect(p.get('tipoMov')).toBe('transferencia');
  });

  it('passa unidadeId, usuarioId e periodo (de/ate)', () => {
    const p = paramsDe(
      urlExportarMovimentacoes({
        unidadeId: 'u-1',
        usuarioId: 'usr-7',
        de: '2026-07-01',
        ate: '2026-07-15',
      }),
    );
    expect(p.get('unidadeId')).toBe('u-1');
    expect(p.get('usuarioId')).toBe('usr-7');
    expect(p.get('de')).toBe('2026-07-01');
    expect(p.get('ate')).toBe('2026-07-15');
  });
});
