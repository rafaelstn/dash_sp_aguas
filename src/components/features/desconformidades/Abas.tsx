'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, type KeyboardEvent } from 'react';
import type { ContagensDesconformidade } from '@/domain/desconformidade';

interface Aba {
  slug: string;
  rotulo: string;
  chaveContagem: keyof ContagensDesconformidade;
}

const ABAS: readonly Aba[] = [
  { slug: 'prefixo-principal',   rotulo: 'Prefixo principal desconforme', chaveContagem: 'prefixoPrincipal' },
  { slug: 'prefixo-ana',         rotulo: 'Prefixo ANA desconforme',       chaveContagem: 'prefixoAna' },
  { slug: 'arquivos-orfaos',     rotulo: 'Arquivos órfãos',               chaveContagem: 'arquivosOrfaos' },
  { slug: 'arquivos-malformados', rotulo: 'Arquivos malformados',          chaveContagem: 'arquivosMalformados' },
] as const;

export interface AbasProps {
  contagens: ContagensDesconformidade;
}

/**
 * Abas WAI-ARIA para a rota /desconformidades.
 * - setas esquerda/direita percorrem as abas (ciclando);
 * - Home/End vão para primeira/última;
 * - Enter ativa a aba (via navigate).
 */
export function Abas({ contagens }: AbasProps) {
  const router = useRouter();
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);

  const abaAtivaSlug =
    ABAS.find((a) => pathname?.includes(a.slug))?.slug ?? ABAS[0].slug;
  const abaAtivaIndex = ABAS.findIndex((a) => a.slug === abaAtivaSlug);

  function focarAba(indice: number) {
    const botoes = listRef.current?.querySelectorAll<HTMLAnchorElement>('[role="tab"]');
    botoes?.[indice]?.focus();
  }

  function aoPressionarTecla(e: KeyboardEvent<HTMLDivElement>) {
    const total = ABAS.length;
    const atual = abaAtivaIndex;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const prox = (atual + 1) % total;
      focarAba(prox);
      router.push(`/desconformidades/${ABAS[prox].slug}`);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const ant = (atual - 1 + total) % total;
      focarAba(ant);
      router.push(`/desconformidades/${ABAS[ant].slug}`);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focarAba(0);
      router.push(`/desconformidades/${ABAS[0].slug}`);
    } else if (e.key === 'End') {
      e.preventDefault();
      const ultimo = total - 1;
      focarAba(ultimo);
      router.push(`/desconformidades/${ABAS[ultimo].slug}`);
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Categorias de desconformidade"
      onKeyDown={aoPressionarTecla}
      className="flex flex-wrap gap-1 border-b border-gov-borda"
    >
      {ABAS.map((aba) => {
        const ativa = aba.slug === abaAtivaSlug;
        const contagem = contagens[aba.chaveContagem];
        return (
          <Link
            key={aba.slug}
            role="tab"
            aria-selected={ativa}
            aria-controls={`painel-${aba.slug}`}
            id={`aba-${aba.slug}`}
            tabIndex={ativa ? 0 : -1}
            href={`/desconformidades/${aba.slug}`}
            className={
              'px-4 py-3 border-b-2 -mb-px font-medium text-sm inline-flex items-center gap-2 ' +
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul ' +
              (ativa
                ? 'border-gov-azul text-gov-azul bg-white'
                : 'border-transparent text-gov-texto hover:border-gov-borda hover:bg-gov-superficie')
            }
          >
            <span>{aba.rotulo}</span>
            <span
              className={
                'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-semibold ' +
                (ativa ? 'bg-gov-azul text-white' : 'bg-gov-borda text-gov-texto')
              }
              aria-label={`${contagem} registros`}
            >
              {contagem.toLocaleString('pt-BR')}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
