import { describe, expect, it } from 'vitest';
import {
  naturezaEnum,
  estadoEnum,
  statusEnum,
  unidadeFisicaEnum,
  tipoMovEnum,
} from '@/app/api/estoque/_schemas';
import { NATUREZAS } from '@/domain/estoque/material';
import { ESTADOS } from '@/domain/estoque/estado';
import { STATUS } from '@/domain/estoque/status-unidade';
import { UNIDADES_FISICAS } from '@/domain/estoque/local';
import { TIPOS_MOVIMENTACAO } from '@/domain/estoque/movimentacao';
import { STATUS_CONFERENCIA } from '@/domain/estoque/conferencia';

/**
 * Paridade entre as enumerações do domínio e os enums Zod que validam a entrada
 * da API de estoque.
 *
 * As duas listas existem separadas de propósito: o domínio não conhece Zod, e a
 * borda HTTP valida o que chega de fora. O problema é que elas são escritas como
 * literais nos dois lados, e `z.enum(['a','b'])` não é checado pelo TypeScript
 * contra o tipo do domínio. Consequência: acrescentar um valor no domínio e
 * esquecer o schema passa no typecheck, passa no lint, e a API rejeita o valor
 * novo em silêncio, com erro de validação que parece bug de tela.
 *
 * Este teste é a guarda que denuncia a divergência no momento em que ela nasce.
 * Ele não muda comportamento nenhum: só recusa que as duas fontes de verdade
 * andem separadas.
 *
 * Ao adicionar um valor novo, atualize os dois lados. Se a intenção for
 * deliberadamente aceitar na API menos do que o domínio permite, troque a
 * asserção por uma de subconjunto e escreva o motivo aqui.
 */

const casos = [
  { nome: 'natureza de material', dominio: NATUREZAS, zod: naturezaEnum },
  { nome: 'estado de conservação', dominio: ESTADOS, zod: estadoEnum },
  { nome: 'status de unidade', dominio: STATUS, zod: statusEnum },
  { nome: 'unidade física', dominio: UNIDADES_FISICAS, zod: unidadeFisicaEnum },
  { nome: 'tipo de movimentação', dominio: TIPOS_MOVIMENTACAO, zod: tipoMovEnum },
] as const;

describe('paridade entre enums do domínio e os schemas da API de estoque', () => {
  for (const caso of casos) {
    it(`${caso.nome}: domínio e schema aceitam exatamente o mesmo conjunto`, () => {
      const noDominio = [...caso.dominio].sort();
      const noSchema = [...caso.zod.options].sort();
      expect(noSchema).toEqual(noDominio);
    });

    it(`${caso.nome}: o schema aceita todo valor que o domínio declara`, () => {
      // Redundante com o caso acima quando os dois estão iguais, mas aponta o
      // lado que falhou: aqui, valor que o domínio tem e a API recusa.
      for (const valor of caso.dominio) {
        expect(caso.zod.safeParse(valor).success, `domínio permite "${valor}"`).toBe(true);
      }
    });

    it(`${caso.nome}: o schema recusa valor fora do domínio`, () => {
      expect(caso.zod.safeParse('valor-que-nao-existe').success).toBe(false);
      expect(caso.zod.safeParse('').success).toBe(false);
    });
  }

  it('status de conferência é enumeração de domínio e não tem par na borda HTTP', () => {
    // Documenta a assimetria em vez de deixá-la implícita: o status da
    // conferência é decidido pelo fluxo (abrir, concluir, cancelar), nunca
    // recebido como campo livre, então não existe enum Zod correspondente. Se um
    // dia a API passar a aceitar status por parâmetro, este teste vira paridade
    // como os de cima.
    expect(STATUS_CONFERENCIA.length).toBeGreaterThan(0);
  });
});
