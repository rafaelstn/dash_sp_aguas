import { describe, it, expect } from 'vitest';
import type { CampoFicha } from '@/domain/fichas/schemas';
import {
  validarCabecalhoFicha,
  normalizarDadosFicha,
  mensagemZodPtBR,
} from '@/domain/fichas/validacao-ficha';

const campo = (parcial: Partial<CampoFicha> & Pick<CampoFicha, 'chave' | 'tipo'>): CampoFicha =>
  ({ rotulo: parcial.chave, ...parcial }) as CampoFicha;

describe('validarCabecalhoFicha', () => {
  it('exige nome do técnico e data no formato AAAA-MM-DD', () => {
    const erros = validarCabecalhoFicha({ tecnicoNome: '  ', dataVisita: '01/02/2026' });
    expect(erros['__tecnicoNome']).toBeDefined();
    expect(erros['__dataVisita']).toBeDefined();
  });

  it('não acusa erro quando cabeçalho é válido', () => {
    const erros = validarCabecalhoFicha({ tecnicoNome: 'Ana', dataVisita: '2026-02-01' });
    expect(Object.keys(erros)).toHaveLength(0);
  });
});

describe('normalizarDadosFicha', () => {
  it('converte número pt-BR e mantém cru o inválido', () => {
    const campos = [campo({ chave: 'leitura', tipo: 'numero' })];
    expect(normalizarDadosFicha(campos, { leitura: '1.234,5' })).toEqual({ leitura: 1234.5 });
    expect(normalizarDadosFicha(campos, { leitura: 'abc' })).toEqual({ leitura: 'abc' });
  });

  it('campo numero obrigatório vazio vira undefined; opcional vira null', () => {
    const obrig = [campo({ chave: 'x', tipo: 'numero', obrigatorio: true })];
    const opc = [campo({ chave: 'x', tipo: 'numero' })];
    expect(normalizarDadosFicha(obrig, { x: '' })).toEqual({ x: undefined });
    expect(normalizarDadosFicha(opc, { x: '' })).toEqual({ x: null });
  });

  it('checkbox vira boolean e texto vazio opcional vira null', () => {
    const campos = [
      campo({ chave: 'ok', tipo: 'checkbox' }),
      campo({ chave: 'obs', tipo: 'texto' }),
    ];
    expect(normalizarDadosFicha(campos, { ok: 'on', obs: '' })).toEqual({ ok: true, obs: null });
  });
});

describe('mensagemZodPtBR', () => {
  it('mapeia códigos conhecidos e cai no original/fallback', () => {
    expect(mensagemZodPtBR('too_small', 'x')).toMatch(/mínimo/);
    expect(mensagemZodPtBR('invalid_string', 'Coordenada inválida')).toBe('Coordenada inválida');
    expect(mensagemZodPtBR('desconhecido', '')).toBe('Valor inválido.');
  });
});
