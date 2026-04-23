'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Exibe um caminho UNC copiável. Nunca abre o arquivo (fora de escopo no MVP).
 * O botão "Copiar" usa navigator.clipboard; em caso de falha, oferece fallback
 * selecionando o texto.
 */
export function CaminhoRede({ caminho }: { caminho: string }) {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(caminho);
      setCopiado(true);
      setErro(null);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar automaticamente. Selecione o texto manualmente.');
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <code className="flex-1 bg-gov-superficie border border-gov-borda rounded px-2 py-1 font-mono text-sm break-all">
        {caminho}
      </code>
      <Button type="button" variante="secundario" onClick={copiar} aria-label={`Copiar caminho ${caminho}`}>
        {copiado ? 'Copiado' : 'Copiar'}
      </Button>
      {erro && (
        <span role="alert" className="text-sm text-gov-perigo">
          {erro}
        </span>
      )}
    </div>
  );
}
