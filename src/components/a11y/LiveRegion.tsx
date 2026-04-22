'use client';

/**
 * Região ARIA live polite — anuncia mudanças de estado para leitor de tela
 * (ex.: "12 resultados encontrados", "erro ao buscar"). Uso: renderizar
 * uma instância por página e atualizar o `mensagem` conforme o estado muda.
 */
export function LiveRegion({ mensagem }: { mensagem: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {mensagem}
    </div>
  );
}
