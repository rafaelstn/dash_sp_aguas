/**
 * Domínio das séries históricas: o catálogo e o tratamento de valor sentinela.
 *
 * O que este arquivo protege NÃO é a existência das constantes: é a decisão que
 * elas carregam. A sentinela virar zero na soma é o defeito mais caro possível
 * nesta tela, porque zero PARECE resposta: um mês com dez dias sem leitura
 * viraria 9.999 mm de chuva, e ninguém que olhe o gráfico tem como desconfiar.
 *
 * Por isso os casos abaixo afirmam o comportamento nas duas pontas: a sentinela
 * some do valor E o vizinho dela continua sendo leitura. Um teste que só
 * conferisse "999.9 vira nulo" passaria com uma régua que zerasse a série toda.
 */
import { describe, expect, it } from 'vitest';
import {
  SERIES_MEDICAO,
  TODAS_AS_SERIES,
  VAZAO_SEM_LEITURA,
  eSerieMedicao,
  valorUtil,
  vazaoUtil,
} from '@/domain/monitor/serie-medicao';

describe('catálogo das séries', () => {
  it('descreve exatamente as cinco séries do banco do órgão', () => {
    expect(TODAS_AS_SERIES).toHaveLength(5);
    expect(Object.keys(SERIES_MEDICAO).sort()).toEqual([...TODAS_AS_SERIES].sort());
  });

  it('cada entrada se descreve com a própria chave', () => {
    // Chave e campo `serie` divergentes fariam o adaptador consultar uma tabela
    // e rotular outra, sem erro em lugar nenhum.
    for (const serie of TODAS_AS_SERIES) {
      expect(SERIES_MEDICAO[serie].serie).toBe(serie);
    }
  });

  it('chuva soma o dia e nível tira média, sem exceção', () => {
    // A regra não é estilo: somar duas cotas do mesmo dia produz um número sem
    // significado físico, e mediar chuva esconde o total que caiu.
    for (const serie of TODAS_AS_SERIES) {
      const def = SERIES_MEDICAO[serie];
      expect(def.criterioDiario).toBe(def.grandeza === 'chuva' ? 'soma' : 'media');
    }
  });

  it('só a unidade de chuva é afirmada; a de nível é declarada como inferida', () => {
    // Se alguém marcar a cota como unidade confirmada sem o órgão ter
    // confirmado, este caso reprova, e é o objetivo: a tela usa essa marca para
    // dizer a quem lê que o eixo é inferência.
    for (const serie of TODAS_AS_SERIES) {
      const def = SERIES_MEDICAO[serie];
      expect(def.unidadeInferida).toBe(def.grandeza !== 'chuva');
    }
  });

  it('reconhece as cinco séries e recusa qualquer outra coisa', () => {
    for (const serie of TODAS_AS_SERIES) expect(eSerieMedicao(serie)).toBe(true);
    expect(eSerieMedicao('chuva')).toBe(false);
    expect(eSerieMedicao('')).toBe(false);
    expect(eSerieMedicao('constructor')).toBe(false);
    expect(eSerieMedicao('__proto__')).toBe(false);
  });
});

describe('valor sentinela: some do valor, e não leva a série junto', () => {
  it('999,9 mm de chuva não é chuva', () => {
    expect(valorUtil('chuva_manual', 999.9)).toBeNull();
    expect(valorUtil('chuva_logger', 999.9)).toBeNull();
  });

  it('9999 de cota não é cota', () => {
    expect(valorUtil('cota_rio', 9999)).toBeNull();
  });

  it('o vizinho da sentinela CONTINUA sendo leitura', () => {
    // MEDIDO na base: `999` aparece 3 vezes na chuva e `9998` aparece 6 vezes na
    // cota. São leituras, e uma régua frouxa (por exemplo `>= 999`) as comeria
    // junto. Sem este caso, aquela régua passaria verde.
    expect(valorUtil('chuva_manual', 999)).toBe(999);
    expect(valorUtil('cota_rio', 9998)).toBe(9998);
    expect(valorUtil('cota_rio', 9639)).toBe(9639);
  });

  it('zero é medida, e não ausência', () => {
    // A mediana da chuva manual é ZERO (MEDIDO): a maioria dos dias não chove.
    // Tratar zero como ausente apagaria a maior parte da série.
    expect(valorUtil('chuva_manual', 0)).toBe(0);
    expect(valorUtil('cota_rio', 0)).toBe(0);
  });

  it('tolera o erro de representação do ponto flutuante', () => {
    // O driver entrega `decimal` como número binário, e `999.9` chega com
    // resíduo em alguns caminhos. Igualdade exata falharia justamente na
    // sentinela mais comum da chuva.
    expect(valorUtil('chuva_manual', 999.9000000000001)).toBeNull();
    expect(valorUtil('chuva_manual', 999.8999999999999)).toBeNull();
  });

  it('as séries de piezômetro não têm sentinela, e nada é descartado nelas', () => {
    // MEDIDO: no topo da faixa do piezômetro manual os valores mais frequentes
    // aparecem de 3 a 6 vezes, sem salto. Inventar sentinela ali apagaria
    // leitura real.
    expect(SERIES_MEDICAO.piezo_manual.valorSentinela).toBeNull();
    expect(SERIES_MEDICAO.piezo_eletronico.valorSentinela).toBeNull();
    expect(valorUtil('piezo_manual', 9999)).toBe(9999);
    expect(valorUtil('piezo_eletronico', 999.9)).toBe(999.9);
  });

  it('valor ausente ou não finito vira nulo, e não NaN na soma', () => {
    expect(valorUtil('chuva_manual', null)).toBeNull();
    expect(valorUtil('chuva_manual', Number.NaN)).toBeNull();
    expect(valorUtil('chuva_manual', Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('sentinela da vazão', () => {
  it('99999,999 m³/s não é vazão de rio nenhum', () => {
    expect(vazaoUtil(VAZAO_SEM_LEITURA)).toBeNull();
    expect(vazaoUtil(99999.999)).toBeNull();
  });

  it('vazão de verdade passa, inclusive no extremo baixo da faixa medida', () => {
    expect(vazaoUtil(0.001)).toBe(0.001);
    expect(vazaoUtil(1234.5)).toBe(1234.5);
    // Um dígito abaixo da sentinela continua sendo leitura.
    expect(vazaoUtil(99999.998)).toBe(99999.998);
  });

  it('vazão ausente é nula, e não zero', () => {
    // MEDIDO: 99.203 linhas de cota têm `VazaoMainframe` nula e ZERO têm valor
    // `0`. Converter nulo em zero inventaria rio parado onde não há medida.
    expect(vazaoUtil(null)).toBeNull();
  });
});
