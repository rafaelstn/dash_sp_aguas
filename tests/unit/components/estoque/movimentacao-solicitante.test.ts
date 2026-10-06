/**
 * Matricula de quem SOLICITOU a saida, na camada de tela (06/10/2026).
 *
 * O backend passou a exigir `solicitanteMatricula` no ramo `tipo: 'saida'` do
 * `movimentacaoSchema` (migration 0075), e sem este campo o formulario mandava
 * a saida sem ele e colhia 400. Aqui se mede a logica PURA do formulario:
 * visibilidade por tipo, recusa do que o servidor recusaria, e o payload.
 *
 * A regra NAO e reescrita neste arquivo: os limites e a regex vem de
 * `@/domain/estoque/movimentacao`, que e a mesma fonte que o zod da rota e o
 * CHECK do banco usam. Numero repetido em dois lugares envelhece em um so.
 *
 * O caso que importa e o do balcao: a pessoa digita o NOME em vez da matricula.
 * O espaco em branco e a unica coisa que separa os dois hoje, entao recusar sem
 * dizer o motivo deixa quem digitou sem saida.
 */
import { describe, expect, it } from 'vitest';

import {
  camposVisiveis,
  estadoInicialForm,
  montarPayload,
  type AlvoMov,
  type EstadoFormMov,
} from '@/components/features/estoque/movimentacao-form';
import {
  MATRICULA_SOLICITANTE_MAX,
  MATRICULA_SOLICITANTE_MIN,
  MATRICULA_SOLICITANTE_REGEX,
} from '@/domain/estoque/movimentacao';
import type { TipoMovimentacao } from '@/components/features/estoque/dtos';

const UNIDADE_ID = '11111111-1111-1111-1111-111111111111';
const MATERIAL_ID = '22222222-2222-2222-2222-222222222222';
const LOCAL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LOCAL_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const serial: AlvoMov = { natureza: 'serializado', unidadeId: UNIDADE_ID };
const quant: AlvoMov = { natureza: 'quantificavel', materialId: MATERIAL_ID };

function form(over: Partial<EstadoFormMov>): EstadoFormMov {
  return { ...estadoInicialForm('transferencia'), ...over };
}

/** Saida valida de serializado, com a matricula informada. */
function saida(matricula: string, over: Partial<EstadoFormMov> = {}): EstadoFormMov {
  return form({
    tipo: 'saida',
    localOrigem: LOCAL_A,
    solicitanteMatricula: matricula,
    ...over,
  });
}

describe('camposVisiveis — solicitante', () => {
  it('o campo aparece SO na saida', () => {
    const outros: TipoMovimentacao[] = ['entrada', 'transferencia', 'baixa', 'ajuste'];
    expect(camposVisiveis('saida', 'serializado').solicitanteMatricula).toBe(true);
    expect(camposVisiveis('saida', 'quantificavel').solicitanteMatricula).toBe(true);
    for (const tipo of outros) {
      expect(
        camposVisiveis(tipo, tipo === 'ajuste' ? 'serializado' : 'quantificavel')
          .solicitanteMatricula,
        `tipo ${tipo} nao tem solicitante`,
      ).toBe(false);
    }
  });
});

describe('montarPayload — saida exige a matricula do solicitante', () => {
  it('vazio recusa e pede a matricula, sem falar de nome', () => {
    const r = montarPayload(serial, saida(''));
    expect(r.payload).toBeNull();
    expect(r.erros.solicitanteMatricula).toMatch(/matr[íi]cula/i);
  });

  it('valor com espaco recusa dizendo que o campo e matricula, nao nome', () => {
    const r = montarPayload(serial, saida('Maria da Silva'));
    expect(r.payload).toBeNull();
    // A pessoa precisa entender POR QUE: a mensagem nomeia o espaco E diz que
    // o campo nao e o nome dela. Sem isso ela digita o nome de novo.
    expect(r.erros.solicitanteMatricula).toMatch(/espa[çc]o/i);
    expect(r.erros.solicitanteMatricula).toMatch(/n[ãa]o\s+(é|e)\s+o\s+nome/i);
  });

  it('espaco no comeco tambem recusa: nao ha trim silencioso', () => {
    // ' 482913' passaria pelo regex do dominio DEPOIS de um trim, e gravaria
    // valor diferente do digitado. A tela nao transforma o que a pessoa escreveu.
    const bruto = ' 482913';
    const r = montarPayload(serial, saida(bruto));
    expect(r.payload).toBeNull();
    expect(r.erros.solicitanteMatricula).toMatch(/espa[çc]o/i);
    expect(MATRICULA_SOLICITANTE_REGEX.test(bruto.trim())).toBe(true);
  });

  it('curto e longo recusam citando os limites do dominio', () => {
    const curto = montarPayload(serial, saida('a'.repeat(MATRICULA_SOLICITANTE_MIN - 1)));
    expect(curto.payload).toBeNull();
    expect(curto.erros.solicitanteMatricula).toContain(String(MATRICULA_SOLICITANTE_MIN));
    expect(curto.erros.solicitanteMatricula).toContain(String(MATRICULA_SOLICITANTE_MAX));

    const longo = montarPayload(serial, saida('9'.repeat(MATRICULA_SOLICITANTE_MAX + 1)));
    expect(longo.payload).toBeNull();
    expect(longo.erros.solicitanteMatricula).toContain(String(MATRICULA_SOLICITANTE_MAX));
  });

  it('valor valido entra no payload EXATAMENTE como digitado', () => {
    const r = montarPayload(serial, saida('482913'));
    expect(r.erros).toEqual({});
    expect(r.payload).toEqual({
      tipo: 'saida',
      unidadeId: UNIDADE_ID,
      localOrigem: LOCAL_A,
      solicitanteMatricula: '482913',
    });
  });

  it('nenhuma tela aceita o que o dominio recusaria', () => {
    // A guarda do cliente so existe para dar o motivo antes da ida ao servidor.
    // Se ela aceitasse algo que a regex do dominio recusa, o produto voltaria a
    // responder 400 sem explicacao.
    const candidatos = [
      '482913',
      'MAT-1',
      'a'.repeat(MATRICULA_SOLICITANTE_MAX),
      '',
      ' ',
      'a',
      'Maria da Silva',
      ' 482913',
      '482913 ',
      'a'.repeat(MATRICULA_SOLICITANTE_MAX + 1),
      '48 2913',
    ];
    for (const v of candidatos) {
      const aceitouNaTela = montarPayload(serial, saida(v)).payload !== null;
      expect(aceitouNaTela, `valor ${JSON.stringify(v)}`).toBe(
        MATRICULA_SOLICITANTE_REGEX.test(v),
      );
    }
  });

  it('quantificavel segue a mesma regra', () => {
    const r = montarPayload(
      quant,
      saida('482913', { quantidade: 3, tamanho: '2,5mm' }),
    );
    expect(r.payload).toMatchObject({
      tipo: 'saida',
      materialId: MATERIAL_ID,
      quantidade: 3,
      solicitanteMatricula: '482913',
    });
  });
});

describe('montarPayload — os outros tipos NAO mandam o campo', () => {
  it('entrada e transferencia saem sem solicitanteMatricula mesmo com valor no estado', () => {
    // Estado sujo de proposito: a pessoa digitou a matricula, trocou o tipo e
    // enviou. Identificador sem finalidade nao se grava, e o zod da rota nem
    // declara a chave nestes ramos.
    const entrada = montarPayload(
      quant,
      form({ tipo: 'entrada', localDestino: LOCAL_B, solicitanteMatricula: '482913' }),
    );
    expect(entrada.payload).not.toBeNull();
    expect(entrada.payload).not.toHaveProperty('solicitanteMatricula');

    const transf = montarPayload(
      serial,
      form({
        tipo: 'transferencia',
        localOrigem: LOCAL_A,
        localDestino: LOCAL_B,
        solicitanteMatricula: '482913',
      }),
    );
    expect(transf.payload).not.toBeNull();
    expect(transf.payload).not.toHaveProperty('solicitanteMatricula');
  });

  it('baixa e ajuste tambem saem sem o campo', () => {
    const baixa = montarPayload(
      serial,
      form({ tipo: 'baixa', motivo: 'queimado', solicitanteMatricula: '482913' }),
    );
    expect(baixa.payload).not.toBeNull();
    expect(baixa.payload).not.toHaveProperty('solicitanteMatricula');

    const ajuste = montarPayload(
      serial,
      form({
        tipo: 'ajuste',
        motivo: 'revisao de inventario',
        localDestino: LOCAL_B,
        solicitanteMatricula: '482913',
      }),
    );
    expect(ajuste.payload).not.toBeNull();
    expect(ajuste.payload).not.toHaveProperty('solicitanteMatricula');
  });

  it('o estado inicial nasce vazio, em todo tipo', () => {
    for (const tipo of ['entrada', 'saida', 'transferencia', 'baixa', 'ajuste'] as const) {
      expect(estadoInicialForm(tipo).solicitanteMatricula).toBe('');
    }
  });
});
