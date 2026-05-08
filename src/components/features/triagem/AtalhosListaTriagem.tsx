'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Atalhos contextuais da lista de triagem (`/triagem`):
 *   j      → seleciona próxima linha
 *   k      → seleciona linha anterior
 *   Enter  → abre detalhe da linha selecionada
 *
 * Não interfere quando o foco está em campos editáveis ou em modal aberto.
 * O componente é declarativamente vazio — apenas instala o listener.
 *
 * Como achar as linhas: o componente `Tabela` renderiza cada `<tr>` com
 * o link de detalhe na primeira coluna (stretched link). Selecionamos
 * todos os `tr` que tenham `<a href>` direto descendente na 1ª célula.
 */
export function AtalhosListaTriagem() {
  const router = useRouter();
  const indiceRef = useRef<number>(-1);

  useEffect(() => {
    function emEdicao(alvo: EventTarget | null): boolean {
      if (!(alvo instanceof HTMLElement)) return false;
      const tag = alvo.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (alvo.isContentEditable) return true;
      return false;
    }

    function linhasNavegaveis(): HTMLTableRowElement[] {
      const linhas = Array.from(
        document.querySelectorAll<HTMLTableRowElement>('table tbody tr'),
      );
      return linhas.filter((tr) => tr.querySelector('a[href]'));
    }

    function destacar(idx: number) {
      const linhas = linhasNavegaveis();
      if (linhas.length === 0) return;
      const final = Math.min(Math.max(idx, 0), linhas.length - 1);
      indiceRef.current = final;
      linhas.forEach((tr, i) => {
        if (i === final) {
          tr.setAttribute('aria-selected', 'true');
          tr.classList.add('outline', 'outline-2', 'outline-gov-azul');
          tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          tr.removeAttribute('aria-selected');
          tr.classList.remove('outline', 'outline-2', 'outline-gov-azul');
        }
      });
    }

    function abrirSelecionada() {
      const linhas = linhasNavegaveis();
      const idx = indiceRef.current;
      if (idx < 0 || idx >= linhas.length) return;
      const link = linhas[idx]?.querySelector<HTMLAnchorElement>('a[href]');
      const href = link?.getAttribute('href');
      if (href) router.push(href);
    }

    function onKey(e: KeyboardEvent) {
      if (emEdicao(e.target)) return;
      // Existe diálogo modal aberto? Não toca em atalhos da lista.
      if (document.querySelector('dialog[open]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      if (e.key === 'j') {
        e.preventDefault();
        destacar(indiceRef.current < 0 ? 0 : indiceRef.current + 1);
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        destacar(indiceRef.current <= 0 ? 0 : indiceRef.current - 1);
        return;
      }
      if (e.key === 'Enter') {
        if (indiceRef.current < 0) return;
        e.preventDefault();
        abrirSelecionada();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);

  return null;
}
