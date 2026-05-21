import { describe, it, expect } from 'vitest';
import {
  idadeFotoEmDias,
  precisaAtualizarFotoCapa,
  VALIDADE_FOTO_CAPA_DIAS,
} from '@/domain/posto-foto';

const agora = new Date('2026-05-21T12:00:00Z');
const fotoEm = (iso: string) => ({ tiradaEm: new Date(iso) });

describe('regra da foto de capa (1 ano)', () => {
  it('sugere atualizar quando não há foto', () => {
    expect(precisaAtualizarFotoCapa(null, agora)).toBe(true);
    expect(idadeFotoEmDias(null, agora)).toBeNull();
  });

  it('não sugere quando a foto é recente', () => {
    expect(precisaAtualizarFotoCapa(fotoEm('2026-05-01T12:00:00Z'), agora)).toBe(false);
  });

  it('sugere quando a foto passou de 1 ano', () => {
    expect(precisaAtualizarFotoCapa(fotoEm('2025-01-01T12:00:00Z'), agora)).toBe(true);
  });

  it('limite exato: 365 dias ainda vale, 366 não', () => {
    const limite = new Date(agora.getTime() - VALIDADE_FOTO_CAPA_DIAS * 86400000);
    const passou = new Date(agora.getTime() - (VALIDADE_FOTO_CAPA_DIAS + 1) * 86400000);
    expect(precisaAtualizarFotoCapa({ tiradaEm: limite }, agora)).toBe(false);
    expect(precisaAtualizarFotoCapa({ tiradaEm: passou }, agora)).toBe(true);
  });
});
