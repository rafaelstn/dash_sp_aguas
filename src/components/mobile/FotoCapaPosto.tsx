'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { comprimirImagemParaDataUrl } from '@/lib/imagem';

const MAX_BYTES = 5 * 1024 * 1024;

interface CapaResposta {
  url: string | null;
  tiradaEm: string | null;
  idadeDias: number | null;
  precisaAtualizar: boolean;
}

type Estado =
  | { kind: 'carregando' }
  | { kind: 'pronto'; capa: CapaResposta }
  | { kind: 'erro'; mensagem: string };

/**
 * Foto de capa do posto no app. Mostra a capa atual (signed URL); se faltar ou
 * tiver mais de 1 ano, destaca a sugestão de atualizar (não obrigatório). A
 * captura usa a câmera traseira, comprime no cliente e envia via
 * POST /api/app/postos/[prefixo]/foto.
 */
export function FotoCapaPosto({ prefixo }: { prefixo: string }) {
  const [estado, setEstado] = useState<Estado>({ kind: 'carregando' });
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const resp = await fetch(
        `/api/app/postos/${encodeURIComponent(prefixo)}/foto`,
        { cache: 'no-store' },
      );
      if (!resp.ok) throw new Error('falha');
      const capa: CapaResposta = await resp.json();
      setEstado({ kind: 'pronto', capa });
    } catch {
      setEstado({ kind: 'erro', mensagem: 'Não foi possível carregar a foto.' });
    }
  }, [prefixo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function aoSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    setErroEnvio(null);
    const arquivo = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!arquivo) return;
    if (arquivo.size > MAX_BYTES) {
      setErroEnvio('Foto excede 5 MB. Selecione uma imagem menor.');
      return;
    }
    setEnviando(true);
    try {
      const dataUrl = await comprimirImagemParaDataUrl(arquivo, {
        maxDimensao: 1280,
        alvoBytes: 1024 * 1024,
      });
      const resp = await fetch(
        `/api/app/postos/${encodeURIComponent(prefixo)}/foto`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fotoDataUrl: dataUrl }),
        },
      );
      if (!resp.ok) throw new Error('falha no upload');
      await carregar();
    } catch {
      setErroEnvio(
        navigator.onLine
          ? 'Falha ao enviar a foto. Tente novamente.'
          : 'Sem conexão. Tente enviar quando estiver online.',
      );
    } finally {
      setEnviando(false);
    }
  }

  const capa = estado.kind === 'pronto' ? estado.capa : null;
  const precisa = capa?.precisaAtualizar ?? false;

  return (
    <section
      aria-labelledby="capa-titulo"
      className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
    >
      <h2
        id="capa-titulo"
        className="text-xs font-semibold uppercase tracking-wider text-app-fg-muted"
      >
        Foto do posto
      </h2>

      {estado.kind === 'carregando' ? (
        <div className="mt-2 h-40 w-full animate-pulse rounded bg-app-surface-2" />
      ) : null}

      {capa?.url ? (
        <div className="mt-2 space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capa.url}
            alt={`Foto de capa do posto ${prefixo}`}
            className="max-h-56 w-full rounded border border-app-border object-cover"
          />
          <p className="text-2xs text-app-fg-muted">
            Registrada há {capa.idadeDias ?? 0} dia(s).
            {precisa ? (
              <span className="ml-1 text-amber-700">Sugerimos atualizar.</span>
            ) : null}
          </p>
        </div>
      ) : estado.kind === 'pronto' ? (
        <p className="mt-2 text-sm text-app-fg-muted">
          Este posto ainda não tem foto de capa.
        </p>
      ) : null}

      {estado.kind === 'pronto' ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className={`min-h-[44px] w-full rounded px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2 disabled:opacity-60 ${
              precisa
                ? 'bg-gov-azul text-white hover:bg-gov-azul-escuro'
                : 'border border-app-border text-app-fg hover:bg-app-surface-2'
            }`}
          >
            {enviando
              ? 'Enviando foto…'
              : capa?.url
                ? 'Atualizar foto do posto'
                : 'Tirar foto do posto'}
          </button>
          <p className="mt-1 text-2xs text-app-fg-subtle">Opcional. Não bloqueia o preenchimento da ficha.</p>
        </div>
      ) : null}

      {erroEnvio ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          {erroEnvio}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={aoSelecionar}
        className="sr-only"
        aria-label="Selecionar foto do posto"
      />
    </section>
  );
}
