/**
 * Validação da ordem dos limiares de um posto de nível.
 *
 * Os limiares (atencao, alerta, emergencia, extravasamento) representam pisos
 * crescentes de criticidade. A leitura de status em `calcularStatus` só faz
 * sentido se eles estiverem em ordem não decrescente:
 *
 *   atencao <= alerta <= emergencia <= extravasamento
 *
 * Limiares ausentes (null/undefined) são ignorados na comparação: um posto
 * pode ter só alguns configurados. A validação compara apenas os pares de
 * limiares definidos que aparecem em sequência na ordem de criticidade.
 *
 * Domínio puro: sem I/O, sem React, totalmente testável.
 */

import type { LimiaresNivel } from './tipos';

/** Resultado da validação de ordem dos limiares. */
export interface ResultadoValidacaoLimiares {
  valido: boolean;
  /** Mensagem legível (pt-BR) quando a ordem é violada; ausente se válido. */
  mensagem?: string;
}

/** Ordem de criticidade dos limiares, do menor piso ao maior. */
const ORDEM: ReadonlyArray<{ chave: keyof LimiaresNivel; rotulo: string }> = [
  { chave: 'atencao', rotulo: 'atenção' },
  { chave: 'alerta', rotulo: 'alerta' },
  { chave: 'emergencia', rotulo: 'emergência' },
  { chave: 'extravasamento', rotulo: 'extravasamento' },
];

/**
 * Valida que os limiares definidos estão em ordem não decrescente conforme a
 * criticidade. Compara cada limiar definido com o próximo limiar definido na
 * sequência; ao achar um par fora de ordem, devolve a primeira violação.
 */
export function validarOrdemLimiares(
  limiares: LimiaresNivel | null | undefined,
): ResultadoValidacaoLimiares {
  if (!limiares) return { valido: true };

  const definidos = ORDEM.map((item) => ({
    ...item,
    valor: limiares[item.chave],
  })).filter(
    (item): item is { chave: keyof LimiaresNivel; rotulo: string; valor: number } =>
      item.valor !== null && item.valor !== undefined,
  );

  for (let i = 0; i < definidos.length - 1; i += 1) {
    const atual = definidos[i]!;
    const proximo = definidos[i + 1]!;
    if (atual.valor > proximo.valor) {
      return {
        valido: false,
        mensagem: `O limiar de ${atual.rotulo} (${atual.valor}) não pode ser maior que o de ${proximo.rotulo} (${proximo.valor}).`,
      };
    }
  }

  return { valido: true };
}
