/**
 * Comparativo entre a série do órgão e a do SIBH: os quatro estados.
 *
 * Este arquivo existe por causa de um defeito específico que o projeto já
 * corrigiu uma vez em outra tela: quatro situações diferentes chegando à
 * interface como o mesmo vazio. Aqui as quatro pedem ação diferente de quem
 * opera, e confundi-las faria a tela dizer "não há dado" quando o certo é
 * "não há como comparar", "tente outro período" ou "o SIBH não respondeu".
 *
 * Por isso cada caso afirma o ESTADO, e não só que a lista voltou vazia. Um
 * teste que conferisse `pares.length === 0` passaria com os quatro colapsados
 * num só, que é exatamente o defeito.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  DiaDaSerie,
  SeriesMedicaoRepository,
} from '@/application/ports/series-medicao-repository';
import type {
  EstacaoSibh,
  MedicaoSibh,
  PontoNivelSibh,
  SibhGateway,
} from '@/application/ports/sibh-gateway';
import {
  acharEstacaoCorrespondente,
  compararSerieComSibh,
  cruzarPorDia,
} from '@/application/use-cases/monitor/comparar-serie-com-sibh';

const JANELA = {
  desde: new Date(Date.UTC(2025, 2, 1)),
  ate: new Date(Date.UTC(2025, 2, 31)),
};

function estacao(prefixo: string, tipo: EstacaoSibh['tipo'] = 'pluviometrico'): EstacaoSibh {
  return {
    prefixo,
    nome: `Estação ${prefixo}`,
    id: `id-${prefixo}`,
    tipo,
    lat: -22.5,
    lng: -47.4,
    bacia: 'UGRHI 5',
    owner: 'SP ÁGUAS',
    transmissionStatus: 'ok',
    ultimaTransmissao: null,
  };
}

function dia(d: string, valor: number | null, leituras = 1): DiaDaSerie {
  return {
    dia: d,
    valor,
    leituras,
    leiturasSemValor: valor === null ? leituras : 0,
    minimo: valor,
    maximo: valor,
  };
}

function repositorio(dias: DiaDaSerie[]): SeriesMedicaoRepository {
  return {
    resumoPorPosto: vi.fn(async () => null),
    listarLeituras: vi.fn(async () => ({ total: 0, itens: [] })),
    agregarPorDia: vi.fn(async () => dias),
  };
}

function gateway(parcial: Partial<SibhGateway>): SibhGateway {
  return {
    listarEstacoes: vi.fn(async () => []),
    medicoesPorPrefixo: vi.fn(async () => []),
    serieNivelPorPrefixo: vi.fn(async () => []),
    valorAtualPorPrefixo: vi.fn(async () => null),
    ...parcial,
  };
}

function chuvaSibh(prefixo: string, dia: string, mm: number): MedicaoSibh {
  // 12:00 cai dentro do dia hidrológico do próprio dia (a janela abre às 07:00),
  // então o rótulo do dia é o mesmo dos dois lados.
  return {
    prefixo,
    nome: prefixo,
    valorMm: mm,
    momento: `${dia.replace(/-/g, '/')} 12:00`,
    gapMinutos: 60,
  };
}

function nivelSibh(dia: string, metros: number): PontoNivelSibh {
  return { momento: `${dia.replace(/-/g, '/')} 09:00`, nivelM: metros };
}

describe('casamento de estação', () => {
  it('casa pelo código ANA, e não pelo prefixo do órgão', () => {
    // MEDIDO em 03/09/2026: das 2.701 estações do SIBH, ZERO casam por
    // `Postos.Prefixo` e 46 casam por `PrefixoDNAEE`. Aceitar o prefixo do
    // órgão como chave criaria par falso na primeira coincidência.
    const estacoes = [estacao('02147031'), estacao('C4-019')];
    const achado = acharEstacaoCorrespondente(
      { prefixo: 'C4-019', prefixoAna: '02147031' },
      estacoes,
    );
    expect(achado?.prefixo).toBe('02147031');
  });

  it('não casa quando o posto não tem código ANA', () => {
    expect(
      acharEstacaoCorrespondente({ prefixo: 'C4-019', prefixoAna: null }, [estacao('C4-019')]),
    ).toBeNull();
    expect(
      acharEstacaoCorrespondente({ prefixo: 'C4-019', prefixoAna: '   ' }, [estacao('C4-019')]),
    ).toBeNull();
  });

  it('ignora espaço nas pontas e caixa', () => {
    const achado = acharEstacaoCorrespondente(
      { prefixo: 'X', prefixoAna: ' 353180302a ' },
      [estacao('353180302A')],
    );
    expect(achado).not.toBeNull();
  });
});

describe('cruzamento por dia', () => {
  it('só o dia presente nos DOIS lados vira par', () => {
    const { pares, soNoOrgao, soNoSibh } = cruzarPorDia(
      'chuva_manual',
      [dia('2025-03-01', 10), dia('2025-03-02', 20)],
      new Map([
        ['2025-03-02', 18],
        ['2025-03-03', 5],
      ]),
    );
    expect(pares).toEqual([{ dia: '2025-03-02', orgao: 20, sibh: 18, diferenca: 2 }]);
    expect(soNoOrgao).toBe(1);
    expect(soNoSibh).toBe(1);
  });

  it('dia SEM medida no órgão não vira par com zero', () => {
    // O dia existe na origem e todas as leituras dele eram sentinela. Emparelhá-lo
    // com zero produziria uma divergência inteira que é só ausência de medida, e
    // ela apareceria na tela como erro do órgão.
    const { pares, soNoOrgao } = cruzarPorDia(
      'chuva_manual',
      [dia('2025-03-01', null)],
      new Map([['2025-03-01', 12]]),
    );
    expect(pares).toHaveLength(0);
    expect(soNoOrgao).toBe(1);
  });

  it('converte centímetro em metro no lado do órgão, e só para nível', () => {
    // O SIBH entrega nível em metros; o órgão grava inteiro que a distribuição
    // medida lê como centímetros. Sem a conversão, a diferença de um rio a 4,23 m
    // apareceria como 418 metros.
    const { pares } = cruzarPorDia(
      'cota_rio',
      [dia('2025-03-01', 423)],
      new Map([['2025-03-01', 4.2]]),
    );
    expect(pares[0]).toEqual({ dia: '2025-03-01', orgao: 4.23, sibh: 4.2, diferenca: 0.03 });
  });

  it('NÃO converte chuva, que já está em milímetros nos dois lados', () => {
    const { pares } = cruzarPorDia(
      'chuva_manual',
      [dia('2025-03-01', 42.3)],
      new Map([['2025-03-01', 42.3]]),
    );
    expect(pares[0]?.orgao).toBe(42.3);
    expect(pares[0]?.diferenca).toBe(0);
  });
});

describe('os quatro estados', () => {
  it('posto sem código ANA responde sem_correspondencia, e diz o motivo', async () => {
    const r = await compararSerieComSibh(
      repositorio([dia('2025-03-01', 10)]),
      gateway({}),
      { prefixo: 'C4-019', prefixoAna: null },
      'chuva_manual',
      JANELA,
    );
    expect(r.estado).toBe('sem_correspondencia');
    expect(r).toMatchObject({ motivo: 'posto_sem_codigo_ana' });
  });

  it('código ANA que o SIBH não conhece é outro motivo, e a distinção importa', async () => {
    // "Este posto não tem código" é problema de cadastro; "tem código e o SIBH
    // não conhece" é problema de vocabulário entre os dois sistemas. São
    // conversas diferentes com o órgão, e colapsá-las apaga a diferença.
    const r = await compararSerieComSibh(
      repositorio([dia('2025-03-01', 10)]),
      gateway({ listarEstacoes: vi.fn(async () => [estacao('99999999')]) }),
      { prefixo: 'C4-019', prefixoAna: '02147031' },
      'chuva_manual',
      JANELA,
    );
    expect(r).toMatchObject({
      estado: 'sem_correspondencia',
      motivo: 'codigo_ana_nao_esta_no_sibh',
    });
  });

  it('correspondência existe e o órgão não tem dado no período', async () => {
    const r = await compararSerieComSibh(
      repositorio([]),
      gateway({
        listarEstacoes: vi.fn(async () => [estacao('02147031')]),
        medicoesPorPrefixo: vi.fn(async () => [chuvaSibh('02147031', '2025-03-02', 18)]),
      }),
      { prefixo: 'C4-019', prefixoAna: '02147031' },
      'chuva_manual',
      JANELA,
    );
    expect(r).toMatchObject({ estado: 'sem_dado_no_periodo', diasNoOrgao: 0, diasNoSibh: 1 });
  });

  it('correspondência existe e o SIBH não tem dado no período', async () => {
    const r = await compararSerieComSibh(
      repositorio([dia('2025-03-01', 10)]),
      gateway({ listarEstacoes: vi.fn(async () => [estacao('02147031')]) }),
      { prefixo: 'C4-019', prefixoAna: '02147031' },
      'chuva_manual',
      JANELA,
    );
    expect(r).toMatchObject({ estado: 'sem_dado_no_periodo', diasNoOrgao: 1, diasNoSibh: 0 });
  });

  it('os dois lados têm dado e NENHUM dia coincide: continua sem_dado_no_periodo', async () => {
    // É o retrato do que a medição encontrou: o órgão parou em agosto de 2025 e
    // o SIBH entrega dado desta semana. Devolver `dado_dos_dois_lados` com lista
    // vazia seria dizer "comparei" sem ter comparado nada.
    const r = await compararSerieComSibh(
      repositorio([dia('2025-03-01', 10)]),
      gateway({
        listarEstacoes: vi.fn(async () => [estacao('02147031')]),
        medicoesPorPrefixo: vi.fn(async () => [chuvaSibh('02147031', '2025-03-20', 18)]),
      }),
      { prefixo: 'C4-019', prefixoAna: '02147031' },
      'chuva_manual',
      JANELA,
    );
    expect(r.estado).toBe('sem_dado_no_periodo');
  });

  it('dado dos dois lados devolve os pares, a unidade e a maior diferença', async () => {
    const r = await compararSerieComSibh(
      repositorio([dia('2025-03-01', 10), dia('2025-03-02', 20)]),
      gateway({
        listarEstacoes: vi.fn(async () => [estacao('02147031')]),
        medicoesPorPrefixo: vi.fn(async () => [
          chuvaSibh('02147031', '2025-03-01', 9),
          chuvaSibh('02147031', '2025-03-02', 25),
        ]),
      }),
      { prefixo: 'C4-019', prefixoAna: '02147031' },
      'chuva_manual',
      JANELA,
    );
    expect(r).toMatchObject({
      estado: 'dado_dos_dois_lados',
      unidade: 'mm',
      unidadeInferida: false,
      maiorDiferenca: 5,
    });
    expect(r.estado === 'dado_dos_dois_lados' && r.pares).toHaveLength(2);
  });

  it('nível compara em metros e avisa que a unidade do órgão é inferida', async () => {
    const r = await compararSerieComSibh(
      repositorio([dia('2025-03-01', 423)]),
      gateway({
        listarEstacoes: vi.fn(async () => [estacao('02147031', 'fluviometrico')]),
        serieNivelPorPrefixo: vi.fn(async () => [nivelSibh('2025-03-01', 4.2)]),
      }),
      { prefixo: 'C4-019', prefixoAna: '02147031' },
      'cota_rio',
      JANELA,
    );
    expect(r).toMatchObject({
      estado: 'dado_dos_dois_lados',
      unidade: 'm',
      unidadeInferida: true,
    });
    expect(r.estado === 'dado_dos_dois_lados' && r.pares[0]?.orgao).toBe(4.23);
  });

  it('SIBH fora do ar é estado próprio, e NÃO vira "sem correspondência"', async () => {
    // Sem este estado, uma queda momentânea do SIBH viraria uma conclusão
    // permanente e errada sobre o cadastro do posto.
    const avisado = vi.fn();
    const r = await compararSerieComSibh(
      repositorio([dia('2025-03-01', 10)]),
      gateway({
        listarEstacoes: vi.fn(async () => {
          throw new Error('timeout');
        }),
      }),
      { prefixo: 'C4-019', prefixoAna: '02147031' },
      'chuva_manual',
      JANELA,
      avisado,
    );
    expect(r).toMatchObject({ estado: 'origem_indisponivel', lado: 'sibh' });
    expect(avisado).toHaveBeenCalledOnce();
  });

  it('SIBH que cai só na busca da série também é origem_indisponivel', async () => {
    const r = await compararSerieComSibh(
      repositorio([dia('2025-03-01', 10)]),
      gateway({
        listarEstacoes: vi.fn(async () => [estacao('02147031')]),
        medicoesPorPrefixo: vi.fn(async () => {
          throw new Error('502');
        }),
      }),
      { prefixo: 'C4-019', prefixoAna: '02147031' },
      'chuva_manual',
      JANELA,
    );
    expect(r).toMatchObject({ estado: 'origem_indisponivel' });
  });

  it('falha do lado do ÓRGÃO propaga, e não vira "sem dado"', async () => {
    // Engolir o erro daqui devolveria "este posto não tem série" para um posto
    // que tem quarenta mil leituras. É a mentira mais cara desta tela.
    const quebrado: SeriesMedicaoRepository = {
      resumoPorPosto: vi.fn(async () => null),
      listarLeituras: vi.fn(async () => ({ total: 0, itens: [] })),
      agregarPorDia: vi.fn(async () => {
        throw new Error('VPN caiu');
      }),
    };
    await expect(
      compararSerieComSibh(
        quebrado,
        gateway({ listarEstacoes: vi.fn(async () => [estacao('02147031')]) }),
        { prefixo: 'C4-019', prefixoAna: '02147031' },
        'chuva_manual',
        JANELA,
      ),
    ).rejects.toThrow('VPN caiu');
  });
});
