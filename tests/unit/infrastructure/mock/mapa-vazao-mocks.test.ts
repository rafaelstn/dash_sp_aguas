/**
 * Adaptadores de demonstração do mapa e da vazão por posto. Garantem que o
 * MODO DEMO exercita os estados que a tela precisa tratar: posto inexistente,
 * posto sem dado, página parcial, campo opcional vazio e curva sem equação.
 */
import { describe, expect, it } from 'vitest';
import { mapaPostosRepositoryMock } from '@/infrastructure/mock/mapa-postos-repository.mock';
import { vazaoPostoRepositoryMock } from '@/infrastructure/mock/vazao-posto-repository.mock';
import { POSTOS_FIXTURES } from '@/infrastructure/mock/fixtures';

describe('mapaPostosRepositoryMock', () => {
  it('devolve todas as fixtures ordenadas por prefixo', async () => {
    const pontos = await mapaPostosRepositoryMock.listarPontos({});
    expect(pontos).toHaveLength(POSTOS_FIXTURES.length);
    const prefixos = pontos.map((p) => p.prefixo);
    expect(prefixos).toEqual([...prefixos].sort((a, b) => a.localeCompare(b)));
  });

  it('classifica o 2D-013 com as três transmissões e o 2D-006 com medição e curva', async () => {
    const pontos = await mapaPostosRepositoryMock.listarPontos({});
    const p13 = pontos.find((p) => p.prefixo === '2D-013');
    const p06 = pontos.find((p) => p.prefixo === '2D-006');
    expect(p13?.transmissao).toEqual(['telemetrico', 'gravacao_local', 'convencional']);
    expect(p13?.tipo).toBe('flu');
    expect(p06?.vazao).toEqual(expect.arrayContaining(['medicao', 'curva']));
    expect(p06?.situacao).toBe('extinto');
  });

  it('filtra por início de prefixo e por município, e favoritos é vazio no demo', async () => {
    const porPrefixo = await mapaPostosRepositoryMock.listarPontos({ prefixoComecaCom: 'a7' });
    expect(porPrefixo.map((p) => p.prefixo)).toEqual(['A7-001', 'A7-002']);
    const municipio = POSTOS_FIXTURES.find((p) => p.municipio !== null)!.municipio!;
    const porMunicipio = await mapaPostosRepositoryMock.listarPontos({
      municipio: municipio.toLowerCase(),
    });
    expect(porMunicipio.length).toBeGreaterThan(0);
    expect(await mapaPostosRepositoryMock.listarPontos({ apenasFavoritos: true })).toEqual([]);
  });
});

describe('vazaoPostoRepositoryMock', () => {
  it('prefixo inexistente é null nas duas leituras', async () => {
    expect(
      await vazaoPostoRepositoryMock.listarMedicoes('ZZ-999', { pagina: 1, porPagina: 10 }),
    ).toBeNull();
    expect(await vazaoPostoRepositoryMock.listarCurvasChave('ZZ-999')).toBeNull();
  });

  it('posto existente sem dado devolve vazio, e não null', async () => {
    expect(
      await vazaoPostoRepositoryMock.listarMedicoes('A6-001', { pagina: 1, porPagina: 10 }),
    ).toEqual({ total: 0, itens: [] });
    expect(await vazaoPostoRepositoryMock.listarCurvasChave('A6-001')).toEqual([]);
  });

  it('pagina as medições da mais recente para a mais antiga', async () => {
    const p1 = await vazaoPostoRepositoryMock.listarMedicoes('2d-006', { pagina: 1, porPagina: 20 });
    const p2 = await vazaoPostoRepositoryMock.listarMedicoes('2D-006', { pagina: 2, porPagina: 20 });
    expect(p1?.total).toBe(30);
    expect(p1?.itens).toHaveLength(20);
    expect(p2?.itens).toHaveLength(10);
    const datas = [...p1!.itens, ...p2!.itens].map((m) => m.dataInicial);
    expect(datas).toEqual([...datas].sort().reverse());
    expect(p1!.itens.some((m) => m.areaSeccao === null)).toBe(true);
  });

  it('curvas incluem uma sem equação', async () => {
    const curvas = await vazaoPostoRepositoryMock.listarCurvasChave('2D-006');
    expect(curvas?.length).toBe(2);
    expect(curvas?.some((c) => c.trechos.length === 0)).toBe(true);
    expect(curvas?.some((c) => c.trechos.length > 0)).toBe(true);
  });
});
