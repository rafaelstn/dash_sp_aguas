# Aceitação de risco em dependências, 2026-05-18

Pré compartilhamento com gestores do Governo SP. Suporte: auditoria André + Bruno.

## Vulnerabilidades aceitas

### postcss < 8.5.10, severidade moderate, GHSA-qx2v-qp2m-jg93

- **Risco**: XSS via `</style>` não escapado no output do CSS Stringify.
- **Por que aceitar**: a dependência vem como sub-dep de `next@15.5.18` (não temos acesso direto pra forçar versão patched). Único patch disponível via `npm audit fix --force` rebaixa o Next para 9.3.3 (regressão major, perde App Router, perde server components, perde Suspense, é inviável).
- **Próximo passo**: subir o Next quando a versão 16 estável que carrega `postcss >= 8.5.10` for liberada (atualmente em canary). Acompanhar [next/changelog](https://github.com/vercel/next.js/releases) mensalmente.
- **Mitigação atual**: CSP em `next.config.ts` reduz superfície de XSS; nenhum CSS dinâmico é gerado a partir de input do usuário; output do PostCSS é build time, não chega cru ao navegador em runtime; sistema não aceita upload de CSS de terceiros.
- **Decisor**: Rafael Damasceno (proprietário), 2026-05-18.

## Pendências de configuração (fora do código)

### HSTS preload

`next.config.ts` envia HSTS com `max-age=2 anos` mas sem `preload`. Inclusão na lista preload do Chromium exige:

1. Validar acesso público da URL final do projeto.
2. Submeter em [hstspreload.org](https://hstspreload.org).
3. Adicionar `preload` ao header em `next.config.ts`.

Tarefa pendente para a Rodrigo na próxima sprint, ver runbook `hsts-preload-pendencia.md` (a criar).

## Recheck

Reavaliar este documento a cada sprint. Mover entradas que ficarem patched aqui pra `dependencias-resolvidas.md`.
