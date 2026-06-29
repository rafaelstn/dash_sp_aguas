/**
 * Use-case: obter as leituras de uma estação no período, com FALLBACK LAZY ao
 * SIBH quando o banco ainda não tem a série daquela estação.
 *
 * MOTIVAÇÃO: o banco só guarda uma amostra de estações sincronizadas; a maioria
 * abre vazia no painel de detalhe. O painel oficial "funciona" porque lê o SIBH
 * ao vivo. Aqui mantemos a decisão de arquitetura (persistir no banco) e ainda
 * fazemos a estação aparecer: na 1ª abertura buscamos do SIBH sob demanda,
 * agregamos por dia hidrológico e persistimos (upsert idempotente) reusando
 * `sincronizarLeiturasPluviometricas`; as próximas aberturas saem direto do
 * banco (rápido).
 *
 * Camada fina e testável: portas por injeção, sem banco nem HTTP. Tolerante a
 * falha: SIBH indisponível/lento não estoura — devolve o que houver no banco
 * (possivelmente vazio) e sinaliza no resultado. Estação sem prefixo (não
 * consultável no SIBH) também devolve o que houver, sem tentar o fallback.
 */

import type { SibhGateway } from '@/application/ports/sibh-gateway';
import type { LeiturasPluviometricasRepository } from '@/application/ports/leituras-pluviometricas-repository';
import type { LeituraPluviometrica } from '@/domain/monitor/leitura-pluviometrica';
import { sincronizarLeiturasPluviometricas } from './sincronizar-leituras-pluviometricas';

/** Estação alvo da consulta: id local + prefixo do SIBH (pode ser nulo). */
export interface EstacaoConsultaLeitura {
  id: string;
  prefixo: string | null;
}

export interface ResultadoLeiturasComFallback {
  /** Série de leituras no período, ordenada por momento crescente. */
  leituras: LeituraPluviometrica[];
  /**
   * `true` quando esta resposta foi populada por uma busca sob demanda ao SIBH
   * (1ª abertura da estação). Apenas para observabilidade; não muda o shape da
   * série devolvida.
   */
  origemFallbackSibh: boolean;
  /**
   * `true` quando o fallback ao SIBH foi tentado mas falhou (indisponível/lento
   * ou erro por estação). A resposta ainda é válida: traz o que houver no banco.
   */
  fallbackFalhou: boolean;
}

/**
 * Lê as leituras do banco no período; se vazio e a estação for consultável,
 * busca do SIBH sob demanda, persiste e relê.
 *
 * @param sibh         Gateway do SIBH (fonte das medições).
 * @param leiturasRepo Repositório de leituras (listar + upsert idempotente).
 * @param estacao      Estação alvo (id local + prefixo do SIBH).
 * @param desde        Início do período (inclusivo).
 * @param ate          Fim do período (inclusivo).
 * @param onFallback   Callback opcional de observabilidade do fallback (log).
 */
export async function obterLeiturasComFallback(
  sibh: SibhGateway,
  leiturasRepo: LeiturasPluviometricasRepository,
  estacao: EstacaoConsultaLeitura,
  desde: Date,
  ate: Date,
  onFallback?: (evento: {
    medicoesRecebidas: number;
    linhasGravadas: number;
    erros: number;
  }) => void,
): Promise<ResultadoLeiturasComFallback> {
  const leituras = await leiturasRepo.listarPorEstacaoEPeriodo(
    estacao.id,
    desde,
    ate,
  );

  const prefixo = estacao.prefixo?.trim();

  // Banco já tem série, ou estação não é consultável no SIBH: devolve direto.
  if (leituras.length > 0 || !prefixo) {
    return { leituras, origemFallbackSibh: false, fallbackFalhou: false };
  }

  // Fallback lazy: busca do SIBH, agrega por dia hidrológico e persiste. O
  // use-case de sync já degrada por estação (SIBH indisponível vira
  // `resumo.erros` sem estourar). O try/catch é a 2ª linha de defesa para que
  // nada interrompa o retorno do que houver no banco.
  try {
    const resumo = await sincronizarLeiturasPluviometricas(
      sibh,
      leiturasRepo,
      [{ id: estacao.id, prefixo }],
      desde,
      ate,
    );

    onFallback?.({
      medicoesRecebidas: resumo.medicoesRecebidas,
      linhasGravadas: resumo.linhasGravadas,
      erros: resumo.erros.length,
    });

    if (resumo.linhasGravadas > 0) {
      const reLidas = await leiturasRepo.listarPorEstacaoEPeriodo(
        estacao.id,
        desde,
        ate,
      );
      return {
        leituras: reLidas,
        origemFallbackSibh: true,
        // Houve gravação, mas o SIBH pode ter falhado em parte do lote.
        fallbackFalhou: resumo.erros.length > 0,
      };
    }

    // Sem linhas gravadas: SIBH não trouxe nada no período (estação vazia) ou
    // falhou. `fallbackFalhou` distingue os dois para o caller logar.
    return {
      leituras,
      origemFallbackSibh: false,
      fallbackFalhou: resumo.erros.length > 0,
    };
  } catch {
    // Falha inesperada do fallback não derruba a resposta.
    return { leituras, origemFallbackSibh: false, fallbackFalhou: true };
  }
}
