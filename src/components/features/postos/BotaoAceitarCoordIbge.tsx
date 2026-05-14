'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  prefixo: string;
  latSugerida: number;
  lngSugerida: number;
  deslocamentoKm: number | null;
}

/**
 * Aceita em 1 clique a coordenada sugerida pelo PostGIS (ponto mais
 * próximo da coord atual que está DENTRO do município declarado).
 */
export function BotaoAceitarCoordIbge({
  prefixo,
  latSugerida,
  lngSugerida,
  deslocamentoKm,
}: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    const desloc =
      deslocamentoKm !== null && deslocamentoKm > 0
        ? ` (deslocamento de ${deslocamentoKm.toFixed(1)}km)`
        : '';
    if (
      !confirm(
        `Mover coord do posto ${prefixo} para (${latSugerida.toFixed(4)}, ${lngSugerida.toFixed(4)})${desloc}?`,
      )
    ) {
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch(
        `/api/postos/${encodeURIComponent(prefixo)}/aceitar-coord-ibge`,
        { method: 'POST', credentials: 'same-origin' },
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
      className="rounded bg-blue-700 px-2 py-1 text-2xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
      aria-label={`Mover coord de ${prefixo} para a sugestão PostGIS`}
      title="Move pra o ponto mais próximo que está dentro do município declarado"
    >
      {enviando ? 'Aplicando…' : 'Aceitar coord'}
    </button>
  );
}
