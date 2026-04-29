'use client';

import { FolderOpen } from 'lucide-react';

export interface AbrirNoExplorerProps {
  /** Caminho absoluto do arquivo (Windows drive ou UNC). */
  caminhoAbsoluto: string;
  className?: string;
}

/**
 * Abre o Explorer na pasta onde o arquivo está salvo — link `file://` real.
 *
 * Limitações do browser:
 *   - Chrome/Edge padrão bloqueiam `file://` servido de `http(s)://` com
 *     mensagem "Not allowed to load local resource". Navegação silenciosa.
 *   - Edge empresarial (DAEE) com `URLAllowlist` configurando `file:*` ou
 *     dashboards internos em zona intranet permite.
 *   - Firefox: permite com aviso.
 *
 * Estratégia: entrega `<a href="file://...">` honesto + copia o caminho da
 * pasta no clipboard em paralelo como rede de segurança — se o browser
 * bloquear, o usuário pode colar o caminho no Win+R ou na barra do Explorer.
 *
 * Para UX perfeita (selecionar o arquivo no Explorer com `explorer /select`),
 * precisaria de um custom protocol handler registrado no Windows do usuário —
 * ver ADR pendente sobre helper nativo.
 */
export function AbrirNoExplorer({
  caminhoAbsoluto,
  className = '',
}: AbrirNoExplorerProps) {
  const pasta = caminhoAbsoluto.replace(/[\\/][^\\/]+$/, '');
  const fileUrl = gerarFileUrl(pasta);
  const titulo = `Abrir pasta no Explorer: ${pasta}`;

  function copiarSilencioso() {
    // Best-effort em paralelo à navegação — se o browser bloquear o file://,
    // o usuário ainda tem o caminho no clipboard pra colar no Win+R.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(pasta).catch(() => {});
    }
  }

  return (
    <a
      href={fileUrl}
      onClick={copiarSilencioso}
      // target="_blank" aqui atrapalha: Chrome abre aba vazia quando bloqueia
      // e dá a impressão de que abriu no Explorer. Sem target, o bloqueio é
      // silencioso e o usuário usa o caminho copiado como backup.
      aria-label={titulo}
      title={titulo}
      className={[
        'inline-flex h-7 w-7 items-center justify-center rounded',
        'text-app-fg-muted hover:bg-app-surface-2 hover:text-gov-azul',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul',
        'transition-colors motion-safe:duration-100',
        className,
      ].join(' ')}
    >
      <FolderOpen className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{titulo}</span>
    </a>
  );
}

/**
 * Converte caminho Windows em URL `file://`.
 * - `Y:\000 Docs\arquivo.pdf` → `file:///Y:/000%20Docs/arquivo.pdf`
 * - `\\servidor\share\arquivo` → `file://servidor/share/arquivo`
 */
function gerarFileUrl(caminho: string): string {
  const normalizado = caminho.replace(/\\/g, '/');
  // encodeURI preserva ":" e "/" mas escapa espaço, acentos, etc.
  // Complementa `#` e `?` que encodeURI deixa passar.
  const encoded = encodeURI(normalizado)
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F');

  // Drive local (ex.: "Y:/..."): file:/// + caminho
  if (/^[a-zA-Z]:/.test(encoded)) {
    return 'file:///' + encoded;
  }
  // UNC (ex.: "//servidor/share/..."): file: + caminho (as // já vêm)
  if (encoded.startsWith('//')) {
    return 'file:' + encoded;
  }
  // Fallback (não esperado pra paths do indexer)
  return 'file://' + encoded;
}
