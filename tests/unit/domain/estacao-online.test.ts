import { describe, expect, it } from 'vitest';
import { estacaoOnline } from '@/domain/monitor/estacao-online';

/**
 * Testes da regra "online" (Monitor). Definição portada do painel oficial:
 *   - piezométrica: online se tem última transmissão (status não conta);
 *   - pluvio/fluvio: online se status = 'ok' E tem última transmissão.
 */
describe('domain/estacaoOnline', () => {
  const ISO = '2026-07-15T13:40:00.000Z';

  describe('piezométrica (só depende de ultimaTransmissao)', () => {
    it('online quando tem última transmissão, mesmo com status pendente', () => {
      expect(
        estacaoOnline({
          tipoEstacao: 'piezometrico',
          transmissionStatus: 'pendente',
          ultimaTransmissao: ISO,
        }),
      ).toBe(true);
    });

    it('online mesmo com status null, desde que haja última transmissão', () => {
      expect(
        estacaoOnline({
          tipoEstacao: 'piezometrico',
          transmissionStatus: null,
          ultimaTransmissao: ISO,
        }),
      ).toBe(true);
    });

    it('offline quando não tem última transmissão', () => {
      expect(
        estacaoOnline({
          tipoEstacao: 'piezometrico',
          transmissionStatus: 'ok',
          ultimaTransmissao: null,
        }),
      ).toBe(false);
    });
  });

  describe('pluviométrica e fluviométrica (status ok E última transmissão)', () => {
    for (const tipo of ['pluviometrico', 'fluviometrico'] as const) {
      it(`${tipo}: online com status ok E última transmissão`, () => {
        expect(
          estacaoOnline({ tipoEstacao: tipo, transmissionStatus: 'ok', ultimaTransmissao: ISO }),
        ).toBe(true);
      });

      it(`${tipo}: offline com status pendente ainda que tenha transmissão`, () => {
        expect(
          estacaoOnline({
            tipoEstacao: tipo,
            transmissionStatus: 'pendente',
            ultimaTransmissao: ISO,
          }),
        ).toBe(false);
      });

      it(`${tipo}: offline com status ok mas sem transmissão`, () => {
        expect(
          estacaoOnline({ tipoEstacao: tipo, transmissionStatus: 'ok', ultimaTransmissao: null }),
        ).toBe(false);
      });

      it(`${tipo}: offline com status null`, () => {
        expect(
          estacaoOnline({ tipoEstacao: tipo, transmissionStatus: null, ultimaTransmissao: ISO }),
        ).toBe(false);
      });
    }
  });

  describe('presença de ultimaTransmissao (Date, string, vazio)', () => {
    it('aceita Date válido como transmissão presente', () => {
      expect(
        estacaoOnline({
          tipoEstacao: 'piezometrico',
          transmissionStatus: null,
          ultimaTransmissao: new Date('2026-07-15T00:00:00Z'),
        }),
      ).toBe(true);
    });

    it('string vazia conta como sem transmissão (offline)', () => {
      expect(
        estacaoOnline({
          tipoEstacao: 'piezometrico',
          transmissionStatus: null,
          ultimaTransmissao: '   ',
        }),
      ).toBe(false);
    });

    it('Date inválido conta como sem transmissão', () => {
      expect(
        estacaoOnline({
          tipoEstacao: 'piezometrico',
          transmissionStatus: null,
          ultimaTransmissao: new Date('data-invalida'),
        }),
      ).toBe(false);
    });
  });
});
