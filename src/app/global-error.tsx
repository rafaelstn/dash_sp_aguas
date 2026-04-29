'use client';

import { useEffect } from 'react';

/**
 * Error boundary global — captura qualquer exceção que escape de páginas e
 * layouts. Renderiza HTML completo (substitui o root layout). Mensagem
 * genérica em pt-BR; o `digest` do Next vai pra logs do servidor pra
 * diagnóstico (visível em `vercel logs` ou painel).
 *
 * Sem este arquivo, Next.js mostra "Application error: a server-side
 * exception has occurred" cru — péssima impressão em demo.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Loga no console do browser pra debug em dev. Em produção, o Next
    // já transmite stack pros logs do Vercel via report-uri interno.
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          minHeight: '100vh',
          margin: 0,
          background: '#f8fafc',
          color: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '1.5rem 2rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <p
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#dc2626',
              fontWeight: 600,
              margin: 0,
            }}
          >
            Erro inesperado
          </p>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              margin: '0.25rem 0 0.75rem',
              color: '#0f172a',
            }}
          >
            Algo deu errado ao carregar a página
          </h1>
          <p style={{ color: '#475569', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>
            Tente recarregar em instantes. Se o problema persistir, informe
            o código abaixo ao administrador do sistema.
          </p>
          {error.digest ? (
            <p
              style={{
                background: '#f1f5f9',
                padding: '0.5rem 0.75rem',
                borderRadius: 4,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: '0.75rem',
                color: '#475569',
                margin: '0 0 1rem',
              }}
            >
              {error.digest}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: '#1e3a8a',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: 4,
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Tentar novamente
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                color: '#1e3a8a',
                fontSize: '0.875rem',
                fontWeight: 500,
                textDecoration: 'none',
                padding: '0.5rem 1rem',
                border: '1px solid #cbd5e1',
                borderRadius: 4,
                background: 'white',
              }}
            >
              Voltar para a página inicial
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
