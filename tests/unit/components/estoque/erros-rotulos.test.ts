import { describe, it, expect } from 'vitest';
import { mensagemDeErro } from '@/components/features/estoque/erros';
import {
  ROTULO_ESTADO,
  ROTULO_STATUS,
  ROTULO_TIPO_MOV,
  classeBadgeEstado,
  classeBadgeStatus,
  classeBadgeTipoMov,
  formatarData,
  rotuloEstado,
} from '@/components/features/estoque/rotulos';

describe('mensagemDeErro', () => {
  it('prioriza mensagem de negocio por codigo conhecido', () => {
    expect(mensagemDeErro({ erro: 'saldo_insuficiente', mensagem: 'x' }, 409)).toMatch(
      /Saldo insuficiente/i,
    );
    expect(mensagemDeErro({ erro: 'unidade_com_movimentacao' }, 409)).toMatch(/baixa/i);
  });

  it('usa a mensagem do backend quando codigo e desconhecido', () => {
    expect(mensagemDeErro({ erro: 'algo_novo', mensagem: 'Mensagem específica.' }, 400)).toBe(
      'Mensagem específica.',
    );
  });

  it('cai em motivos de validacao quando nao ha mensagem', () => {
    expect(mensagemDeErro({ erro: 'body_invalido', motivos: ['a: obrigatório', 'b: inválido'] }, 400)).toBe(
      'a: obrigatório b: inválido',
    );
  });

  it('cai no texto por status quando o corpo e vazio', () => {
    expect(mensagemDeErro({}, 403)).toMatch(/privilégio/i);
    expect(mensagemDeErro({}, 999)).toMatch(/Não foi possível/i);
  });
});

describe('rotulos e badges', () => {
  it('todos os enums tem rotulo PT-BR nao vazio', () => {
    for (const v of Object.values(ROTULO_ESTADO)) expect(v.length).toBeGreaterThan(0);
    for (const v of Object.values(ROTULO_STATUS)) expect(v.length).toBeGreaterThan(0);
    for (const v of Object.values(ROTULO_TIPO_MOV)) expect(v.length).toBeGreaterThan(0);
  });

  it('rotuloEstado tem fallback para nulo', () => {
    expect(rotuloEstado(null)).toBe('Não informado');
    expect(rotuloEstado('novo')).toBe('Novo');
  });

  it('classes de badge retornam string com tokens', () => {
    expect(classeBadgeEstado('defeito')).toContain('amber');
    expect(classeBadgeStatus('descarte')).toContain('red');
    expect(classeBadgeTipoMov('entrada')).toContain('green');
    expect(classeBadgeEstado(null).length).toBeGreaterThan(0);
  });

  it('formatarData tolera nulo e formata data ISO', () => {
    expect(formatarData(null)).toBe('—');
    expect(formatarData('2026-07-15')).toBe('15/07/2026');
  });
});
