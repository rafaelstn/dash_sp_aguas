/**
 * A diferença entre "medimos e deu zero" e "não temos como medir isto aqui".
 *
 * Os casos abaixo foram escritos procurando a FORMA DE ESCAPAR de cada
 * veredito, e não confirmando o caminho feliz: um veredito que sempre responde
 * "apurado" passaria em qualquer teste que só olhasse a base com dado.
 */
import { describe, expect, it } from 'vitest';
import {
  MOTIVO_CONFORMIDADE_SEM_CLASSIFICACAO,
  MOTIVO_CONFORMIDADE_SEM_CRITERIO,
  MOTIVO_INDEXACAO_INDISPONIVEL,
  MOTIVO_INDEXACAO_NUNCA_EXECUTOU,
  apuracaoDeConformidade,
  apuracaoDePostosSemArquivo,
  ehNaoApurado,
  naoApurado,
  type ValorKPI,
} from '@/lib/painel-apuracao';

describe('valor de KPI não apurado', () => {
  it('só existe com motivo, e se distingue de número e de texto', () => {
    const v = naoApurado('Nenhuma indexação de arquivos executada nesta base.');
    expect(ehNaoApurado(v)).toBe(true);
    expect(v.motivo).not.toHaveLength(0);
  });

  it('não confunde valor legítimo com ausência de valor', () => {
    // O zero é o caso que interessa: ele é um valor MEDIDO, e o painel inteiro
    // existe para não tratá-lo como ausência.
    const valores: ValorKPI[] = [0, 5790, '99,9%', ''];
    for (const v of valores) {
      expect(ehNaoApurado(v)).toBe(false);
    }
  });
});

describe('apuração de "postos sem arquivo"', () => {
  it('reprova quando nada foi indexado, que é o estado do órgão em 03/09/2026', () => {
    // 5.790 postos, `indexacao_log` sem linha nenhuma. O número 5.790 está
    // aritmeticamente certo e não diz nada sobre posto nenhum: ele é uma cópia
    // do total da rede, pintada de vermelho.
    const v = apuracaoDePostosSemArquivo(
      { totalLotesIndexacao: 0, arquivosIndexadosTotal: 0 },
      5790,
    );
    expect(v.apurado).toBe(false);
    if (v.apurado) throw new Error('inalcançável');
    expect(v.motivo).toBe(MOTIVO_INDEXACAO_NUNCA_EXECUTOU);
  });

  it('aprova assim que existe UM lote registrado, mesmo sem arquivo indexado', () => {
    // Lote que rodou e não achou arquivo é medição legítima: aí o número passa
    // a ser um fato sobre a rede.
    const v = apuracaoDePostosSemArquivo(
      { totalLotesIndexacao: 1, arquivosIndexadosTotal: 0 },
      5790,
    );
    expect(v).toEqual({ apurado: true, valor: 5790 });
  });

  it('NÃO lê log expurgado com arquivos presentes como "nunca indexou"', () => {
    // A tentativa de escapar: zerar a origem primária (`indexacao_log`) e
    // deixar `arquivos_indexados` cheio. Guarda que olhasse só o log
    // responderia "nunca indexou" com 40 mil arquivos no banco.
    const v = apuracaoDePostosSemArquivo(
      { totalLotesIndexacao: 0, arquivosIndexadosTotal: 40_000 },
      120,
    );
    expect(v).toEqual({ apurado: true, valor: 120 });
  });

  it('trata histórico indisponível como não apurado, com motivo PRÓPRIO', () => {
    // Desconhecido também é não apurado. O motivo precisa ser outro porque ele
    // manda procurar em outro lugar: infraestrutura, e não escopo.
    const v = apuracaoDePostosSemArquivo(null, 5790);
    expect(v.apurado).toBe(false);
    if (v.apurado) throw new Error('inalcançável');
    expect(v.motivo).toBe(MOTIVO_INDEXACAO_INDISPONIVEL);
    expect(MOTIVO_INDEXACAO_INDISPONIVEL).not.toBe(
      MOTIVO_INDEXACAO_NUNCA_EXECUTOU,
    );
  });

  it('não inventa número: o valor aprovado é o que entrou, e nunca o total', () => {
    const v = apuracaoDePostosSemArquivo(
      { totalLotesIndexacao: 3, arquivosIndexadosTotal: 900 },
      0,
    );
    // Zero aprovado é zero MEDIDO, e tem de chegar à tela como zero.
    expect(v).toEqual({ apurado: true, valor: 0 });
  });
});

describe('apuração de conformidade do cadastro', () => {
  it('reprova quando a origem DECLARA que não classifica (null)', () => {
    const v = apuracaoDeConformidade(null, []);
    expect(v.apurado).toBe(false);
    if (v.apurado) throw new Error('inalcançável');
    expect(v.motivo).toBe(MOTIVO_CONFORMIDADE_SEM_CRITERIO);
  });

  it('a declaração da origem vence a presença de classes', () => {
    // Tentativa de escapar: mandar `null` junto de classes preenchidas. Se a
    // ordem das checagens invertesse, uma origem que declarou "não sei
    // classificar" passaria a publicar taxa por UGRHI.
    const v = apuracaoDeConformidade(null, [
      { tipo: 'prefixo', classe: 'vazio', total: 12 },
    ]);
    expect(v.apurado).toBe(false);
  });

  it('reprova o zero sem classificação nenhuma, que é o estado de hoje', () => {
    // Ponte enquanto o contrato ainda entrega `0` no lugar de `null`. Quando
    // ele passar a entregar `null`, este caso deixa de existir e o de baixo
    // ("zero com régua") assume o lugar dele.
    const v = apuracaoDeConformidade(0, []);
    expect(v.apurado).toBe(false);
    if (v.apurado) throw new Error('inalcançável');
    expect(v.motivo).toBe(MOTIVO_CONFORMIDADE_SEM_CLASSIFICACAO);
  });

  it('aprova zero quando existe classificação, porque aí o zero foi medido', () => {
    const v = apuracaoDeConformidade(0, [
      { tipo: 'prefixo', classe: 'conforme_pluviometria', total: 2483 },
    ]);
    expect(v).toEqual({ apurado: true, valor: 0 });
  });

  it('aprova e devolve o próprio número quando há desconformidade', () => {
    const v = apuracaoDeConformidade(489, []);
    expect(v).toEqual({ apurado: true, valor: 489 });
  });
});

describe('os motivos são texto de produto, e não mensagem técnica', () => {
  const motivos = [
    MOTIVO_INDEXACAO_NUNCA_EXECUTOU,
    MOTIVO_INDEXACAO_INDISPONIVEL,
    MOTIVO_CONFORMIDADE_SEM_CRITERIO,
    MOTIVO_CONFORMIDADE_SEM_CLASSIFICACAO,
  ];

  it.each(motivos)('"%s" é frase completa, sem vocabulário de código', (m) => {
    // Forma, e não texto exato: revisão de redação não pode reprovar o caso.
    expect(m[0]).toBe(m[0]?.toUpperCase());
    expect(m.endsWith('.')).toBe(true);
    // Nome de enum, de coluna ou de tabela vazando para a tela do gestor.
    expect(m).not.toMatch(/[A-Z]{2,}_[A-Z]{2,}|[a-z]+_[a-z]+/);
  });

  it('cabe no cartão: nenhum motivo passa de 60 caracteres', () => {
    // O cartão vive numa grade de até quatro colunas, e a linha do motivo
    // define a altura de TODA a fileira. Frase longa aqui estica os quatro
    // cartões, inclusive os que trazem número.
    for (const m of motivos) {
      expect(m.length).toBeLessThanOrEqual(60);
    }
  });

  it('nenhum motivo se repete: dois estados diferentes não podem dizer o mesmo', () => {
    expect(new Set(motivos).size).toBe(motivos.length);
  });
});
