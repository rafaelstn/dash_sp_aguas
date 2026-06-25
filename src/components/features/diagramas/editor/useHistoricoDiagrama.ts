'use client';

import { useCallback, useRef, useState } from 'react';
import type { ElementoDiagrama } from '@/domain/diagramas/tipos';
import {
  criarHistorico,
  desfazer as desfazerHistorico,
  empilhar,
  podeDesfazer as historicoPodeDesfazer,
  podeRefazer as historicoPodeRefazer,
  refazer as refazerHistorico,
  type Historico,
} from './historico';

/**
 * Encapsula o histórico de undo/redo do editor de diagramas sobre o array de
 * elementos. O presente é sempre o último estado confirmado; `versao` força o
 * re-render para os flags `podeDesfazer`/`podeRefazer` reagirem. Em desfazer/
 * refazer, chama `aoRestaurar` com o presente para o editor aplicar nodes e
 * disparar o auto-save. Extraído de `EditorDiagrama` (ARCH-7).
 */
export function useHistoricoDiagrama(
  inicial: ElementoDiagrama[],
  aoRestaurar: (elementos: ElementoDiagrama[]) => void,
) {
  const ref = useRef<Historico<ElementoDiagrama[]>>(criarHistorico(inicial));
  const [versao, setVersao] = useState(0);

  /** Confirma um novo estado como passo de undo. */
  const registrar = useCallback((proximos: ElementoDiagrama[]) => {
    ref.current = empilhar(ref.current, proximos);
    setVersao((v) => v + 1);
  }, []);

  const desfazer = useCallback(() => {
    if (!historicoPodeDesfazer(ref.current)) return;
    ref.current = desfazerHistorico(ref.current);
    setVersao((v) => v + 1);
    aoRestaurar(ref.current.presente);
  }, [aoRestaurar]);

  const refazer = useCallback(() => {
    if (!historicoPodeRefazer(ref.current)) return;
    ref.current = refazerHistorico(ref.current);
    setVersao((v) => v + 1);
    aoRestaurar(ref.current.presente);
  }, [aoRestaurar]);

  // `versao` força o recálculo dos flags após cada registrar/desfazer/refazer.
  void versao;
  return {
    registrar,
    desfazer,
    refazer,
    podeDesfazer: historicoPodeDesfazer(ref.current),
    podeRefazer: historicoPodeRefazer(ref.current),
  };
}
