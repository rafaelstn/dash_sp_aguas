/**
 * Use-case: obter a SÉRIE DE NÍVEL (metros) de uma estação fluviométrica ou
 * piezométrica, SOB DEMANDA do SIBH, agregada por dia de calendário.
 *
 * MOTIVAÇÃO / DECISÃO DE ARQUITETURA: nível é grandeza INSTANTÂNEA (cota do rio,
 * lençol freático), não acumulado do dia hidrológico como a chuva. Por isso a
 * série NÃO é persistida (não reusa `leituras_pluviometricas` nem a agregação
 * 07:00→06:59 da chuva): é lida ao vivo do SIBH a cada requisição e agregada
 * aqui por dia de CALENDÁRIO (America/Sao_Paulo).
 *
 * A agregação é uma função PURA (`agregarNivelDiario`): mesma entrada, mesma
 * saída, sem `Date.now()` nem I/O — as datas/janela chegam prontas do caller,
 * o que a torna determinística e testável. O use-case só embrulha a chamada ao
 * gateway com tolerância a falha (espelha `obter-leituras-com-fallback`):
 * SIBH indisponível/lento ou estação sem prefixo devolvem série vazia + flag,
 * NUNCA estouram.
 *
 * TIMEZONE: o SIBH entrega o momento como 'YYYY/MM/DD HH:mm' já na hora
 * operacional local (BRT, UTC-3), do mesmo modo que o domínio pluviométrico
 * (`agregacao-hidrologica`) interpreta seus momentos sem conversão de fuso. O
 * "dia de calendário America/Sao_Paulo" é, portanto, a própria porção de data do
 * momento. Cada dia é rotulado com o ISO da meia-noite UTC daquele dia
 * ('YYYY-MM-DDT00:00:00.000Z'), evitando o deslocamento de data que um offset
 * -03:00 causaria ao ser formatado no cliente.
 */

import type { PontoNivelSibh, SibhGateway } from '@/application/ports/sibh-gateway';

/** Estação alvo da consulta de nível: prefixo do SIBH (pode ser nulo). */
export interface EstacaoConsultaNivel {
  prefixo: string | null;
}

/** Um ponto diário agregado da série de nível. */
export interface PontoNivelDiario {
  /** Meia-noite (UTC) do dia de calendário, em ISO 8601. */
  momento: string;
  /** Nível médio do dia, em metros, arredondado a 2 casas. */
  nivelMedioM: number;
  /** Menor nível do dia, em metros, arredondado a 2 casas. */
  nivelMinM: number;
  /** Maior nível do dia, em metros, arredondado a 2 casas. */
  nivelMaxM: number;
}

export interface ResultadoSerieNivel {
  /** Série de nível diária no período, ordenada por momento crescente. */
  itens: PontoNivelDiario[];
  /**
   * `true` quando a consulta ao SIBH falhou (indisponível/lento/erro) e a série
   * voltou vazia por causa disso. A resposta ainda é válida (itens: []).
   */
  sibhIndisponivel: boolean;
  /**
   * `true` quando a estação não tem prefixo consultável no SIBH: não há o que
   * buscar, série vazia sem tentar a rede.
   */
  semPrefixo: boolean;
}

/** Regex do momento do SIBH: 'YYYY/MM/DD HH:mm'. Igual à da agregação de chuva. */
const RE_MOMENTO = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/;

/** Arredonda a 2 casas decimais (mesma convenção da agregação pluviométrica). */
function duasCasas(valor: number): number {
  return Math.round(valor * 100) / 100;
}

interface AcumuladorDia {
  soma: number;
  count: number;
  min: number;
  max: number;
}

/**
 * Agrega pontos brutos de nível por dia de calendário (BRT), devolvendo média,
 * mínimo e máximo do dia. Função PURA e determinística.
 *
 * Pontos com momento em formato inesperado ou nível não finito são ignorados
 * (defensivo, sem poluir a agregação com NaN).
 *
 * @param pontos Pontos brutos de nível (port SibhGateway), granularidade horária.
 * @returns Série diária ordenada por dia crescente.
 */
export function agregarNivelDiario(pontos: PontoNivelSibh[]): PontoNivelDiario[] {
  const porDia = new Map<string, AcumuladorDia>();

  for (const ponto of pontos) {
    if (!Number.isFinite(ponto.nivelM)) continue;
    const match = ponto.momento.trim().match(RE_MOMENTO);
    if (!match) continue;

    // A porção de data do momento (já em BRT) é o dia de calendário.
    const dia = `${match[1]}-${match[2]}-${match[3]}`;
    const atual = porDia.get(dia);
    if (atual) {
      atual.soma += ponto.nivelM;
      atual.count += 1;
      if (ponto.nivelM < atual.min) atual.min = ponto.nivelM;
      if (ponto.nivelM > atual.max) atual.max = ponto.nivelM;
    } else {
      porDia.set(dia, {
        soma: ponto.nivelM,
        count: 1,
        min: ponto.nivelM,
        max: ponto.nivelM,
      });
    }
  }

  const itens: PontoNivelDiario[] = [];
  for (const [dia, dados] of porDia) {
    itens.push({
      momento: `${dia}T00:00:00.000Z`,
      nivelMedioM: duasCasas(dados.soma / dados.count),
      nivelMinM: duasCasas(dados.min),
      nivelMaxM: duasCasas(dados.max),
    });
  }

  // Ordena crescente por dia. As chaves 'YYYY-MM-DD' ordenam lexicograficamente
  // igual à cronologia; o sufixo ISO fixo mantém a equivalência.
  return itens.sort((a, b) => a.momento.localeCompare(b.momento));
}

/**
 * Busca a série de nível do SIBH e agrega por dia de calendário. Tolerante a
 * falha: nunca estoura, sinaliza no resultado.
 *
 * @param sibh    Gateway do SIBH (fonte da série de nível ao vivo).
 * @param estacao Estação alvo (prefixo do SIBH; pode ser nulo).
 * @param desde   Início do período (inclusivo).
 * @param ate     Fim do período (inclusivo).
 * @param onErro  Callback opcional de observabilidade quando o SIBH falha.
 */
export async function obterSerieNivel(
  sibh: SibhGateway,
  estacao: EstacaoConsultaNivel,
  desde: Date,
  ate: Date,
  onErro?: (erro: unknown) => void,
): Promise<ResultadoSerieNivel> {
  const prefixo = estacao.prefixo?.trim();
  if (!prefixo) {
    return { itens: [], sibhIndisponivel: false, semPrefixo: true };
  }

  try {
    const pontos = await sibh.serieNivelPorPrefixo(prefixo, desde, ate);
    return {
      itens: agregarNivelDiario(pontos),
      sibhIndisponivel: false,
      semPrefixo: false,
    };
  } catch (erro) {
    // SIBH indisponível/lento não derruba a resposta: série vazia + flag.
    onErro?.(erro);
    return { itens: [], sibhIndisponivel: true, semPrefixo: false };
  }
}
