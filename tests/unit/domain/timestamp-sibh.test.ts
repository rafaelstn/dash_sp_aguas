import { describe, expect, it } from 'vitest';
import { normalizarTimestampSibh } from '@/domain/monitor/timestamp-sibh';

/**
 * A normalização é o ponto único que garante que o timestamptz do Postgres
 * receba um valor que ele aceita. O formato CRU do SIBH (Date#toString() do JS)
 * NÃO é aceito pelo timestamptz; por isso convertemos para ISO 8601 UTC antes.
 */
describe('domain/normalizarTimestampSibh', () => {
  it('converte o formato cru do SIBH (Date#toString) para ISO 8601 UTC', () => {
    expect(
      normalizarTimestampSibh('Wed Jul 15 2026 13:40:00 GMT+0000 (Coordinated Universal Time)'),
    ).toBe('2026-07-15T13:40:00.000Z');
  });

  it('converte outro exemplo real (piezo) para ISO', () => {
    expect(
      normalizarTimestampSibh('Mon May 04 2026 11:00:00 GMT+0000 (Coordinated Universal Time)'),
    ).toBe('2026-05-04T11:00:00.000Z');
  });

  it('é idempotente sobre uma string já em ISO', () => {
    expect(normalizarTimestampSibh('2026-07-15T13:40:00.000Z')).toBe(
      '2026-07-15T13:40:00.000Z',
    );
  });

  it('trata vazio, espaços, null e undefined como null', () => {
    expect(normalizarTimestampSibh('')).toBeNull();
    expect(normalizarTimestampSibh('   ')).toBeNull();
    expect(normalizarTimestampSibh(null)).toBeNull();
    expect(normalizarTimestampSibh(undefined)).toBeNull();
  });

  it('valor não parseável vira null (não grava lixo)', () => {
    expect(normalizarTimestampSibh('nao-e-data')).toBeNull();
  });
});
