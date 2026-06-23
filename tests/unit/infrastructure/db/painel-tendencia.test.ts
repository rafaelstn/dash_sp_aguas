/**
 * Cobre a derivação de tendência do painel (`montarTendencia`) e trava, por
 * smoke de source, as invariantes da query temporal de `serieTendencias`.
 *
 * `montarTendencia` é pura: importá-la é seguro porque o cliente `sql` do
 * adapter é um Proxy preguiçoso (não abre conexão no import). A função decide
 * `valorAnterior` (penúltimo ponto = fechamento do mês anterior) e aplica as
 * guardas que impedem sparkline/delta enganoso (série curta ou toda zero).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { montarTendencia } from '@/infrastructure/db/painel-repository.pg';

describe('montarTendencia', () => {
  it('usa o penúltimo ponto como valorAnterior (fechamento do mês anterior)', () => {
    const t = montarTendencia([2401, 2418, 2440, 2461, 2475, 2483]);
    expect(t).not.toBeUndefined();
    expect(t?.valorAnterior).toBe(2475);
    expect(t?.serie).toEqual([2401, 2418, 2440, 2461, 2475, 2483]);
  });

  it('preserva a ordem da série (mais antigo → mais recente)', () => {
    const t = montarTendencia([1102, 1010, 947, 882, 831, 794]);
    expect(t?.serie[0]).toBe(1102);
    expect(t?.serie[t.serie.length - 1]).toBe(794);
  });

  it('retorna undefined com menos de 2 pontos (nada a comparar)', () => {
    expect(montarTendencia([])).toBeUndefined();
    expect(montarTendencia([42])).toBeUndefined();
  });

  it('retorna undefined quando todos os pontos são zero (sem dado)', () => {
    expect(montarTendencia([0, 0, 0, 0, 0, 0])).toBeUndefined();
  });

  it('mantém tendência quando há ao menos um ponto não-zero', () => {
    const t = montarTendencia([0, 0, 0, 0, 1, 3]);
    expect(t?.valorAnterior).toBe(1);
    expect(t?.serie).toHaveLength(6);
  });
});

describe('serieTendencias, invariantes da query temporal (smoke de source)', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/infrastructure/db/painel-repository.pg.ts'),
    'utf-8',
  );

  it('usa generate_series e filtros por data, não janela hardcoded', () => {
    expect(source).toMatch(/generate_series/i);
    expect(source).toMatch(/created_at\s*<\s*m\.fim/);
    expect(source).toMatch(/indexado_em\s*<\s*m\.fim/);
  });

  it('deriva postosSemArquivos como total menos distintos com arquivo', () => {
    expect(source).toMatch(/Number\(r\.total_postos\)\s*-\s*Number\(r\.com_arquivo\)/);
  });

  it('não computa tendência para KPIs sem base temporal (desconformidades/coordenadas)', () => {
    // O mapa de tendências só expõe as três chaves com base temporal.
    expect(source).not.toMatch(/desconformidadesPostos:\s*montarTendencia/);
    expect(source).not.toMatch(/postosSemCoordenadas:\s*montarTendencia/);
  });
});
