'use client';

import { useEffect, useState } from 'react';
import type { PeriodoDias } from './tipos-leituras';
import type { RespostaNivel } from './tipos-nivel';

type EstadoNivel =
  | { status: 'inativo' }
  | { status: 'carregando' }
  | { status: 'erro'; mensagem: string }
  | { status: 'ok'; dados: RespostaNivel };

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
 * Busca a série diária de nível de uma estação (fluviométrica ou piezométrica)
 * para o período escolhido. Espelha `useLeiturasEstacao`: mesma lógica de
 * janela desde/ate, abort da requisição anterior ao trocar de período e ao
 * fechar o painel (estacaoId = null), e os mesmos estados.
 *
 * A rota responde 409 para estações pluviométricas (que não têm nível). O
 * painel só ativa este hook para flu/piezo, mas tratamos o 409 com mensagem
 * clara como defesa em profundidade.
 */
export function useNivelEstacao(
  estacaoId: string | null,
  periodoDias: PeriodoDias,
): EstadoNivel {
  const [estado, setEstado] = useState<EstadoNivel>({ status: 'inativo' });

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
        )}/nivel?desde=${desde}&ate=${ate}`;
        const resp = await fetch(url, {
          signal: controlador.signal,
          headers: { Accept: 'application/json' },
        });
        if (resp.status === 409) {
          throw new Error(
            'Esta estação não fornece série de nível (a série de nível é exclusiva de estações fluviométricas e piezométricas).',
          );
        }
        if (!resp.ok) {
          throw new Error(`Falha ao carregar a série de nível (HTTP ${resp.status}).`);
        }
        const dados = (await resp.json()) as RespostaNivel;
        if (!ativo) return;
        setEstado({ status: 'ok', dados });
      } catch (e) {
        if (!ativo || controlador.signal.aborted) return;
        setEstado({
          status: 'erro',
          mensagem:
            e instanceof Error
              ? e.message
              : 'Não foi possível carregar a série de nível desta estação.',
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
