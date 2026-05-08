import { describe, expect, it } from 'vitest';
import {
  ESTADOS_TRIAGEM,
  MotivoDecisao,
  MotivoDecisaoInsuficienteError,
  estadoEhTerminal,
  podeTransitar,
  type EstadoTriagem,
} from '@/domain/triagem';

/**
 * Testes contractuais do domínio de triagem (ADR-0008 §4 da spec).
 * Cobertura-alvo: 90% lines / 85% branches.
 */

describe('domínio/triagem — ESTADOS_TRIAGEM', () => {
  it('expõe os 5 estados canônicos da spec §4.1', () => {
    expect(ESTADOS_TRIAGEM).toEqual([
      'pendente',
      'em_revisao',
      'aprovada',
      'rejeitada',
      'devolvida',
    ]);
  });

  it('é congelado — tentar mutar lança em strict mode', () => {
    expect(Object.isFrozen(ESTADOS_TRIAGEM)).toBe(true);
  });
});

describe('domínio/triagem — podeTransitar (máquina de estados §4.3)', () => {
  describe('transições VÁLIDAS', () => {
    it.each<[EstadoTriagem, EstadoTriagem]>([
      ['pendente', 'em_revisao'],
      ['em_revisao', 'pendente'], // liberação por TTL
      ['em_revisao', 'aprovada'],
      ['em_revisao', 'rejeitada'],
      ['em_revisao', 'devolvida'],
    ])('aceita %s → %s', (de, para) => {
      expect(podeTransitar(de, para)).toBe(true);
    });
  });

  describe('transições INVÁLIDAS — proteção do invariante', () => {
    it.each<[EstadoTriagem, EstadoTriagem]>([
      // Estados terminais nunca saem (imutabilidade após decisão)
      ['aprovada', 'pendente'],
      ['aprovada', 'em_revisao'],
      ['rejeitada', 'pendente'],
      ['devolvida', 'pendente'], // re-envio cria NOVA linha (§9.2)
      ['devolvida', 'em_revisao'],
      // Pular passos não pode — exige iniciar revisão antes
      ['pendente', 'aprovada'],
      ['pendente', 'rejeitada'],
      ['pendente', 'devolvida'],
      // Auto-transições não fazem sentido
      ['pendente', 'pendente'],
      ['em_revisao', 'em_revisao'],
    ])('rejeita %s → %s', (de, para) => {
      expect(podeTransitar(de, para)).toBe(false);
    });
  });

  it('retorna false quando o estado origem não existe na tabela (defensive)', () => {
    // forçando estado inexistente para verificar fallback do `?? false`
    expect(podeTransitar('inexistente' as EstadoTriagem, 'pendente')).toBe(false);
  });
});

describe('domínio/triagem — estadoEhTerminal', () => {
  it('aprovada e rejeitada são terminais', () => {
    expect(estadoEhTerminal('aprovada')).toBe(true);
    expect(estadoEhTerminal('rejeitada')).toBe(true);
  });

  it('pendente, em_revisao e devolvida NÃO são terminais', () => {
    // Nota: devolvida é "internamente terminal" porque re-envio cria nova
    // linha (ADR-0008 §9.2), mas o helper segue a definição literal da spec
    // — só aprovada/rejeitada são "decisões finais".
    expect(estadoEhTerminal('pendente')).toBe(false);
    expect(estadoEhTerminal('em_revisao')).toBe(false);
    expect(estadoEhTerminal('devolvida')).toBe(false);
  });
});

describe('domínio/triagem — MotivoDecisao (Value Object)', () => {
  describe('limite mínimo de 20 chars (CHECK constraint)', () => {
    it('aceita exatamente 20 caracteres', () => {
      const texto = 'a'.repeat(20);
      const motivo = MotivoDecisao.criar(texto);
      expect(motivo.valor).toBe(texto);
    });

    it('aceita > 20 caracteres', () => {
      const motivo = MotivoDecisao.criar('a'.repeat(50));
      expect(motivo.valor.length).toBe(50);
    });

    it('rejeita 19 caracteres com erro tipado contendo o tamanho recebido', () => {
      const texto = 'a'.repeat(19);
      try {
        MotivoDecisao.criar(texto);
        expect.fail('deveria ter lançado MotivoDecisaoInsuficienteError');
      } catch (e) {
        expect(e).toBeInstanceOf(MotivoDecisaoInsuficienteError);
        expect((e as MotivoDecisaoInsuficienteError).tamanhoRecebido).toBe(19);
      }
    });

    it('rejeita string vazia', () => {
      expect(() => MotivoDecisao.criar('')).toThrow(MotivoDecisaoInsuficienteError);
    });

    it('rejeita null e undefined', () => {
      expect(() => MotivoDecisao.criar(null)).toThrow(MotivoDecisaoInsuficienteError);
      expect(() => MotivoDecisao.criar(undefined)).toThrow(MotivoDecisaoInsuficienteError);
    });
  });

  describe('whitespace e normalização', () => {
    it('aplica trim antes de medir tamanho', () => {
      // 18 caracteres reais + espaços nas pontas → deve ser rejeitado
      const texto = '   ' + 'a'.repeat(18) + '   ';
      expect(() => MotivoDecisao.criar(texto)).toThrow(MotivoDecisaoInsuficienteError);
    });

    it('aceita 20 caracteres com whitespace nas pontas (após trim ainda ≥ 20)', () => {
      const texto = '   ' + 'a'.repeat(20) + '   ';
      const motivo = MotivoDecisao.criar(texto);
      expect(motivo.valor).toBe('a'.repeat(20));
    });

    it('rejeita string composta apenas por whitespace', () => {
      expect(() => MotivoDecisao.criar('                            ')).toThrow(
        MotivoDecisaoInsuficienteError,
      );
    });
  });

  describe('Unicode e edge cases textuais', () => {
    it('aceita 20 caracteres Unicode (acentos contam)', () => {
      // 20 caracteres exatos com acento — segue regra da migration que conta `length`
      const texto = 'çãéíóú12345678901234'; // 20 chars
      const motivo = MotivoDecisao.criar(texto);
      expect(motivo.valor).toBe(texto);
    });

    it('rejeita motivos com 19 caracteres mesmo com diacríticos', () => {
      const texto = 'çãéíóú12345678901'.padEnd(19, 'x'); // 19 chars
      expect(() => MotivoDecisao.criar(texto.slice(0, 19))).toThrow(
        MotivoDecisaoInsuficienteError,
      );
    });

    it('aceita emojis ocupando bytes mas contando como chars individuais', () => {
      // Cada emoji (par surrogate) conta como 2 chars no `length` JS — então
      // 10 emojis = 20 chars. Confirmando comportamento explícito.
      const texto = '🚀'.repeat(10); // length === 20 (5 pares + 5 pares)
      // 🚀 ocupa 2 unidades UTF-16, então .length === 20.
      expect(texto.length).toBe(20);
      const motivo = MotivoDecisao.criar(texto);
      expect(motivo.valor).toBe(texto);
    });
  });

  it('mensagem de erro contém o tamanho recebido pra debug', () => {
    try {
      MotivoDecisao.criar('curto');
    } catch (e) {
      expect((e as Error).message).toContain('5');
      expect((e as Error).name).toBe('MotivoDecisaoInsuficienteError');
    }
  });
});
