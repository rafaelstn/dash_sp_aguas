import { describe, expect, it } from 'vitest';
import { TIPOS_EVENTO_TRIAGEM, type TipoEventoTriagem } from '@/domain/triagem-evento';

/**
 * Testes contractuais do tipo `TipoEventoTriagem`.
 * Espelha o CHECK da migration 0025 — qualquer divergência aqui indica que
 * o domínio TS desviou do banco.
 */

describe('domínio/triagem-evento — TIPOS_EVENTO_TRIAGEM', () => {
  it('contém exatamente os 8 tipos canônicos da migration 0025', () => {
    const esperado: TipoEventoTriagem[] = [
      'submetida',
      'reenvio_apos_devolucao',
      'revisao_iniciada',
      'revisao_liberada',
      'lock_expirado',
      'aprovada',
      'rejeitada',
      'devolvida',
    ];
    expect(TIPOS_EVENTO_TRIAGEM).toEqual(esperado);
  });

  it('é congelado em runtime (não permite push acidental)', () => {
    expect(Object.isFrozen(TIPOS_EVENTO_TRIAGEM)).toBe(true);
  });

  it('não inclui tipos antigos do esquema original (regressão semântica)', () => {
    // O ADR §2.2 listava `re_enviada` (sem underscore) e `enviada` —
    // implementação corrigiu para `reenvio_apos_devolucao` e `submetida`.
    expect(TIPOS_EVENTO_TRIAGEM as readonly string[]).not.toContain('re_enviada');
    expect(TIPOS_EVENTO_TRIAGEM as readonly string[]).not.toContain('enviada');
  });
});
