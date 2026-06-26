'use client';

import { useEffect, useState } from 'react';
import type { PeriodoDias, RespostaLeituras } from './tipos-leituras';

type EstadoLeituras =
  | { status: 'inativo' }
  | { status: 'carregando' }
  | { status: 'erro'; mensagem: string }
  | { status: 'ok'; dados: RespostaLeituras };

/** Formata uma data no formato YYYY-MM-DD (parâmetro da API), no fuso local. */
function paraDataISO(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Calcula a janela [desde, ate] cobrindo os últimos `dias` dias, incluindo hoje. */
function janela(dias: PeriodoDias): { desde: string; ate: string } {
  const ate = new Date();
  const desde = new Date();
  // dias - 1: a janela inclui hoje. Ex.: 7 dias = hoje + 6 anteriores.
  desde.setDate(desde.getDate() - (dias - 1));
  return { desde: paraDataISO(desde), ate: paraDataISO(ate) };
}

/**
 * Busca as leituras diárias de uma estação para o período escolhido.
 *
 * Refaz a busca quando `estacaoId` ou `periodoDias` mudam. Aborta a requisição
 * anterior ao trocar de período (evita race de respostas fora de ordem) e ao
 * fechar o painel (estacaoId = null).
 */
export function useLeiturasEstacao(
  estacaoId: string | null,
  periodoDias: PeriodoDias,
): EstadoLeituras {
  const [estado, setEstado] = useState<EstadoLeituras>({ status: 'inativo' });

  useEffect(() => {
    if (!estacaoId) {
      setEstado({ status: 'inativo' });
      return;
    }

    let ativo = true;
    const controlador = new AbortController();
    const { desde, ate } = janela(periodoDias);

    async function carregar() {
      setEstado({ status: 'carregando' });
      try {
        const url = `/api/monitor/estacoes/${encodeURIComponent(
          estacaoId as string,
        )}/leituras?desde=${desde}&ate=${ate}`;
        const resp = await fetch(url, {
          signal: controlador.signal,
          headers: { Accept: 'application/json' },
        });
        if (!resp.ok) {
          throw new Error(`Falha ao carregar as leituras (HTTP ${resp.status}).`);
        }
        const dados = (await resp.json()) as RespostaLeituras;
        if (!ativo) return;
        setEstado({ status: 'ok', dados });
      } catch (e) {
        if (!ativo || controlador.signal.aborted) return;
        setEstado({
          status: 'erro',
          mensagem:
            e instanceof Error
              ? e.message
              : 'Não foi possível carregar as leituras desta estação.',
        });
      }
    }

    carregar();
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, [estacaoId, periodoDias]);

  return estado;
}
