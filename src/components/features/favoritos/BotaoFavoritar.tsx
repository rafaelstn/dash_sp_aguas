'use client';

import { useState, useTransition, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';

export interface BotaoFavoritarProps {
  prefixo: string;
  favoritadoInicial: boolean;
  /**
   * Se false, mostra tooltip "Entrar pra favoritar" e clica manda pro login.
   * Default: true (usuário autenticado — se não estiver, a UI normalmente
   * nem renderiza o botão).
   */
  autenticado?: boolean;
  /** Rótulo acessível do SR quando não favoritado. Default: "Favoritar {prefixo}". */
  rotulo?: string;
  className?: string;
}

/**
 * Botão de favoritar — SVG (sem emoji, rule governo).
 * `aria-pressed` reflete o estado. Clique dispara POST /api/favoritos/{prefixo}
 * (que alterna idempotente). Atualização otimista — se o servidor devolver
 * estado diferente, reconcilia.
 */
export function BotaoFavoritar({
  prefixo,
  favoritadoInicial,
  autenticado = true,
  rotulo,
  className = '',
}: BotaoFavoritarProps) {
  const router = useRouter();
  const [favoritado, setFavoritado] = useState(favoritadoInicial);
  const [pendente, iniciarTransicao] = useTransition();

  async function alternar(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    if (!autenticado) {
      router.push('/login?returnTo=' + encodeURIComponent(window.location.pathname));
      return;
    }

    const estadoAnterior = favoritado;
    setFavoritado(!estadoAnterior);

    iniciarTransicao(async () => {
      try {
        const resp = await fetch(`/api/favoritos/${encodeURIComponent(prefixo)}`, {
          method: 'POST',
        });
        if (resp.status === 401) {
          router.push('/login?returnTo=' + encodeURIComponent(window.location.pathname));
          setFavoritado(estadoAnterior);
          return;
        }
        if (!resp.ok) {
          setFavoritado(estadoAnterior);
          return;
        }
        const data = (await resp.json()) as { favoritado: boolean };
        setFavoritado(Boolean(data.favoritado));
        router.refresh();
      } catch {
        setFavoritado(estadoAnterior);
      }
    });
  }

  const titulo = favoritado
    ? `Remover ${prefixo} dos favoritos`
    : rotulo ?? `Favoritar ${prefixo}`;

  return (
    <button
      type="button"
      aria-pressed={favoritado}
      aria-label={titulo}
      title={titulo}
      onClick={alternar}
      disabled={pendente}
      className={
        'inline-flex items-center justify-center w-9 h-9 rounded-gov-card ' +
        'text-gov-muted hover:bg-gov-superficie hover:text-gov-azul ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul ' +
        'transition-colors motion-safe:duration-150 ' +
        (favoritado ? 'text-gov-azul ' : '') +
        'disabled:opacity-60 disabled:cursor-progress ' +
        className
      }
    >
      {favoritado ? (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M11.48 3.5l2.36 4.79 5.28.77-3.82 3.73.9 5.25-4.72-2.48-4.72 2.48.9-5.25L3.84 9.06l5.28-.77 2.36-4.79z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M11.48 3.5l2.36 4.79 5.28.77-3.82 3.73.9 5.25-4.72-2.48-4.72 2.48.9-5.25L3.84 9.06l5.28-.77 2.36-4.79z" />
        </svg>
      )}
    </button>
  );
}
