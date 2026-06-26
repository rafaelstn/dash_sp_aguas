'use client';

import { useCallback, useRef, useState } from 'react';
import type { LeituraSibh } from '@/application/ports/sibh-gateway';

/** Fase do modo ao vivo (overlay de leitura). */
export type FaseAoVivo = 'ocioso' | 'carregando' | 'ok' | 'erro';

export interface EstadoAoVivo {
  /** Modo ao vivo ligado. */
  ligado: boolean;
  fase: FaseAoVivo;
  /** Mapa prefixo -> leitura (null = posto sem leitura recente). */
  leituras: Map<string, LeituraSibh | null>;
  /** Quando a última atualização bem-sucedida terminou. */
  atualizadoEm: Date | null;
}

const ESTADO_INICIAL: EstadoAoVivo = {
  ligado: false,
  fase: 'ocioso',
  leituras: new Map(),
  atualizadoEm: null,
};

/**
 * Modo "AGORA" (ao vivo) dos diagramas: busca, em lote, as leituras mais
 * recentes do SIBH para os postos vinculados e expõe um overlay EFÊMERO de
 * exibição. Não persiste nada (não usa o array de elementos nem o auto-save);
 * o editor injeta `leituras` no `data` dos nodes só para renderizar.
 *
 * `ligar(prefixos)` ativa e busca; `atualizar(prefixos)` refaz a busca; `desligar()`
 * volta ao estado salvo. Erro do endpoint é degradação graciosa (fase 'erro',
 * sem quebrar). Requisições obsoletas são descartadas por um token de geração.
 */
export function useValoresAoVivo(): {
  estado: EstadoAoVivo;
  ligar: (prefixos: string[]) => void;
  atualizar: (prefixos: string[]) => void;
  desligar: () => void;
} {
  const [estado, setEstado] = useState<EstadoAoVivo>(ESTADO_INICIAL);
  // Token de geração: cada busca incrementa; respostas de buscas antigas (ou
  // após desligar) são ignoradas, evitando aplicar dado obsoleto.
  const geracao = useRef(0);

  const buscar = useCallback(async (prefixos: string[]) => {
    const minhaGeracao = geracao.current;
    setEstado((e) => ({ ...e, ligado: true, fase: 'carregando' }));

    // Sem postos vinculados: nada a buscar, mas o modo fica ligado (os nodes
    // mostram "sem posto vinculado").
    if (prefixos.length === 0) {
      setEstado((e) =>
        minhaGeracao === geracao.current
          ? { ...e, fase: 'ok', leituras: new Map(), atualizadoEm: new Date() }
          : e,
      );
      return;
    }

    try {
      const resp = await fetch('/api/diagramas/valores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefixos }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const dados: { valores: Record<string, LeituraSibh | null> } =
        await resp.json();
      // Resposta obsoleta (nova busca disparada ou modo desligado): descarta.
      if (minhaGeracao !== geracao.current) return;
      const mapa = new Map<string, LeituraSibh | null>(
        Object.entries(dados.valores ?? {}),
      );
      setEstado((e) => ({
        ...e,
        fase: 'ok',
        leituras: mapa,
        atualizadoEm: new Date(),
      }));
    } catch {
      if (minhaGeracao !== geracao.current) return;
      setEstado((e) => ({ ...e, fase: 'erro' }));
    }
  }, []);

  const ligar = useCallback(
    (prefixos: string[]) => {
      geracao.current += 1;
      void buscar(prefixos);
    },
    [buscar],
  );

  const atualizar = useCallback(
    (prefixos: string[]) => {
      geracao.current += 1;
      void buscar(prefixos);
    },
    [buscar],
  );

  const desligar = useCallback(() => {
    // Invalida buscas em voo e zera o overlay; os nodes voltam ao valor salvo.
    geracao.current += 1;
    setEstado(ESTADO_INICIAL);
  }, []);

  return { estado, ligar, atualizar, desligar };
}
