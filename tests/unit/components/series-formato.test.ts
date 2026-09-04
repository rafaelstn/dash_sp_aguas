import { describe, expect, it } from 'vitest';
import type { ResumoSerie } from '@/application/ports/series-medicao-repository';
import { MAX_DIAS_JANELA } from '@/app/api/_helpers/janela-serie';
import {
  MAX_DIAS_JANELA_TELA,
  diasNaJanela,
  extensaoDaSerie,
  fmtDia,
  fmtDiaLongo,
  fmtMomento,
  fmtValor,
  algumaLeituraTemHora,
  janelaPadrao,
  percentual,
  somarDias,
} from '@/components/features/postos/series/formato';

/**
 * Regras de tela das séries históricas que não dependem de renderizar nada.
 *
 * Cada bloco aqui existe por um defeito CONCRETO que a função previne, e não
 * pela função existir. O que não pode quebrar em silêncio está descrito no
 * próprio caso.
 */

function resumo(parcial: Partial<ResumoSerie> = {}): ResumoSerie {
  return {
    serie: 'cota_rio',
    rotulo: 'Cota do rio (régua)',
    unidade: 'cm',
    unidadeInferida: true,
    criterioDiario: 'media',
    leituras: 22_584,
    primeiraData: '1971-01-01',
    ultimaData: '2001-11-30',
    leiturasComDataFutura: 0,
    leiturasSemValor: 32,
    ...parcial,
  };
}

describe('teto de janela espelhado na tela', () => {
  /**
   * A tela precisa DESABILITAR o atalho de série inteira quando ele estouraria
   * o teto, em vez de deixar a pessoa pedir e tomar 400. Isso obriga a uma
   * segunda cópia do número, e duas cópias de um limite são uma divergência
   * agendada: o dia em que alguém subir o teto da API e não o da tela, o atalho
   * some sem motivo; se baixar só o da API, o atalho volta a devolver erro.
   */
  it('vale exatamente o mesmo número que a API cobra', () => {
    expect(MAX_DIAS_JANELA_TELA).toBe(MAX_DIAS_JANELA);
  });
});

describe('janela padrão', () => {
  /**
   * O defeito que esta regra existe para impedir: MEDIDO em 03/09/2026, a
   * chuva do posto `E3-036` termina em 2004 e a cota do `1D-008` em 2001. Uma
   * janela padrão contada a partir de HOJE devolveria vazio nos dois, e a tela
   * anunciaria "sem dado" para postos com dezenas de milhares de leituras.
   */
  it('termina no último dia da série, e não em hoje', () => {
    const janela = janelaPadrao(resumo());
    expect(janela).not.toBeNull();
    expect(janela?.ate).toBe('2001-11-30');
    expect(janela?.desde).toBe('2001-09-02');
    expect(diasNaJanela(janela!.desde, janela!.ate)).toBe(90);
  });

  it('não recua para antes do começo da série', () => {
    const curta = resumo({ primeiraData: '2001-11-20', ultimaData: '2001-11-30' });
    const janela = janelaPadrao(curta);
    expect(janela?.desde).toBe('2001-11-20');
    expect(janela?.ate).toBe('2001-11-30');
  });

  it('devolve nulo quando a série não tem leitura, para a tela não pedir período de nada', () => {
    expect(
      janelaPadrao(resumo({ leituras: 0, primeiraData: null, ultimaData: null })),
    ).toBeNull();
  });

  it('nenhum atalho de fim de série estoura o teto da API', () => {
    // O atalho mais largo é o de dez anos. Ele tem de caber SEMPRE, inclusive
    // numa série de 42.642 dias como a do `E3-036`.
    const longa = resumo({ primeiraData: '1888-01-01', ultimaData: '2004-09-30' });
    for (const dias of [90, 365, 3653]) {
      const janela = janelaPadrao(longa, dias);
      expect(diasNaJanela(janela!.desde, janela!.ate)).toBeLessThanOrEqual(
        MAX_DIAS_JANELA_TELA,
      );
    }
    // E a série inteira NÃO cabe, que é o caso em que o atalho aparece
    // desabilitado com o motivo escrito.
    expect(extensaoDaSerie(longa)).toBeGreaterThan(MAX_DIAS_JANELA_TELA);
  });
});

describe('data tratada como rótulo, nunca como instante', () => {
  /**
   * O defeito: `new Date('2001-09-01')` é meia-noite UTC, e exibi-la com o fuso
   * do navegador no Brasil (UTC-3) devolve 31/08/2001. A série inteira andaria
   * um dia para trás, sem nada quebrar, justamente na tela que existe para
   * conferir número com o órgão.
   *
   * O caso abaixo reprova qualquer reescrita que volte a passar pelo fuso local,
   * porque a bancada e o servidor rodam em UTC-3.
   */
  it('não desloca o dia pelo fuso da máquina', () => {
    expect(fmtDia('2001-09-01')).toBe('01/09/2001');
    expect(fmtDiaLongo('2001-09-01')).toBe('1 de setembro de 2001');
    expect(fmtDia('2000-01-01')).toBe('01/01/2000');
  });

  it('a aritmética de dia atravessa virada de mês e de ano', () => {
    expect(somarDias('2001-03-01', -1)).toBe('2001-02-28');
    expect(somarDias('2000-03-01', -1)).toBe('2000-02-29');
    expect(somarDias('2000-01-01', -1)).toBe('1999-12-31');
  });

  it('a hora da leitura crua sai como está gravada, sem conversão de fuso', () => {
    // A leitura das sete da manhã é o caso que mais dói: convertida para UTC-3
    // ela viraria 04:00 do mesmo dia, e a das 18:00 viraria 15:00.
    expect(fmtMomento('2001-11-01T07:00:00.000Z')).toBe('01/11/2001 07:00');
    expect(fmtMomento('2001-11-01T18:00:00.000Z')).toBe('01/11/2001 18:00');
  });
});

describe('hora só aparece quando distingue alguma coisa', () => {
  it('esconde a hora quando a série inteira grava à meia-noite', () => {
    // Chuva manual do `E3-036`: uma leitura por dia, sempre 00:00. Repetir
    // "00:00" em noventa linhas é ruído que não separa linha nenhuma.
    const soMeiaNoite = ['2004-07-03T00:00:00.000Z', '2004-07-04T00:00:00.000Z'];
    expect(algumaLeituraTemHora(soMeiaNoite)).toBe(false);
    expect(fmtMomento(soMeiaNoite[0]!, false)).toBe('03/07/2004');
  });

  it('mostra a hora quando há mais de uma leitura por dia', () => {
    // Cota do `1D-008`: 07:00 e 18:00, e sem a hora as duas linhas ficariam
    // idênticas na tela.
    expect(
      algumaLeituraTemHora(['2001-11-01T07:00:00.000Z', '2001-11-01T18:00:00.000Z']),
    ).toBe(true);
  });
});

describe('ausência nunca vira zero', () => {
  /**
   * Num histórico de chuva, "não sabemos" e "não choveu" são frases diferentes,
   * e é a distinção que esta tela inteira existe para preservar. Se algum dia
   * `fmtValor` passar a devolver "0" para nulo, este caso reprova.
   */
  it('valor nulo é exibido como ausência, e zero é exibido como zero', () => {
    expect(fmtValor(null, 'mm')).toBe('—');
    expect(fmtValor(0, 'mm')).toBe('0 mm');
    expect(fmtValor(13.4, 'mm')).toBe('13,4 mm');
    expect(fmtValor(126.5, 'cm')).toBe('126,5 cm');
  });
});

describe('percentual de leituras sem medida', () => {
  it('o que existe e é pouco não é arredondado para nada', () => {
    // MEDIDO: 32 de 22.584 na cota do `1D-008` dá 0,14%; e há séries em que a
    // fração é menor ainda. Arredondar para "0,0%" leria como "nenhuma".
    expect(percentual(32, 22_584)).toBe('0,1%');
    expect(percentual(1, 41_002)).toBe('menos de 0,1%');
    expect(percentual(0, 41_002)).toBe('0,0%');
    expect(percentual(3_815_515, 10_986_575)).toBe('34,7%');
  });

  it('devolve nulo sem total, em vez de dividir por zero', () => {
    expect(percentual(0, 0)).toBeNull();
  });
});
