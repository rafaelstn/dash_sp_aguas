/**
 * Classificação dos postos do mapa: tradução do tipo, regra de filtro (OU dentro
 * da dimensão, E entre dimensões) e contagem cruzada das facetas.
 *
 * Cada recusa tem ao lado um caso que PASSA com o mesmo ponto, para que um
 * filtro que recusasse tudo não ficasse verde.
 */
import { describe, expect, it } from 'vitest';
import {
  atendeFiltros,
  contarFacetas,
  coordenadaSuspeita,
  tipoDaDescricao,
  type PontoMapaPosto,
} from '@/domain/mapa-postos';

function ponto(parcial: Partial<PontoMapaPosto> & { prefixo: string }): PontoMapaPosto {
  return {
    nome: null,
    lat: -23.5,
    lon: -46.6,
    tipo: 'plu',
    situacao: 'em_operacao',
    transmissao: [],
    vazao: [],
    ugrhi: 6,
    municipio: null,
    uf: 'SP',
    coordenadaSuspeita: false,
    ...parcial,
  };
}

describe('tipoDaDescricao', () => {
  it('traduz a descrição do Dbfch com acento e o código curto do demo', () => {
    expect(tipoDaDescricao('PLUVIOMÉTRICO')).toBe('plu');
    expect(tipoDaDescricao('FLUVIOMÉTRICO')).toBe('flu');
    expect(tipoDaDescricao('PIEZOMÉTRICO')).toBe('piezo');
    expect(tipoDaDescricao('METEOROLÓGICO')).toBe('meteo');
    expect(tipoDaDescricao(' plu ')).toBe('plu');
  });

  it('descrição desconhecida ou vazia vira null, sem chutar tipo', () => {
    expect(tipoDaDescricao('SEDIMENTOMÉTRICO')).toBeNull();
    expect(tipoDaDescricao('')).toBeNull();
    expect(tipoDaDescricao(null)).toBeNull();
  });
});

describe('atendeFiltros', () => {
  const telemetricoComMedicao = ponto({
    prefixo: 'A',
    tipo: 'flu',
    transmissao: ['telemetrico', 'gravacao_local'],
    vazao: ['medicao'],
    ugrhi: 2,
  });

  it('sem filtro, passa', () => {
    expect(atendeFiltros(telemetricoComMedicao, {})).toBe(true);
    expect(atendeFiltros(telemetricoComMedicao, { tipo: [], vazao: [] })).toBe(true);
  });

  it('OU dentro da dimensão', () => {
    expect(atendeFiltros(telemetricoComMedicao, { tipo: ['plu', 'flu'] })).toBe(true);
    expect(atendeFiltros(telemetricoComMedicao, { tipo: ['plu'] })).toBe(false);
    expect(atendeFiltros(telemetricoComMedicao, { transmissao: ['convencional', 'telemetrico'] })).toBe(true);
    expect(atendeFiltros(telemetricoComMedicao, { transmissao: ['convencional'] })).toBe(false);
  });

  it('E entre dimensões', () => {
    expect(atendeFiltros(telemetricoComMedicao, { tipo: ['flu'], ugrhi: [2] })).toBe(true);
    expect(atendeFiltros(telemetricoComMedicao, { tipo: ['flu'], ugrhi: [3] })).toBe(false);
  });

  it('vazão qualquer exige ao menos uma fonte', () => {
    expect(atendeFiltros(telemetricoComMedicao, { vazao: ['qualquer'] })).toBe(true);
    expect(atendeFiltros(ponto({ prefixo: 'B' }), { vazao: ['qualquer'] })).toBe(false);
    expect(atendeFiltros(telemetricoComMedicao, { vazao: ['curva'] })).toBe(false);
    expect(atendeFiltros(telemetricoComMedicao, { vazao: ['curva', 'medicao'] })).toBe(true);
  });

  it('tipo ou UGRHI nulos não passam quando o filtro existe, e passam sem ele', () => {
    const semNada = ponto({ prefixo: 'C', tipo: null, ugrhi: null });
    expect(atendeFiltros(semNada, { tipo: ['plu'] })).toBe(false);
    expect(atendeFiltros(semNada, { ugrhi: [6] })).toBe(false);
    expect(atendeFiltros(semNada, {})).toBe(true);
  });

  it('`null` no filtro de UGRHI seleciona os postos sem UGRHI, e só eles', () => {
    const semUgrhi = ponto({ prefixo: 'D', ugrhi: null });
    const comUgrhi = ponto({ prefixo: 'E', ugrhi: 6 });
    expect(atendeFiltros(semUgrhi, { ugrhi: [null] })).toBe(true);
    expect(atendeFiltros(comUgrhi, { ugrhi: [null] })).toBe(false);
    expect(atendeFiltros(comUgrhi, { ugrhi: [null, 6] })).toBe(true);
  });

  it('filtro de UF: sigla exata, e `null` para quem não declara estado', () => {
    const paranaense = ponto({ prefixo: '02650009', uf: 'PR' });
    const semUf = ponto({ prefixo: '02453051', uf: null });
    const paulista = ponto({ prefixo: '1D-008', uf: 'SP' });
    expect(atendeFiltros(paulista, { uf: ['SP'] })).toBe(true);
    expect(atendeFiltros(paranaense, { uf: ['SP'] })).toBe(false);
    expect(atendeFiltros(semUf, { uf: ['SP'] })).toBe(false);
    expect(atendeFiltros(semUf, { uf: [null] })).toBe(true);
    expect(atendeFiltros(paranaense, { uf: ['PR', 'MG'] })).toBe(true);
  });

  it('ignora só a dimensão pedida', () => {
    expect(atendeFiltros(telemetricoComMedicao, { tipo: ['plu'] }, 'tipo')).toBe(true);
    expect(atendeFiltros(telemetricoComMedicao, { tipo: ['plu'] }, 'ugrhi')).toBe(false);
  });
});

describe('contarFacetas', () => {
  const base: PontoMapaPosto[] = [
    ponto({ prefixo: '1', tipo: 'plu', transmissao: ['telemetrico'], ugrhi: 6 }),
    ponto({
      prefixo: '2',
      tipo: 'flu',
      transmissao: ['telemetrico', 'gravacao_local'],
      vazao: ['aparelho_ativo', 'medicao', 'curva'],
      ugrhi: 2,
    }),
    ponto({ prefixo: '3', tipo: 'flu', situacao: 'extinto', vazao: ['medicao'], ugrhi: 2 }),
    ponto({ prefixo: '4', tipo: null, transmissao: ['convencional'], ugrhi: null }),
  ];

  it('sem filtro, conta a base; valor múltiplo conta em cada valor', () => {
    const f = contarFacetas(base, {});
    expect(f.tipo).toEqual({ plu: 1, flu: 2, piezo: 0, meteo: 0 });
    expect(f.situacao).toEqual({ em_operacao: 3, extinto: 1 });
    expect(f.transmissao).toEqual({ telemetrico: 2, gravacao_local: 1, convencional: 1 });
    // `qualquer` conta POSTOS (2), e não a soma das fontes (4).
    expect(f.vazao).toEqual({ aparelho_ativo: 1, medicao: 2, curva: 1, qualquer: 2 });
    expect(f.ugrhi).toEqual([
      { numero: 2, total: 2 },
      { numero: 6, total: 1 },
      { numero: null, total: 1 },
    ]);
  });

  it('a dimensão filtrada conta ignorando o próprio filtro e respeitando os outros', () => {
    const f = contarFacetas(base, { tipo: ['flu'] });
    // O próprio filtro não zera as opções não marcadas.
    expect(f.tipo).toEqual({ plu: 1, flu: 2, piezo: 0, meteo: 0 });
    // As outras dimensões só contam os fluviométricos.
    expect(f.situacao).toEqual({ em_operacao: 1, extinto: 1 });
    expect(f.transmissao).toEqual({ telemetrico: 1, gravacao_local: 1, convencional: 0 });
    expect(f.ugrhi).toEqual([{ numero: 2, total: 2 }]);
  });

  it('faceta de UF: SP primeiro, siglas em ordem, sem UF por último, cruzada', () => {
    const pontos: PontoMapaPosto[] = [
      ponto({ prefixo: 'a', uf: 'PR', tipo: 'plu' }),
      ponto({ prefixo: 'b', uf: null, tipo: 'plu' }),
      ponto({ prefixo: 'c', uf: 'SP', tipo: 'flu' }),
      ponto({ prefixo: 'd', uf: 'MG', tipo: 'plu' }),
      ponto({ prefixo: 'e', uf: 'SP', tipo: 'plu' }),
    ];
    expect(contarFacetas(pontos, {}).uf).toEqual([
      { uf: 'SP', total: 2 },
      { uf: 'MG', total: 1 },
      { uf: 'PR', total: 1 },
      { uf: null, total: 1 },
    ]);
    // Com uf=SP marcado, a faceta de UF continua mostrando as outras siglas,
    // e a de tipo passa a contar só os paulistas.
    const f = contarFacetas(pontos, { uf: ['SP'] });
    expect(f.uf).toContainEqual({ uf: 'PR', total: 1 });
    expect(f.tipo).toEqual({ plu: 1, flu: 1, piezo: 0, meteo: 0 });
  });

  it('UGRHI marcada que os outros filtros zeram continua na lista com zero', () => {
    const f = contarFacetas(base, { ugrhi: [15], tipo: ['piezo'] });
    expect(f.ugrhi).toContainEqual({ numero: 15, total: 0 });
    expect(f.tipo.piezo).toBe(0);
  });
});

describe('coordenadaSuspeita', () => {
  it('graus inteiros nos dois eixos: o caso medido 4G-002 (bruto 250000/470000)', () => {
    expect(coordenadaSuspeita(-25, -47)).toBe(true);
  });

  it('coordenada real não é suspeita, inclusive fora de SP e com um eixo inteiro', () => {
    // 02650009, PAULA FREITAS (PR): bruto 261300/505600.
    expect(coordenadaSuspeita(-26.21667, -50.93333)).toBe(false);
    // 1D-008, CRUZEIRO (SP).
    expect(coordenadaSuspeita(-22.5925, -44.96611)).toBe(false);
    // Só um eixo inteiro (B4-028, IGARAPAVA: bruto 200000/474400).
    expect(coordenadaSuspeita(-20, -47.73333)).toBe(false);
  });

  it('sem coordenada não é suspeita: ausência já tem estado próprio', () => {
    expect(coordenadaSuspeita(null, -47)).toBe(false);
    expect(coordenadaSuspeita(-25, null)).toBe(false);
  });
});
