/**
 * Use-case: sincronizar leituras (chuva automática) do SIBH para o banco.
 *
 * Para um período [desde, ate] e uma lista de estações já persistidas, busca as
 * medições do SIBH e grava UMA linha por DIA HIDROLÓGICO em
 * `leituras_pluviometricas` (upsert idempotente por (estacao_id, momento)).
 *
 * POR QUE AGREGAR: o SIBH entrega medições com gap de 10 minutos (~144 por dia
 * por estação). Gravar cru explodiria a tabela (~194M linhas/ano nas 3690
 * estações) sem ganho de informação para o Monitor, que compara CHUVA DIÁRIA
 * (auto vs manual). Agregamos por dia hidrológico (07:00→06:59, convenção
 * DAEE/ANA) reusando `agregarDiario`, gravando o total do dia em `automaticoMm`.
 * O canal manual (`manualMm`) fica em 0: vem de operador numa fase futura.
 *
 * Camada fina e testável: portas por injeção, sem banco nem HTTP. Degrada por
 * estação (falha de uma não derruba o lote). O upsert por (estacao_id, momento)
 * torna o reprocessamento da mesma janela seguro (idempotente): uma janela que
 * traga só parte de um dia grava o parcial e a sync seguinte o corrige.
 */

import type { SibhGateway } from '@/application/ports/sibh-gateway';
import type { LeiturasPluviometricasRepository } from '@/application/ports/leituras-pluviometricas-repository';
import type { UpsertLeituraPluviometrica } from '@/domain/monitor/leitura-pluviometrica';
import { agregarDiario } from '@/domain/monitor/agregacao-hidrologica';

/**
 * Estação alvo da sincronização de leituras. `prefixo` é a chave de busca no
 * SIBH; `id` é a PK local onde a série será gravada.
 */
export interface EstacaoAlvoLeitura {
  id: string;
  prefixo: string | null;
}

export interface ResumoSyncLeituras {
  /** Estações processadas (com prefixo, portanto consultáveis no SIBH). */
  estacoesProcessadas: number;
  /** Estações puladas por não terem prefixo (não há como consultar o SIBH). */
  estacoesSemPrefixo: number;
  /** Total de medições cruas recebidas do SIBH, somando todas as estações. */
  medicoesRecebidas: number;
  /** Linhas inseridas ou atualizadas no banco (1 por dia hidrológico). */
  linhasGravadas: number;
  /** Estações que falharam individualmente (com motivo para diagnóstico). */
  erros: Array<{ prefixo: string; motivo: string }>;
}

/**
 * Converte um dia hidrológico ('YYYY-MM-DD') no instante que o ancora na tabela:
 * 00:00 UTC desse dia. O dia hidrológico é uma DATA, não um instante; ancorá-lo
 * em 00:00Z dá uma chave (estacao_id, momento) estável e independente do
 * timezone do servidor.
 */
function diaHidrologicoParaMomento(data: string): Date {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano ?? 0, (mes ?? 1) - 1, dia ?? 1));
}

/**
 * Sincroniza as leituras pluviométricas automáticas das estações no período,
 * agregadas por dia hidrológico.
 *
 * @param sibh        Gateway do SIBH (fonte das medições).
 * @param leiturasRepo Repositório de leituras (upsert em lote idempotente).
 * @param estacoes    Estações a sincronizar (id local + prefixo do SIBH).
 * @param desde       Início do período (inclusivo, nível de dia no SIBH).
 * @param ate         Fim do período (inclusivo, nível de dia no SIBH).
 */
export async function sincronizarLeiturasPluviometricas(
  sibh: SibhGateway,
  leiturasRepo: LeiturasPluviometricasRepository,
  estacoes: EstacaoAlvoLeitura[],
  desde: Date,
  ate: Date,
): Promise<ResumoSyncLeituras> {
  const resumo: ResumoSyncLeituras = {
    estacoesProcessadas: 0,
    estacoesSemPrefixo: 0,
    medicoesRecebidas: 0,
    linhasGravadas: 0,
    erros: [],
  };

  for (const estacao of estacoes) {
    const prefixo = estacao.prefixo?.trim();
    if (!prefixo) {
      resumo.estacoesSemPrefixo += 1;
      continue;
    }

    try {
      const medicoes = await sibh.medicoesPorPrefixo(prefixo, desde, ate);
      resumo.medicoesRecebidas += medicoes.length;

      // Agrega por dia hidrológico (descarta carimbos malformados e soma os mm
      // do dia). Cada dia vira UMA linha com o total no canal automático.
      const agregadas = agregarDiario(medicoes);
      const leituras: UpsertLeituraPluviometrica[] = agregadas.map((dia) => ({
        estacaoId: estacao.id,
        momento: diaHidrologicoParaMomento(dia.data),
        automaticoMm: dia.totalMm,
        // Só o canal automático: a leitura manual vem de operador depois.
        manualMm: 0,
      }));

      const gravadas = await leiturasRepo.upsertLote(leituras);
      resumo.linhasGravadas += gravadas;
      resumo.estacoesProcessadas += 1;
    } catch (e) {
      // Tolera falha por estação: registra o motivo e segue o lote.
      resumo.erros.push({
        prefixo,
        motivo: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return resumo;
}
