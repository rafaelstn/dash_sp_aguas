'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Info, LogOut, User, UserX } from 'lucide-react';

export interface MenuUsuarioProps {
  nome: string | null;
  email: string;
  /** Destino do logout (preserva returnTo quando aplicável). */
  hrefSair?: string;
  /** Compacto: usado no rodapé da sidenav (sem o nome ao lado do avatar). */
  variante?: 'header' | 'sidenav';
  /**
   * Sessão sem identificação: o sistema opera sem verificar identidade
   * (ver `infrastructure/auth/acesso-sem-identidade.ts`). Troca o gatilho,
   * que deixa de ser avatar de iniciais, e o conteúdo do popover, que perde
   * Perfil e Sair.
   *
   * É variante e não componente separado de propósito: a mecânica do popover
   * (Esc, clique fora, foco no primeiro item, `aria-haspopup`,
   * `aria-expanded`, `aria-controls`) é a parte que sustenta a acessibilidade,
   * é idêntica nos dois estados e não pode divergir entre eles. Consumidor
   * único: `ChromeDashboard`.
   */
  semIdentidade?: boolean;
}

/** Deriva até 2 iniciais a partir do nome (ou do e-mail, como fallback). */
function iniciais(nome: string | null, email: string): string {
  const base = (nome && nome.trim()) || email.split('@')[0] || '?';
  const partes = base
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const primeira = partes[0] ?? '';
  if (partes.length === 1) return primeira.slice(0, 2).toUpperCase() || '?';
  const ultima = partes[partes.length - 1] ?? '';
  return ((primeira[0] ?? '') + (ultima[0] ?? '')).toUpperCase() || '?';
}

/**
 * Avatar com iniciais + dropdown de usuário (Perfil, Sair). Acessível:
 * `aria-haspopup`/`aria-expanded`, fecha com Esc e com clique fora, foca o
 * primeiro item ao abrir. Sem dependência de UI externa.
 *
 * Com `semIdentidade`, vira um selo: ícone traçado mais o texto
 * "Sem identificação", e o popover perde Perfil e Sair.
 *
 * NÃO há avatar de iniciais nesse estado, e o motivo é concreto: `iniciais()`
 * sobre "Acesso sem identificação" pega a primeira e a última palavra e produz
 * "AI". Num círculo azul isso lê como uma pessoa chamada A. I. e, num sistema
 * de governo, lê como inteligência artificial. O selo mostra um ESTADO; ele
 * não fabrica um nome.
 *
 * "Sair" não fica desabilitado com explicação: ele SOME. Controle desabilitado
 * anuncia uma capacidade que não existe, convida ao clique, e alguém acaba
 * reabilitando "porque estava lá". Sem sessão, ele ainda redirecionaria para
 * `/login`, que também não faz nada, fechando um laço. O lugar não fica vazio:
 * a pessoa procura "Sair" por hábito, então o popover responde a pergunta dela
 * com uma afirmação, não com um botão.
 */
export function MenuUsuario({
  nome,
  email,
  hrefSair = '/auth/sair',
  variante = 'header',
  semIdentidade = false,
}: MenuUsuarioProps) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const primeiroItemRef = useRef<HTMLAnchorElement>(null);
  const menuId = useId();
  const rotulo = nome ?? email;
  // Só usada no estado identificado; ver o docblock sobre o "AI".
  const sigla = semIdentidade ? '' : iniciais(nome, email);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAberto(false);
        // Devolve o foco ao gatilho (o popover não é um menu ARIA com
        // navegação por setas; é um conjunto de links acessível por Tab).
        botaoRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    // Foca o primeiro item ao abrir.
    requestAnimationFrame(() => primeiroItemRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const gatilhoSemIdentidade = (
    <>
      <UserX className="h-4 w-4 shrink-0 text-gov-alerta" aria-hidden="true" />
      {/* Abaixo de `sm` sobra só o ícone: em 320px o rótulo quebrava em duas
          linhas e espremia a assinatura institucional em três. É `sr-only` e
          não `hidden` de propósito, porque `display: none` tiraria o texto da
          árvore de acessibilidade e o nome do botão viraria apenas "Abrir
          informações da sessão.", perdendo o fato. Visualmente a informação
          não some: em tela estreita ela está na faixa, logo acima. */}
      <span className="sr-only text-xs font-medium text-app-fg sm:not-sr-only">
        Sem identificação
      </span>
      {/* Nome acessível resultante: "Sem identificação Abrir informações da
          sessão." O texto visível entra nele, então WCAG 2.5.3 (Label in Name)
          fica satisfeito sem um `aria-label` sobrescrevendo o rótulo. */}
      <span className="sr-only">Abrir informações da sessão.</span>
    </>
  );

  const gatilhoUsuario = (
    <>
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gov-azul text-2xs font-semibold text-white"
      >
        {sigla}
      </span>
      {variante === 'sidenav' ? (
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-xs font-medium text-app-fg">
            {nome ?? email.split('@')[0]}
          </span>
          <span className="block truncate text-2xs text-app-fg-muted">
            {email}
          </span>
        </span>
      ) : (
        <span className="hidden max-w-[180px] truncate text-xs text-app-fg-muted md:inline">
          {rotulo}
        </span>
      )}
      <span className="sr-only">Abrir menu do usuário</span>
    </>
  );

  const conteudoSemIdentidade = (
    <>
      <div className="border-b border-app-border-subtle px-3 py-2">
        <p className="text-sm font-medium text-app-fg">
          Acesso sem identificação
        </p>
        <p className="mt-0.5 text-2xs text-app-fg-muted">
          Não há sessão para encerrar.
        </p>
      </div>
      <Link
        ref={primeiroItemRef}
        href="/perfil"
        onClick={() => setAberto(false)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:bg-app-surface-2 focus-visible:outline-none"
      >
        <Info className="h-4 w-4 text-app-fg-muted" aria-hidden="true" />
        Sobre este acesso
      </Link>
    </>
  );

  const conteudoUsuario = (
    <>
      <div className="border-b border-app-border-subtle px-3 py-2">
        <p className="truncate text-sm font-medium text-app-fg" title={rotulo}>
          {nome ?? email.split('@')[0]}
        </p>
        <p className="truncate text-2xs text-app-fg-muted" title={email}>
          {email}
        </p>
      </div>
      <Link
        ref={primeiroItemRef}
        href="/perfil"
        onClick={() => setAberto(false)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:bg-app-surface-2 focus-visible:outline-none"
      >
        <User className="h-4 w-4 text-app-fg-muted" aria-hidden="true" />
        Perfil
      </Link>
      <a
        href={hrefSair}
        className="flex items-center gap-2 border-t border-app-border-subtle px-3 py-2 text-sm text-gov-perigo hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sair
      </a>
    </>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-controls={menuId}
        className={[
          'flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface',
          semIdentidade
            ? 'gap-1.5 border border-app-border px-2.5 py-1.5'
            : 'gap-2 p-0.5',
        ].join(' ')}
      >
        {semIdentidade ? gatilhoSemIdentidade : gatilhoUsuario}
      </button>

      {aberto ? (
        <div
          id={menuId}
          aria-label={
            semIdentidade ? 'Informações da sessão' : 'Menu do usuário'
          }
          className={[
            'absolute z-40 mt-2 w-56 overflow-hidden rounded-gov-card border border-app-border-subtle bg-app-surface shadow-gov-card-hover',
            variante === 'sidenav' ? 'bottom-full mb-2 left-0' : 'right-0',
          ].join(' ')}
        >
          {semIdentidade ? conteudoSemIdentidade : conteudoUsuario}
        </div>
      ) : null}
    </div>
  );
}
