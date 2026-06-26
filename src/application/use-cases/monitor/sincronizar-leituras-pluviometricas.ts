/**
 * Use-case: sincronizar leituras (chuva automática) do SIBH para o banco.
 *
 * Para um período [desde, ate] e uma lista de estações já persistidas, busca as
 * medições horárias no SIBH e faz upsert idempotente em `leituras_pluviometricas`.
 * Só preenche o canal automático (`automaticoMm` = valor do logger); o canal
 * manual (`manualMm`) fica em 0, pois a leitura manual virá de operador numa
 * fase futura.
 *
 * Camada fina e testável: portas por injeção, sem banco nem HTTP. Degrada por
 * estação (falha de uma não derruba o lote). O upsert por (estacao_id, momento)
 * torna o reprocessamento da mesma janela seguro (idempotente).
 */

import type { SibhGateway } from '@/application/ports/sibh-gateway';
import type { LeiturasPluviometricasRepository } from '@/application/ports/leituras-pluviometricas-repository';
import type { UpsertLeituraPluviometrica } from '@/domain/monitor/leitura-pluviometrica';

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
  /** Total de medições recebidas do SIBH, somando todas as estações. */
  medicoesRecebidas: number;
  /** Linhas inseridas ou atualizadas no banco (resultado dos upserts). */
  linhasGravadas: number;
  /** Estações que falharam individualmente (com motivo para diagnóstico). */
  erros: Array<{ prefixo: string; motivo: string }>;
}

/**
 * Converte o momento cru do SIBH ('YYYY/MM/DD HH:mm') em `Date` (instante UTC).
 *
 * DECISAO DE TIMEZONE: o SIBH envia horário LOCAL de Brasília sem indicação de
 * fuso. Interpretamos esse horário como UTC-3 (horário padrão de Brasília, sem
 * horário de verão, abolido no Brasil desde 2019) e produzimos o instante UTC
 * correspondente. Isso garante que o mesmo carimbo do SIBH sempre vire o mesmo
 * instante, independentemente do timezone do servidor (evita o bug de
 * `new Date('2026/01/15 13:00')`, que depende do TZ da máquina). Retorna `null`
 * quando o formato é inesperado, para a medição ser descartada em vez de virar
 * um Date inválido.
 */
export function momentoSibhParaData(momento: string): Date | null {
  const match = momento
    .trim()
    .match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, ano, mes, dia, hora, minuto] = match;
  // Date.UTC monta o instante tratando os componentes como UTC; somamos 3h
  // para compensar o offset de Brasília (UTC-3): 13:00 local vira 16:00 UTC.
  const utcMs = Date.UTC(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(hora) + 3,
    Number(minuto),
  );
  const data = new Date(utcMs);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Sincroniza as leituras pluviométricas automáticas das estações no período.
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

      const leituras: UpsertLeituraPluviometrica[] = [];
      for (const medicao of medicoes) {
        const momento = momentoSibhParaData(medicao.momento);
        if (momento === null) continue; // descarta carimbo malformado
        leituras.push({
          estacaoId: estacao.id,
          momento,
          // Só o canal automático: a leitura manual vem de operador depois.
          automaticoMm: medicao.valorMm,
          manualMm: 0,
        });
      }

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
