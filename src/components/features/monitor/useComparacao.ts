'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Estacao } from './tipos';

/**
 * Cesta de comparação multi-estação (Monitor).
 *
 * Guarda a lista de estações selecionadas para comparação, com add/remove/toggle,
 * limpar tudo, contador e limite. Espelha o comportamento do painel oficial
 * (useComparisonStations), adaptado ao nosso tipo `Estacao` e ao design system
 * da casa.
 *
 * Limite: o painel oficial permite comparação em lote por UGRHI (sem teto), mas
 * aqui cada estação adicionada dispara uma busca de leituras à API (com fallback
 * ao SIBH). Para não sobrecarregar a API nem poluir o gráfico, fixamos um teto
 * sensato (MAX_COMPARACAO) e avisamos ao exceder, como pediu o escopo.
 *
 * Estado em memória (não persiste): a cesta é um contexto de sessão de análise;
 * mantê-la entre reloads não foi pedido e evita herdar seleção antiga sem o
 * operador perceber. (A estrutura permite plugar localStorage no futuro.)
 */

export const MAX_COMPARACAO = 8;

export interface ResultadoToggle {
  /** Ação efetivamente aplicada. */
  acao: 'adicionada' | 'removida' | 'limite';
}

export interface UseComparacao {
  /** Estações na cesta, na ordem de inclusão (define a cor por índice). */
  estacoes: readonly Estacao[];
  /** Quantidade atual na cesta. */
  total: number;
  /** true se ainda cabe ao menos uma estação. */
  podeAdicionar: boolean;
  /** Teto de estações. */
  maximo: number;
  /** Está esta estação na cesta? */
  estaSelecionada: (id: string) => boolean;
  /** Índice da estação na cesta (-1 se não estiver). Define a cor. */
  indiceDe: (id: string) => number;
  /** Adiciona (no-op se já estiver ou se cheia). Retorna a ação aplicada. */
  adicionar: (estacao: Estacao) => ResultadoToggle;
  /** Alterna: adiciona se ausente, remove se presente. Retorna a ação. */
  alternar: (estacao: Estacao) => ResultadoToggle;
  /** Remove uma estação da cesta. */
  remover: (id: string) => void;
  /** Esvazia a cesta. */
  limpar: () => void;
}

export function useComparacao(): UseComparacao {
  const [estacoes, setEstacoes] = useState<Estacao[]>([]);

  // Índice por id para consultas O(1) de seleção/cor, recalculado quando a
  // cesta muda (lista curta; custo desprezível).
  const indicePorId = useMemo(() => {
    const m = new Map<string, number>();
    estacoes.forEach((e, i) => m.set(e.id, i));
    return m;
  }, [estacoes]);

  const estaSelecionada = useCallback(
    (id: string) => indicePorId.has(id),
    [indicePorId],
  );

  const indiceDe = useCallback(
    (id: string) => indicePorId.get(id) ?? -1,
    [indicePorId],
  );

  const adicionar = useCallback((estacao: Estacao): ResultadoToggle => {
    let acao: ResultadoToggle['acao'] = 'adicionada';
    setEstacoes((atuais) => {
      if (atuais.some((e) => e.id === estacao.id)) {
        acao = 'removida'; // já estava: tratamos como no-op idempotente
        return atuais;
      }
      if (atuais.length >= MAX_COMPARACAO) {
        acao = 'limite';
        return atuais;
      }
      acao = 'adicionada';
      return [...atuais, estacao];
    });
    return { acao };
  }, []);

  const alternar = useCallback((estacao: Estacao): ResultadoToggle => {
    let acao: ResultadoToggle['acao'] = 'adicionada';
    setEstacoes((atuais) => {
      const ja = atuais.some((e) => e.id === estacao.id);
      if (ja) {
        acao = 'removida';
        return atuais.filter((e) => e.id !== estacao.id);
      }
      if (atuais.length >= MAX_COMPARACAO) {
        acao = 'limite';
        return atuais;
      }
      acao = 'adicionada';
      return [...atuais, estacao];
    });
    return { acao };
  }, []);

  const remover = useCallback((id: string) => {
    setEstacoes((atuais) => atuais.filter((e) => e.id !== id));
  }, []);

  const limpar = useCallback(() => {
    setEstacoes([]);
  }, []);

  return {
    estacoes,
    total: estacoes.length,
    podeAdicionar: estacoes.length < MAX_COMPARACAO,
    maximo: MAX_COMPARACAO,
    estaSelecionada,
    indiceDe,
    adicionar,
    alternar,
    remover,
    limpar,
  };
}
