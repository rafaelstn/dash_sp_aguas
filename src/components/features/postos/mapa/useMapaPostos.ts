'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FacetasMapa, PontoMapaPosto } from '@/domain/mapa-postos';

/**
 * Carga dos postos do mapa: uma chamada a `/api/postos/mapa` por escopo.
 *
 * Classificação, busca e UGRHI filtram no navegador, sobre a lista inteira. Com
 * 5.790 postos o corpo comprimido tem 102 KB (medido pelo backend em
 * 17/09/2026), e refiltrar localmente responde a cada toque sem ida ao
 * servidor. Só o que o navegador não sabe decidir (município, bacia,
 * mantenedor, favoritos) vai como parâmetro.
 */

export interface RespostaMapa {
  readonly total: number;
  readonly semCoordenada: number;
  readonly pontos: readonly PontoMapaPosto[];
  readonly facetas: FacetasMapa;
}

export type CargaMapa =
  | { readonly situacao: 'carregando' }
  | { readonly situacao: 'erro'; readonly mensagem: string; readonly status: number | null }
  | { readonly situacao: 'pronto'; readonly dados: RespostaMapa };

function campoTexto(corpo: unknown, campo: string): string | null {
  if (!corpo || typeof corpo !== 'object' || !(campo in corpo)) return null;
  const valor = (corpo as Record<string, unknown>)[campo];
  return typeof valor === 'string' && valor.trim() ? valor : null;
}

/**
 * Mensagem de falha numa LEITURA. Em 5xx a mensagem da API não é usada: o
 * tratador comum de `falha_repositorio` fala em "gravar" e em "dados
 * preenchidos", o que não existe numa consulta (visto com o Dbfch fora do ar).
 * O código de correlação, quando vem, aparece para o suporte achar o log.
 */
export function mensagemDeLeitura(status: number, corpo: unknown): string {
  const mensagem = campoTexto(corpo, 'mensagem');
  if (status === 401) return 'Sua sessão expirou. Entre de novo para ver os postos.';
  if (status === 429) return 'Muitas consultas seguidas. Aguarde alguns segundos e tente de novo.';
  if (status === 501) {
    return mensagem ?? 'O cadastro de postos do órgão não está configurado neste ambiente.';
  }
  if (status >= 500) {
    const codigo = campoTexto(corpo, 'correlationId');
    return (
      'O banco do órgão não respondeu. Tente de novo em alguns instantes.' +
      (codigo ? ` Código para o suporte: ${codigo}.` : '')
    );
  }
  return mensagem ?? `O servidor não respondeu como esperado (HTTP ${status}).`;
}

export function useMapaPostos(parametros: string): { carga: CargaMapa; recarregar: () => void } {
  const [carga, setCarga] = useState<CargaMapa>({ situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    const controlador = new AbortController();
    setCarga({ situacao: 'carregando' });

    (async () => {
      try {
        const url = `/api/postos/mapa${parametros ? `?${parametros}` : ''}`;
        const r = await fetch(url, {
          signal: controlador.signal,
          headers: { Accept: 'application/json' },
        });
        const corpo: unknown = await r.json().catch(() => null);
        if (!ativo) return;
        if (!r.ok) {
          setCarga({ situacao: 'erro', status: r.status, mensagem: mensagemDeLeitura(r.status, corpo) });
          return;
        }
        const dados = corpo as RespostaMapa | null;
        if (!dados || !Array.isArray(dados.pontos)) {
          setCarga({ situacao: 'erro', status: r.status, mensagem: 'A resposta do servidor veio incompleta.' });
          return;
        }
        setCarga({ situacao: 'pronto', dados });
      } catch (e) {
        if (!ativo || (e instanceof DOMException && e.name === 'AbortError')) return;
        setCarga({
          situacao: 'erro',
          status: null,
          mensagem: 'Sem resposta do servidor. Confira a conexão e tente de novo.',
        });
      }
    })();

    return () => {
      ativo = false;
      controlador.abort();
    };
  }, [parametros, tentativa]);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);
  return { carga, recarregar };
}
