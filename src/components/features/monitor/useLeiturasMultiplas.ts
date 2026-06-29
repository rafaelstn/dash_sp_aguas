'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Estacao } from './tipos';
import type {
  LeituraDiaria,
  PeriodoDias,
  RespostaLeituras,
} from './tipos-leituras';

/**
 * Busca as leituras diárias de VÁRIAS estações para a comparação multi-estação.
 *
 * Reusa o MESMO endpoint do painel de detalhe
 * (GET /api/monitor/estacoes/{id}/leituras?desde=&ate=), uma chamada por
 * estação, em paralelo. Cada chamada dispara o fallback ao SIBH no servidor se
 * o banco estiver vazio, exatamente como o painel individual.
 *
 * Tolerância a erro (requisito do escopo): uma estação que falhar NÃO derruba o
 * resto. O resultado traz, por estação, status ok/erro; o gráfico e a tabela
 * usam só as que carregaram, e a UI lista as que falharam.
 */

/** Formata uma data como YYYY-MM-DD no fuso local (parâmetro da API). */
function paraDataISO(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Janela [desde, ate] cobrindo os últimos `dias` dias, incluindo hoje. */
function janela(dias: PeriodoDias): { desde: string; ate: string } {
  const ate = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  return { desde: paraDataISO(desde), ate: paraDataISO(ate) };
}

/** Resultado da busca de UMA estação. */
export interface ResultadoEstacao {
  estacaoId: string;
  status: 'ok' | 'erro';
  itens: readonly LeituraDiaria[];
  mensagemErro?: string;
}

/** Uma linha da série unificada: um dia, com o valor automático por estação. */
export interface DiaComparacao {
  /** Data do dia (YYYY-MM-DD), chave de agrupamento. */
  data: string;
  /** mm automático por estacaoId. Ausente quando a estação não tem o dia. */
  porEstacao: Record<string, number>;
}

export interface EstadoLeiturasMultiplas {
  carregando: boolean;
  /** Resultado individual por estação (inclui as que falharam). */
  resultados: readonly ResultadoEstacao[];
  /** Série diária unificada, em ordem cronológica crescente. */
  dias: readonly DiaComparacao[];
  /** IDs das estações que carregaram com sucesso E têm ao menos um dia. */
  estacoesComDados: readonly string[];
  /** IDs das estações que falharam na busca. */
  estacoesComErro: readonly string[];
}

/** Extrai o dia (YYYY-MM-DD) de um ISO, no fuso local. */
function diaDoIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return paraDataISO(d);
}

/**
 * Monta a série diária unificada a partir dos resultados por estação.
 * Une todos os dias presentes em qualquer estação e, para cada dia, registra o
 * total automático de cada estação que o tiver.
 */
function unificarDias(resultados: readonly ResultadoEstacao[]): DiaComparacao[] {
  const porData = new Map<string, DiaComparacao>();

  for (const r of resultados) {
    if (r.status !== 'ok') continue;
    for (const item of r.itens) {
      const data = diaDoIso(item.momento);
      let linha = porData.get(data);
      if (!linha) {
        linha = { data, porEstacao: {} };
        porData.set(data, linha);
      }
      linha.porEstacao[r.estacaoId] = item.automaticoMm;
    }
  }

  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Busca, em paralelo, as leituras de todas as `estacoes` para o `periodo`.
 * Refaz quando muda o conjunto de IDs ou o período. Aborta em troca/desmontagem.
 */
export function useLeiturasMultiplas(
  estacoes: readonly Estacao[],
  periodo: PeriodoDias,
): EstadoLeiturasMultiplas {
  const [carregando, setCarregando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoEstacao[]>([]);

  // Chave estável das estações: refaz a busca só quando o CONJUNTO de ids muda,
  // não a cada novo array com os mesmos ids.
  const idsChave = useMemo(
    () => estacoes.map((e) => e.id).join('|'),
    [estacoes],
  );

  useEffect(() => {
    const ids = idsChave ? idsChave.split('|') : [];
    if (ids.length === 0) {
      setResultados([]);
      setCarregando(false);
      return;
    }

    let ativo = true;
    const controlador = new AbortController();
    const { desde, ate } = janela(periodo);

    async function carregar() {
      setCarregando(true);

      const promessas = ids.map(async (id): Promise<ResultadoEstacao> => {
        try {
          const url = `/api/monitor/estacoes/${encodeURIComponent(
            id,
          )}/leituras?desde=${desde}&ate=${ate}`;
          const resp = await fetch(url, {
            signal: controlador.signal,
            headers: { Accept: 'application/json' },
          });
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }
          const dados = (await resp.json()) as RespostaLeituras;
          return { estacaoId: id, status: 'ok', itens: dados.itens ?? [] };
        } catch (e) {
          // Aborto não é erro de dado: deixa o catch externo limpar o estado.
          if (controlador.signal.aborted) {
            return { estacaoId: id, status: 'erro', itens: [] };
          }
          return {
            estacaoId: id,
            status: 'erro',
            itens: [],
            mensagemErro:
              e instanceof Error
                ? e.message
                : 'Falha ao carregar as leituras.',
          };
        }
      });

      const lista = await Promise.all(promessas);
      if (!ativo || controlador.signal.aborted) return;
      setResultados(lista);
      setCarregando(false);
    }

    carregar();
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, [idsChave, periodo]);

  const dias = useMemo(() => unificarDias(resultados), [resultados]);

  const estacoesComDados = useMemo(
    () =>
      resultados
        .filter((r) => r.status === 'ok' && r.itens.length > 0)
        .map((r) => r.estacaoId),
    [resultados],
  );

  const estacoesComErro = useMemo(
    () => resultados.filter((r) => r.status === 'erro').map((r) => r.estacaoId),
    [resultados],
  );

  return {
    carregando,
    resultados,
    dias,
    estacoesComDados,
    estacoesComErro,
  };
}
