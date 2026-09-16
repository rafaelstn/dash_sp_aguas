'use client';

import { createContext, useContext, type ReactNode } from 'react';

/** Id da frase única, no layout, que explica por que o botão está desabilitado. */
export const ID_NOTA_REVISAO_INDISPONIVEL = 'nota-revisao-indisponivel';

/**
 * Padrão `true`: sem provedor o botão envia, e o 403 do servidor continua
 * tratado. O servidor é quem decide; isto só evita o clique que já se sabe inútil.
 */
const ContextoRevisao = createContext(true);

export function RevisaoDisponibilidade({
  disponivel,
  children,
}: {
  disponivel: boolean;
  children: ReactNode;
}) {
  return <ContextoRevisao.Provider value={disponivel}>{children}</ContextoRevisao.Provider>;
}

export function useRevisaoDisponivel(): boolean {
  return useContext(ContextoRevisao);
}
