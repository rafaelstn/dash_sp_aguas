import type { Metadata } from 'next';
import '@/styles/globals.css';
import { SkipLink } from '@/components/a11y/SkipLink';
import { modoDemoAtivo } from '@/infrastructure/repositories';
import { AtalhosTeclado } from '@/components/layout/AtalhosTeclado';

/**
 * Nenhuma rota é prerenderizada, porque a CSP desta aplicação traz nonce por
 * requisição (`src/middleware.ts`) e o Next só propaga o nonce no HTML que ele
 * renderiza NAQUELA requisição. HTML prerenderizado em build sai sem nonce, e
 * como `script-src` usa `'strict-dynamic'` (que desabilita o `'self'`), TODO
 * script dessa página é bloqueado pelo navegador.
 *
 * Sintoma medido em 30/09/2026 na produção `dmo.spaguas.sp.gov.br`: a tela de
 * Postos (`/`) renderizava só o título, e o aplicativo de campo (`/app`) ficava
 * preso em "Carregando…", com 26 e 31 violações de CSP no console. As duas
 * respondiam HTTP 200, e por isso nem o healthcheck nem o `curl` do roteiro de
 * verificação acusaram: status não é renderização.
 *
 * O controle que separa: as rotas que já declaravam `force-dynamic` na própria
 * página ou no layout do grupo (`/painel`, `/estoque`, `/favoritos`,
 * `/diagramas`, `/desconformidades`) serviam todos os scripts COM nonce no
 * mesmo instante, logo a CSP estava correta e o que faltava era dinamicidade.
 *
 * Fica no root layout, e não página a página, porque a dinamicidade aqui era
 * acidental: as páginas do app liam o usuário por `obterUsuarioAtual()`, que
 * sob a janela `ACESSO_SEM_IDENTIDADE=sim` (ID-01) devolve o usuário sem
 * identidade ANTES de tocar os cookies. Sem leitura de cookie, o Next
 * prerenderizou. Quando o login do órgão existir, a leitura volta e o defeito
 * se esconde sozinho, que é a razão de a garantia morar na raiz e de haver
 * régua de efeito (`scripts/verificar-csp-nonce.mjs`).
 *
 * Custo: nenhum para o usuário. O middleware já responde
 * `Cache-Control: private, no-store` em toda rota que ele cobre, portanto o
 * HTML prerenderizado não estava sendo reaproveitado por ninguém.
 *
 * NÃO medido: o efeito em navegador que ignore CSP, e o tempo de resposta
 * comparado antes e depois desta mudança em produção.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ficha Técnica de Postos Hidrológicos — SP Águas - DMO',
  description:
    'Consulta consolidada de postos hidrológicos da rede SP Águas — Governo do Estado de São Paulo.',
  // O <link rel="manifest"> é emitido via tag explícita dentro do <head>
  // (abaixo) — o `metadata.manifest` do Next 15 pode chegar tarde no
  // streaming e o Lighthouse não detecta. Manter em ambos garante que
  // o link já esteja na resposta inicial.
  manifest: '/manifest.json',
  robots: { index: false, follow: false },
};

/**
 * Root layout mínimo. Apenas o necessário pra QUALQUER rota — incluindo
 * páginas públicas (`/login`, `/cadastrar`) onde o chrome do app não deve
 * aparecer.
 *
 * O chrome completo (sidenav + header + footer) vive em
 * `src/app/(dashboard)/layout.tsx` e só carrega pras rotas autenticadas.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/*
          Tags PWA emitidas explicitamente no <head> da resposta inicial.
          O Next.js Metadata API insere essas tags via streaming, o que
          não chega a tempo de auditorias automáticas (Lighthouse 10/11
          reportam "no manifest URL"). Mantemos as duas vias.
        */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1E40AF" />
        <meta name="application-name" content="SP Águas - DMO" />
        {/*
          `mobile-web-app-capable` é o nome padronizado, e o `apple-` fica como
          legado para iOS antigo. Medido em 23/09/2026 no código do Next
          instalado (`node_modules/next/dist/lib/metadata/generate/basic.js`,
          15.5.26): `appleWebApp.capable` já emite APENAS a padronizada, e o
          framework deixou de emitir a `apple-`. Aqui as duas são escritas à
          mão, pelo mesmo motivo das outras tags deste head (o streaming da
          Metadata API chega tarde para auditoria).
          Não medido: a versão mínima de iOS que dispensa a `apple-`, e o head
          servido em `/app`, onde o `appleWebApp.capable` do layout daquele
          segmento provavelmente repete a padronizada. Duas tags de mesmo nome
          e mesmo conteúdo não mudam comportamento, então a checagem fica para
          quando houver como levantar o servidor.
        */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="SP Águas - DMO" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-screen bg-app-bg text-app-fg">
        <SkipLink />
        <AtalhosTeclado />

        {modoDemoAtivo ? (
          <div
            role="status"
            aria-live="polite"
            className="border-b border-amber-300 bg-amber-50 text-amber-900"
          >
            <div className="mx-auto max-w-content px-4 py-1.5 text-xs leading-5">
              <strong className="font-semibold">Modo demonstração.</strong>{' '}
              Dados em memória — preencha{' '}
              <code className="font-mono">DATABASE_URL</code> em{' '}
              <code className="font-mono">.env.local</code> e reinicie o serviço.
            </div>
          </div>
        ) : null}

        {children}
      </body>
    </html>
  );
}
