'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  prefixo: string;
  municipioSugerido: string;
}

/**
 * Botão rápido na lista de divergências geográficas para aplicar a
 * sugestão de município PostGIS direto em postos.municipio, sem abrir o
 * formulário completo de edição.
 *
 * 1 clique → PATCH /api/postos/[prefixo]/aceitar-municipio-ibge → refresh.
 */
export function BotaoAceitarMunicipioIbge({
  prefixo,
  municipioSugerido,
}: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    if (
      !confirm(
        `Substituir município de ${prefixo} por "${municipioSugerido}"? Esta alteração é gravada no audit trail.`,
      )
    ) {
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch(
        `/api/postos/${encodeURIComponent(prefixo)}/aceitar-municipio-ibge`,
        {
          method: 'POST',
          credentials: 'same-origin',
        },
      );
      if (!resp.ok) {
        const b = (await resp.json().catch(() => ({}))) as {
          mensagem?: string;
          erro?: string;
        };
        throw new Error(b.mensagem ?? b.erro ?? `HTTP ${resp.status}`);
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha.');
      setEnviando(false);
    }
  }

  if (erro) {
    return (
      <span className="text-2xs text-gov-perigo" title={erro}>
        Falhou
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={aceitar}
      disabled={enviando}
      className="rounded bg-green-700 px-2 py-1 text-2xs font-medium text-white hover:bg-green-800 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
      aria-label={`Aceitar município IBGE ${municipioSugerido} para ${prefixo}`}
    >
      {enviando ? 'Aplicando…' : 'Aceitar IBGE'}
    </button>
  );
}
