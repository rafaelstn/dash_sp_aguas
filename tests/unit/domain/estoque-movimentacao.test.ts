import { describe, expect, it } from 'vitest';
import {
  MATRICULA_SOLICITANTE_MAX,
  MATRICULA_SOLICITANTE_MENSAGEM,
  MATRICULA_SOLICITANTE_MIN,
  resolverAlvo,
  validarComandoEstrutural,
  type AlvoMovimentacao,
} from '@/domain/estoque/movimentacao';
import { AlvoMovimentacaoInvalido, MovimentacaoInvalida } from '@/domain/errors';

const U = '11111111-1111-1111-1111-111111111111';
const M = '22222222-2222-2222-2222-222222222222';
const L1 = '33333333-3333-3333-3333-333333333333';
const L2 = '44444444-4444-4444-4444-444444444444';

const alvoSerial: AlvoMovimentacao = { natureza: 'serializado', unidadeId: U };
const alvoQuant: AlvoMovimentacao = { natureza: 'quantificavel', materialId: M };

/** Matricula plausivel do orgao. A mascara real NAO foi medida (ver 0075). */
const MATRICULA_OK = '482913';

/** Conferencia fisica (0064) que gera saida de reconciliacao, sem solicitante. */
const CONFERENCIA = '55555555-5555-5555-5555-555555555555';

describe('domain/estoque/movimentacao, resolverAlvo (XOR)', () => {
  it('unidadeId -> serializado', () => {
    expect(resolverAlvo({ unidadeId: U })).toEqual(alvoSerial);
  });
  it('materialId -> quantificavel', () => {
    expect(resolverAlvo({ materialId: M })).toEqual(alvoQuant);
  });
  it('nenhum alvo lanca', () => {
    expect(() => resolverAlvo({})).toThrow(AlvoMovimentacaoInvalido);
  });
  it('ambos os alvos lanca', () => {
    expect(() => resolverAlvo({ unidadeId: U, materialId: M })).toThrow(AlvoMovimentacaoInvalido);
  });
});

describe('domain/estoque/movimentacao, validarComandoEstrutural', () => {
  // solicitanteMatricula entrou no comando em 06/10/2026 (migration 0075) e e
  // obrigatorio no tipo, nao opcional: por isso aparece aqui com null explicito,
  // que e o valor de quem nao tem solicitante.
  const base = {
    quantidade: 1,
    localOrigemId: null,
    localDestinoId: null,
    tamanho: null,
    motivo: null,
    solicitanteMatricula: null,
  };

  it('entrada exige localDestino', () => {
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'entrada', alvo: alvoQuant }),
    ).toThrow(MovimentacaoInvalida);
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'entrada', alvo: alvoQuant, localDestinoId: L1 }),
    ).not.toThrow();
  });

  it('saida exige localOrigem', () => {
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'saida', alvo: alvoQuant }),
    ).toThrow(MovimentacaoInvalida);
    // A saida valida passou a exigir TAMBEM a matricula do solicitante (0075),
    // por isso este caso deixou de poder usar o base cru aqui.
    expect(() =>
      validarComandoEstrutural({
        ...base,
        tipo: 'saida',
        alvo: alvoQuant,
        localOrigemId: L1,
        solicitanteMatricula: MATRICULA_OK,
      }),
    ).not.toThrow();
  });

  it('transferencia exige origem e destino distintos', () => {
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'transferencia', alvo: alvoQuant, localOrigemId: L1, localDestinoId: L1 }),
    ).toThrow(MovimentacaoInvalida);
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'transferencia', alvo: alvoQuant, localOrigemId: L1, localDestinoId: L2 }),
    ).not.toThrow();
  });

  it('baixa exige motivo; quantificavel exige localOrigem', () => {
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'baixa', alvo: alvoQuant, localOrigemId: L1 }),
    ).toThrow(/motivo/);
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'baixa', alvo: alvoQuant, motivo: 'quebrou' }),
    ).toThrow(/localOrigem/);
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'baixa', alvo: alvoQuant, motivo: 'quebrou', localOrigemId: L1 }),
    ).not.toThrow();
  });

  it('serializado tem quantidade 1', () => {
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'entrada', alvo: alvoSerial, localDestinoId: L1, quantidade: 2 }),
    ).toThrow(/quantidade 1/);
  });

  it('ajuste so serializado, exige motivo e ao menos uma mudanca', () => {
    // quantificavel + ajuste = barrado
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'ajuste', alvo: alvoQuant, motivo: 'corrigir' }),
    ).toThrow(/serializados/);
    // serializado sem mudanca
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'ajuste', alvo: alvoSerial, motivo: 'corrigir' }),
    ).toThrow(/ao menos uma mudanca/);
    // serializado com status
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'ajuste', alvo: alvoSerial, motivo: 'corrigir', novoStatus: 'ativo' }),
    ).not.toThrow();
  });
});

/**
 * Matricula do solicitante (migration 0075, decidido em 06/10/2026).
 *
 * O que estes casos travam: o campo guarda IDENTIFICADOR. A versao anterior do
 * contrato guardava NOME em texto livre e caiu na revisao, porque nome digitado
 * nao identifica pessoa e vira dado pessoal sem finalidade. O espaco em branco e
 * o que separa os dois, e e por isso que a guarda o proibe inteiro.
 *
 * As bordas saem das CONSTANTES e nao dos numeros 2 e 30 escritos a mao: no dia
 * em que o orgao responder qual e a mascara real, quem mudar o limite nao precisa
 * caçar literal em teste, e a regua continua medindo a regra e nao o proprio
 * texto.
 */
describe('domain/estoque/movimentacao, matricula do solicitante (0075)', () => {
  const base = {
    quantidade: 1,
    localOrigemId: L1,
    localDestinoId: null,
    tamanho: null,
    motivo: null,
    solicitanteMatricula: null as string | null,
  };
  const saida = (solicitanteMatricula: string | null) => () =>
    validarComandoEstrutural({ ...base, tipo: 'saida', alvo: alvoQuant, solicitanteMatricula });

  it('saida SEM matricula e recusada, e a mensagem diz que o campo e matricula e nao nome', () => {
    expect(saida(null)).toThrow(MovimentacaoInvalida);
    expect(saida(null)).toThrow(/matrícula/);
    expect(saida(null)).toThrow(/não é o nome|não o nome/);
  });

  it('nome digitado e recusado (e o caso que a revisao de 06/10/2026 derrubou)', () => {
    expect(saida('Maria Antônia Gonçalves')).toThrow(MovimentacaoInvalida);
    // Nome sem acento e com um unico espaco tambem: quem recusa e o espaco.
    expect(saida('Jose Silva')).toThrow(MovimentacaoInvalida);
  });

  it('nenhum tipo de espaco em branco passa (espelha [:space:] do CHECK no Postgres)', () => {
    // Um por um, porque uma lista com `some` deixaria 5 dos 6 sem medir.
    expect(saida('4829 13')).toThrow(MovimentacaoInvalida);
    expect(saida('4829\t13')).toThrow(MovimentacaoInvalida);
    expect(saida('4829\n13')).toThrow(MovimentacaoInvalida);
    expect(saida('4829\r13')).toThrow(MovimentacaoInvalida);
    expect(saida('4829\f13')).toThrow(MovimentacaoInvalida);
    expect(saida('4829\v13')).toThrow(MovimentacaoInvalida);
    // Espaco nas pontas tambem: o dominio NAO normaliza por conta propria, para
    // nao gravar silenciosamente coisa diferente do que o balcao digitou.
    expect(saida(' 482913')).toThrow(MovimentacaoInvalida);
    expect(saida('482913 ')).toThrow(MovimentacaoInvalida);
  });

  it('as bordas de tamanho saem das constantes, nos dois lados', () => {
    const curta = '7'.repeat(MATRICULA_SOLICITANTE_MIN - 1);
    const minima = '7'.repeat(MATRICULA_SOLICITANTE_MIN);
    const maxima = '7'.repeat(MATRICULA_SOLICITANTE_MAX);
    const longa = '7'.repeat(MATRICULA_SOLICITANTE_MAX + 1);
    expect(saida('')).toThrow(MovimentacaoInvalida);
    expect(saida(curta)).toThrow(MovimentacaoInvalida);
    expect(saida(minima)).not.toThrow();
    expect(saida(maxima)).not.toThrow();
    expect(saida(longa)).toThrow(MovimentacaoInvalida);
  });

  it('matricula valida passa, inclusive com prefixo ou separador sem espaco', () => {
    // A mascara real do orgao NAO FOI MEDIDA, entao a guarda aceita estas formas
    // de proposito. Endurecer antes da resposta recusaria matricula legitima.
    expect(saida(MATRICULA_OK)).not.toThrow();
    expect(saida('SP-482913')).not.toThrow();
    expect(saida('482913/2')).not.toThrow();
  });

  it('o formato vale em QUALQUER tipo que mande valor, nao so na saida', () => {
    // O CHECK ck_estoque_mov_matricula_formato tambem e por valor. Se o dominio
    // so olhasse a saida, o banco seria o primeiro a recusar e o usuario veria
    // erro de infraestrutura em vez de erro de campo.
    expect(() =>
      validarComandoEstrutural({
        ...base,
        tipo: 'entrada',
        alvo: alvoQuant,
        localOrigemId: null,
        localDestinoId: L2,
        solicitanteMatricula: 'Maria Antônia',
      }),
    ).toThrow(MovimentacaoInvalida);
  });

  it('a mensagem de recusa NAO interpola o valor recebido', () => {
    // Valor em mensagem de erro acaba no log pelo ramo genérico de
    // src/app/api/_helpers/erros.ts, que registra `erro: String(erro)`. Medido
    // pelo EFEITO: o valor estranho nao pode aparecer na mensagem.
    const valor = 'MATRICULA SECRETA 99';
    let mensagem = '';
    try {
      saida(valor)();
    } catch (erro) {
      mensagem = erro instanceof Error ? erro.message : String(erro);
    }
    // Ancora de PRESENCA: sem ela, um throw que nunca acontece deixaria a
    // assercao de ausencia verde sobre string vazia.
    expect(mensagem).toBe(MATRICULA_SOLICITANTE_MENSAGEM);
    expect(mensagem).not.toContain(valor);
    expect(mensagem).not.toContain('99');
  });

  /**
   * Isencao da reconciliacao de conferencia: espelha `conferencia_id IS NOT
   * NULL` do CHECK ck_estoque_mov_saida_solicitante (0075). E semantica, nunca
   * temporal, e os dois lados ficam medidos aqui, senao a isencao vira porta
   * dos fundos silenciosa para a saida de balcao.
   *
   * Sintoma que a trouxe (medido em 06/10/2026, na suite completa): reconciliar
   * divergencia negativa estourava MovimentacaoInvalida, porque os dois
   * repositorios de conferencia chamam validarComandoEstrutural e o id da
   * conferencia viajava fora do comando.
   */
  const saidaDeConferencia = (
    solicitanteMatricula: string | null,
    conferenciaId: string | null,
  ) => () =>
    validarComandoEstrutural(
      { ...base, tipo: 'saida', alvo: alvoQuant, solicitanteMatricula },
      { conferenciaId },
    );

  it('saida de reconciliacao de conferencia passa SEM matricula (isencao semantica)', () => {
    expect(saidaDeConferencia(null, CONFERENCIA)).not.toThrow();
  });

  it('o controle da isencao: a MESMA saida sem conferencia continua recusada', () => {
    // Sem este par, a isencao poderia estar aceitando tudo e o caso de cima
    // ficaria verde do mesmo jeito.
    expect(saidaDeConferencia(null, null)).toThrow(MovimentacaoInvalida);
    // E o default do parametro e fail-closed: quem nao informa contexto cai na
    // regra estrita. Medido pela chamada de UM argumento.
    expect(saida(null)).toThrow(MovimentacaoInvalida);
  });

  it('a isencao nao alcanca o FORMATO: conferencia com valor torto e recusada', () => {
    // O CHECK ck_estoque_mov_matricula_formato nao tem isencao nenhuma, e a
    // reconciliacao manda null, nunca valor torto.
    expect(saidaDeConferencia('Maria Antônia', CONFERENCIA)).toThrow(MovimentacaoInvalida);
  });
});
