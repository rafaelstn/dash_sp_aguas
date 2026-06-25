import { describe, it, expect } from 'vitest';
import schema from '../../../data/colunas-ana.json';

/**
 * BASE-3 — Paridade TS ↔ Python do export ANA.
 *
 * `data/colunas-ana.json` é a fonte de verdade compartilhada entre o export TS
 * (`src/application/use-cases/inventario-ana/exportar.ts`, monta o XLSX com
 * exceljs) e o patcher Python (`scripts/manutencao/aplicar_resposta_na_planilha_
 * sharepoint.py`, edita a planilha com openpyxl, carregando o MESMO JSON via
 * json.loads). Ambos dependem de `colExcel`, `chave`/`aliasPy`, `tipo`, `label`,
 * `fonteFallback` e `diff`.
 *
 * Este teste trava os invariantes do contrato: se alguém editar o JSON e quebrar
 * o schema (índice duplicado, tipo inválido, alias faltando), o teste falha —
 * exatamente quando `colunas-ana.json` muda. Blinda a duplicação conhecida sem
 * unificar as duas linguagens (evita overengineering).
 */

interface ColunaAna {
  colExcel: number;
  chave: string;
  label: string;
  tipo: string;
  aliasPy: string;
  fonteFallback: string[];
  diff: boolean;
}

const colunas = schema.colunas as ColunaAna[];
const TIPOS_VALIDOS = new Set(['texto', 'numero', 'data']);
const FONTES_VALIDAS = new Set(['posto', 'resposta', 'ana']);

describe('paridade colunas-ana.json (TS ↔ Python)', () => {
  it('cor de diff e colunas de controle presentes', () => {
    expect(schema.corDiffArgb).toMatch(/^[0-9A-F]{8}$/);
    expect(schema.colunasControle.status.label).toBe('STATUS_REVISAO_SPAGUAS');
    expect(schema.colunasControle.justificativa.label).toBe('JUSTIFICATIVA_SPAGUAS');
  });

  it('cada coluna tem o shape completo que ambos os lados consomem', () => {
    for (const c of colunas) {
      expect(Number.isInteger(c.colExcel) && c.colExcel > 0, `colExcel de ${c.chave}`).toBe(true);
      expect(typeof c.chave).toBe('string');
      expect(c.chave.length, `chave vazia em col ${c.colExcel}`).toBeGreaterThan(0);
      expect(typeof c.label).toBe('string');
      expect(TIPOS_VALIDOS.has(c.tipo), `tipo inválido "${c.tipo}" em ${c.chave}`).toBe(true);
      expect(typeof c.aliasPy).toBe('string');
      expect(c.aliasPy.length, `aliasPy vazio em ${c.chave}`).toBeGreaterThan(0);
      expect(Array.isArray(c.fonteFallback) && c.fonteFallback.length > 0, `fonteFallback de ${c.chave}`).toBe(true);
      for (const f of c.fonteFallback) {
        expect(FONTES_VALIDAS.has(f), `fonte inválida "${f}" em ${c.chave}`).toBe(true);
      }
      expect(typeof c.diff).toBe('boolean');
    }
  });

  it('colExcel, chave e aliasPy são únicos (sem colisão entre os dois lados)', () => {
    const colExcel = colunas.map((c) => c.colExcel);
    const chaves = colunas.map((c) => c.chave);
    const alias = colunas.map((c) => c.aliasPy);
    expect(new Set(colExcel).size, 'colExcel duplicado').toBe(colExcel.length);
    expect(new Set(chaves).size, 'chave duplicada').toBe(chaves.length);
    expect(new Set(alias).size, 'aliasPy duplicado').toBe(alias.length);
  });

  it('a precedência de fallback respeita posto > resposta > ana', () => {
    // Quando há mais de uma fonte, "posto" é sempre a primeira e "ana" a última.
    for (const c of colunas) {
      if (c.fonteFallback.length > 1) {
        expect(c.fonteFallback[0], `1ª fonte de ${c.chave}`).toBe('posto');
        expect(c.fonteFallback[c.fonteFallback.length - 1], `última fonte de ${c.chave}`).toBe('ana');
      }
    }
  });
});
