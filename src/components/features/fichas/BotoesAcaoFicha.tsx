'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export interface BotoesAcaoFichaProps {
  prefixo: string;
  fichaId: string;
}

/**
 * Botões "Editar" e "Apagar" da ficha. Apagar abre um ConfirmDialog
 * (modal próprio, sem `window.confirm()` nativo) e dispara DELETE na API.
 * Editar leva pra rota de edição (mesmo form usado em criação, só com
 * `fichaExistente` populando os campos).
 */
export function BotoesAcaoFicha({ prefixo, fichaId }: BotoesAcaoFichaProps) {
  const router = useRouter();
  const [apagando, setApagando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function apagar() {
    setErro(null);
    setApagando(true);
    try {
      const resp = await fetch(`/api/fichas/${fichaId}`, { method: 'DELETE' });
      if (!resp.ok && resp.status !== 204) {
        const body = await resp.json().catch(() => ({}));
        setApagando(false);
        throw new Error(body.erro ?? `Falha ${resp.status} ao apagar a ficha.`);
      }
      setConfirmando(false);
      router.push(`/postos/${encodeURIComponent(prefixo)}`);
      router.refresh();
    } catch (e) {
      setApagando(false);
      // Propaga para o ConfirmDialog exibir o erro e manter o modal aberto.
      throw e instanceof Error ? e : new Error('Erro de rede.');
    }
  }

  const urlImpressao = `/postos/${encodeURIComponent(prefixo)}/fichas/${fichaId}/imprimir?auto=1`;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={urlImpressao}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-gov-borda bg-white px-3 py-1.5 text-xs font-medium text-gov-texto hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Imprimir / PDF
        </a>
        <Link
          href={`/postos/${encodeURIComponent(prefixo)}/fichas/${fichaId}/editar`}
          className="rounded border border-gov-borda bg-white px-3 py-1.5 text-xs font-medium text-gov-texto hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Editar
        </Link>
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={apagando}
          className="rounded border border-gov-perigo/60 bg-white px-3 py-1.5 text-xs font-medium text-gov-perigo hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-perigo disabled:opacity-60"
        >
          {apagando ? 'Apagando…' : 'Apagar'}
        </button>
      </div>
      {erro && (
        <p role="alert" className="text-xs text-gov-perigo">
          {erro}
        </p>
      )}

      <ConfirmDialog
        aberto={confirmando}
        titulo="Apagar ficha"
        variante="perigo"
        rotuloConfirmar="Apagar ficha"
        descricao={
          <p>
            Esta ação apaga a ficha permanentemente e não pode ser desfeita.
            Deseja continuar?
          </p>
        }
        aoConfirmar={apagar}
        aoCancelar={() => setConfirmando(false)}
      />
    </div>
  );
}
