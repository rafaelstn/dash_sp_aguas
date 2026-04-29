'use client';

import { FolderOpen } from 'lucide-react';
import { useState, type MouseEvent } from 'react';

export interface AbrirNoExplorerProps {
  /** Caminho absoluto do arquivo (Windows drive ou UNC). */
  caminhoAbsoluto: string;
  className?: string;
}

/**
 * Botão que abre o arquivo no Explorer da máquina do usuário.
 *
 * Limitações inerentes (não removíveis via código):
 *   - Chrome/Edge bloqueiam `file://` servido por `http(s)://` por segurança.
 *     Navegação fica silenciosa, sem feedback do browser.
 *   - Firefox tenta abrir mas avisa.
 *   - É impossível DETECTAR via JavaScript se o usuário tem acesso ao HD —
 *     o browser não expõe isso (seria vetor de scan de filesystem).
 *
 * Estratégia (melhor possível dentro das restrições):
 *   1. Tenta `<a href="file://...">` honesto — funciona em ambientes corporativos
 *      com `URLAllowlist` configurada (Edge empresarial DAEE/FCTH costuma ter)
 *   2. Em paralelo, copia o caminho COMPLETO do arquivo no clipboard
 *   3. Mostra toast confirmando + instrução pra colar no Win+R caso não tenha
 *      aberto sozinho
 *
 * O toast aparece em qualquer caso — vira "feedback positivo" quando abriu E
 * "instrução de fallback" quando não abriu. Sem detectar resultado, é a única
 * UX honesta.
 */
export function AbrirNoExplorer({
  caminhoAbsoluto,
  className = '',
}: AbrirNoExplorerProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileUrl = gerarFileUrl(caminhoAbsoluto);
  const titulo = `Abrir arquivo: ${caminhoAbsoluto}`;

  function aoClicar(_e: MouseEvent<HTMLAnchorElement>) {
    // Copia o caminho como rede de segurança — se o browser bloquear o file://
    // ou o usuário não tiver acesso à rede da FCTH, ele cola manualmente.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(caminhoAbsoluto)
        .then(() => {
          setFeedback(
            'Caminho copiado. Se a pasta não abriu, cole no Win+R ou na barra do Explorer.',
          );
          window.setTimeout(() => setFeedback(null), 6000);
        })
        .catch(() => {
          setFeedback(
            'Não foi possível copiar o caminho automaticamente. Verifique se o navegador permite.',
          );
          window.setTimeout(() => setFeedback(null), 6000);
        });
    }
    // Não chamamos preventDefault — deixa o browser tentar o file:// nativamente.
  }

  return (
    <span className={`relative inline-flex ${className}`}>
      <a
        href={fileUrl}
        onClick={aoClicar}
        aria-label={titulo}
        title={titulo}
        className={[
          'inline-flex h-7 w-7 items-center justify-center rounded',
          'text-app-fg-muted hover:bg-app-surface-2 hover:text-gov-azul',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul',
          'transition-colors motion-safe:duration-100',
        ].join(' ')}
      >
        <FolderOpen className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{titulo}</span>
      </a>

      {feedback ? (
        <span
          role="status"
          aria-live="polite"
          className="absolute right-0 top-full z-20 mt-1 w-72 rounded border border-gov-azul/30 bg-gov-azul-claro px-3 py-2 text-xs text-gov-azul shadow-gov-card-hover"
        >
          {feedback}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Converte caminho Windows em URL `file://`.
 *
 * - `Y:\000 Docs\arquivo.pdf`     → `file:///Y:/000%20Docs/arquivo.pdf`
 * - `\\servidor\share\arquivo`     → `file://servidor/share/arquivo`
 */
function gerarFileUrl(caminho: string): string {
  const normalizado = caminho.replace(/\\/g, '/');
  const encoded = encodeURI(normalizado)
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F');

  // Drive local (ex.: "Y:/...")
  if (/^[a-zA-Z]:/.test(encoded)) {
    return 'file:///' + encoded;
  }
  // UNC (ex.: "//servidor/share/...")
  if (encoded.startsWith('//')) {
    return 'file:' + encoded;
  }
  return 'file://' + encoded;
}
