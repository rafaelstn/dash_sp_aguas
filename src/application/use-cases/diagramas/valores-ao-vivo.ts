/**
 * Valores ao vivo dos elementos vinculados de um diagrama (Fase A5.2).
 *
 * Recebe os prefixos dos postos vinculados (nível/chuva) e devolve a leitura
 * mais recente de cada um. Hoje a fonte é o SIBH (a fundação já pronta); a
 * telemetria do nosso banco ainda não tem dados de postos (as tabelas
 * pluviométricas só são populadas pelo módulo Monitor). Quando houver, este é
 * o ponto único onde a preferência "banco primeiro, SIBH como reforço" será
 * resolvida, sem mudar o contrato consumido pelo editor.
 *
 * Tolera falha por prefixo: um posto sem leitura ou uma indisponibilidade
 * pontual do SIBH vira `null` só para aquele prefixo, sem derrubar os demais
 * (degradação graciosa, exigência de governo).
 */

import type { LeituraSibh, SibhGateway } from '@/application/ports/sibh-gateway';

/** Fonte mínima necessária: a leitura atual por prefixo. */
type FonteValorAtual = Pick<SibhGateway, 'valorAtualPorPrefixo'>;

export async function obterValoresAoVivo(
  fonte: FonteValorAtual,
  prefixos: string[],
): Promise<Record<string, LeituraSibh | null>> {
  const unicos = [
    ...new Set(prefixos.map((p) => p.trim()).filter((p) => p.length > 0)),
  ];

  const resultado: Record<string, LeituraSibh | null> = {};
  await Promise.all(
    unicos.map(async (prefixo) => {
      try {
        resultado[prefixo] = await fonte.valorAtualPorPrefixo(prefixo);
      } catch {
        // Indisponibilidade ou erro pontual de um prefixo não contamina os
        // outros; o editor mostra "sem leitura" só para este.
        resultado[prefixo] = null;
      }
    }),
  );
  return resultado;
}
