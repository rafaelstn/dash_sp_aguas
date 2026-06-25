'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ElementoDiagrama } from '@/domain/diagramas/tipos';
import type { EstadoSalvamento } from './IndicadorSalvamento';

/**
 * Auto-save do array de elementos com debounce. Cada chamada de `agendar`
 * reinicia o timer; ao disparar, faz PATCH /api/diagramas/[id] com
 * `{ elementos }` e reflete o estado (salvando/salvo/erro) no indicador.
 *
 * Concorrência: guarda a última versão pendente; se uma nova mudança chega
 * enquanto um PATCH está em voo, agenda de novo ao terminar (não perde escrita
 * nem sobrepõe respostas fora de ordem). Em erro, mantém pendente para retry
 * na próxima mudança e marca `erro`. Limpa o timer ao desmontar.
 */
export function useAutoSave(
  diagramaId: string,
  debounceMs = 600,
): {
  estado: EstadoSalvamento;
  agendar: (elementos: ElementoDiagrama[]) => void;
  tentarNovamente: () => void;
} {
  const [estado, setEstado] = useState<EstadoSalvamento>('ocioso');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enviando = useRef(false);
  const pendente = useRef<ElementoDiagrama[] | null>(null);
  // Última versão que entrou em envio; usada para o retry manual após erro.
  const ultimoEnviado = useRef<ElementoDiagrama[] | null>(null);

  const enviar = useCallback(
    async (elementos: ElementoDiagrama[]) => {
      enviando.current = true;
      ultimoEnviado.current = elementos;
      setEstado('salvando');
      try {
        const resp = await fetch(`/api/diagramas/${diagramaId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ elementos }),
        });
        if (!resp.ok) throw new Error('Falha ao salvar');
        // Se algo mudou durante o envio, envia a versão mais recente.
        if (pendente.current) {
          const proximo = pendente.current;
          pendente.current = null;
          void enviar(proximo);
          return;
        }
        setEstado('salvo');
      } catch {
        setEstado('erro');
      } finally {
        enviando.current = false;
      }
    },
    [diagramaId],
  );

  const agendar = useCallback(
    (elementos: ElementoDiagrama[]) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (enviando.current) {
          // PATCH em voo: guarda como pendente, dispara ao terminar.
          pendente.current = elementos;
          return;
        }
        void enviar(elementos);
      }, debounceMs);
    },
    [enviar, debounceMs],
  );

  /** Retry manual após erro: reenvia a última versão que falhou. */
  const tentarNovamente = useCallback(() => {
    if (enviando.current) return;
    const alvo = pendente.current ?? ultimoEnviado.current;
    if (alvo) void enviar(alvo);
  }, [enviar]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { estado, agendar, tentarNovamente };
}
