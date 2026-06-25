# Módulo `/app/*` — App móvel PWA (Sprint 1 da Fase 2.A)

Este route group contém o **shell** do aplicativo móvel do técnico de
campo. A implementação real dos formulários e da listagem de submissões
acontece em sprints subsequentes.

| Item | Status |
|------|--------|
| Stack PWA | `@serwist/next@9.5.11` (escolhido sobre `next-pwa` por compat com Next 15.5 + App Router) |
| Manifest | `public/manifest.json` (escopo `/app/`, start_url `/app`) |
| Service Worker | gerado a partir de `src/app/sw.ts` em build de produção, servido como `/sw.js` |
| Layout dedicado | `src/app/app/layout.tsx` (sem sidenav, com bottom nav) |
| Rotas | home, busca de posto, shell de formulário, minhas-fichas, perfil |
| Ícones | placeholder gerados por `scripts/build/gerar-icones-placeholder.mjs` |

ADR de referência: `docs/adr/0007-app-mobile-pwa-capacitor.md`.
Spec: `docs/spec-modulo-mobile.md`.
Checklist de segurança: `docs/seguranca/checklist-modulo-mobile.md`.

---

## Estrutura

```
src/app/app/
├── layout.tsx                                 // chrome mobile + SW + install prompt
├── page.tsx                                   // home: grade de tipos de ficha
├── postos/
│   ├── page.tsx                               // shell de busca de posto
│   ├── BuscaPostosMobile.tsx                  // client component (debounce + fetch)
│   └── [prefixo]/fichas/nova/[tipo]/page.tsx  // shell do formulário (Sprint 3)
├── minhas-fichas/page.tsx                     // placeholder (aguarda backend triagem)
├── perfil/page.tsx                            // identidade + sair
└── README.md                                  // este arquivo

src/components/mobile/
├── BottomNav.tsx                  // bottom nav 3 abas
├── CardTipoFicha.tsx              // card de tipo na home
├── HeaderMobile.tsx               // header sticky com voltar/ações
├── InstallPWAPrompt.tsx           // prompt iOS-aware + beforeinstallprompt
└── RegistrarServiceWorker.tsx     // registra /sw.js com escopo /app/

src/app/sw.ts                       // service worker custom (estratégias do ADR-0007)
public/manifest.json                // manifest da PWA
public/icons/icon-{192,512}.png     // ícones placeholder (descartáveis)
public/icons/icon-maskable-512.png  // maskable safe-zone
public/apple-touch-icon.png         // 180x180 iOS
scripts/build/gerar-icones-placeholder.mjs  // gerador dos ícones
```

---

## Como rodar localmente

PWA exige **HTTPS** ou **localhost** (browser bloqueia SW em outros casos).

```bash
# Dev (SW desativado por design no @serwist/next em desenvolvimento)
npm run dev
# Acesse http://localhost:3000/app
```

Em dev, o `RegistrarServiceWorker` tenta registrar mas o `/sw.js` não é
gerado pelo `next dev` — isso é esperado. Para **testar a PWA de
verdade**:

```bash
npm run pwa:build      # equivale a `next build`
npm run start          # serve na porta 3000
# Em outra aba:
npm run pwa:audit      # roda Lighthouse contra http://localhost:3000/app
```

O relatório do Lighthouse fica em `docs/relatorios/lighthouse-pwa.html`.

---

## Como testar como PWA

1. Build de produção (`npm run pwa:build && npm run start`).
2. Chrome DevTools → **Application**:
   - **Manifest**: precisa listar nome, ícones (3), start_url `/app`,
     scope `/app/`, display `standalone`, theme_color `#1E40AF`.
   - **Service Workers**: `/sw.js` registrado com escopo `/app/`,
     status `activated`.
   - **Cache Storage**: ao navegar, populam `spaguas-app-estaticos-v1`,
     `spaguas-app-paginas-v1`, etc.
3. **Lighthouse → PWA**: meta de score ≥ 90 nesta sprint.
4. Em mobile real (Android Chrome ou iOS Safari):
   - Android: aparece o prompt nativo de instalação (`InstallPWAPrompt`
     intercepta `beforeinstallprompt`).
   - iOS: o `InstallPWAPrompt` exibe instruções para "Adicionar à Tela
     de Início" via Safari.

---

## O que está pendente para Fernanda (Sprint 3)

| Item | Local | Observação |
|------|-------|-----------|
| Renderer dinâmico do formulário | `src/app/app/postos/[prefixo]/fichas/nova/[tipo]/page.tsx` | Hoje é shell. Ler `SCHEMAS_FICHA[codigo].secoes` e gerar widgets por tipo. |
| Ícone definitivo da PWA | `public/icons/*` | Os atuais são placeholder gerados por script (texto "SPÁ" sobre fundo azul). Substituir por arte oficial 192/512/maskable + apple-touch-icon. |
| Paleta final (se mudar) | `src/styles/globals.css` + `manifest.json` `theme_color` | Hoje usa `#1E40AF` (`gov-azul`). Sincronizar caso design entregue novo. |
| Ícone temático por tipo de ficha | `src/components/mobile/CardTipoFicha.tsx` | Hoje exibe número do código (01..07). Substituir por SVG temático. |
| Copy descritiva dos cards | `src/app/app/page.tsx` | Texto institucional final em `DESCRICOES_TIPO_FICHA` (Camila — auditoria Sprint 1.S3). Atualizar apenas em caso de mudança de escopo. |
| Listagem em "Minhas fichas" | `src/app/app/minhas-fichas/page.tsx` | Aguarda Lucas entregar `/api/triagem/minhas-fichas` (Sprint 1 backend). |
| GPS / consentimento | _(novo)_ | Conforme spec §2.1 e checklist André §10 (pendência 4) — telinha de consentimento explícito antes da primeira captura. |
| Rascunho local + fila offline | `src/infrastructure/storage/*` | Sprint 4. Não no escopo desta semana. |

---

## Fora de escopo (declarado)

- **Capacitor / APK Android** → Fase 2.B (ADR-0007 §2.4).
- **iOS empacotado** → futuro, depende de conta Apple Developer.
- **Background Sync API** → backlog (ADR-0007 §2.3).
- **Push notifications** → backlog.
- **Cache offline de postos (2.484 entradas)** → grande demais pro MVP.

---

## Estratégias de cache do Service Worker

Conforme ADR-0007 §"Estratégias de cache" e checklist André
§"Hardening do PWA" (9 itens aplicados no `src/app/sw.ts`):

| Padrão de URL | Estratégia | Justificativa |
|---------------|------------|---------------|
| `/api/auth/*`, `/api/triagem/*`, `/login`, `/cadastrar` | **NetworkOnly** | Credenciais e decisões críticas — nunca stale. |
| `/api/*` (GET) | **NetworkFirst** (timeout 3s, TTL 5min) | UX rápida quando online, cache temporário pra reuso. |
| `/_next/static/*`, `/manifest.json` | **CacheFirst** (TTL 30 dias) | Estáticos hashados invalidam por nome. |
| Imagens | **CacheFirst** (TTL 30 dias) | Ícones e logo. |
| Páginas `/app/*` (navegação) | **StaleWhileRevalidate** (TTL 1 dia) | Snappy + atualização em background. |

### Itens de hardening aplicados (checklist André §"Hardening do PWA")

1. ✓ Skip waiting controlado (não auto-ativa SW novo).
2. ✓ Não cacheia respostas com `Set-Cookie` (plugin `naoCachearSetCookie`).
3. ✓ NetworkOnly em `/api/auth/*` e `/api/triagem/*`.
4. ✓ CSP restrito em `/app/*` via `next.config.ts` (sem `unsafe-eval`,
   `worker-src 'self'`, `frame-ancestors 'none'`).
5. ✓ `postMessage` only same-origin (handler valida `event.origin`).
6. ✓ Caches versionados (`spaguas-app-*-v1`) — bump em update major.
7. ✓ Activate limpa caches fora da versão atual.
8. ✓ Precache exclui rotas sensíveis (`/api/auth`, `/api/triagem`,
   `/admin`, `/triagem`) via `exclude` do `withSerwistInit`.
9. ✓ Fail-open: erros de SW não bloqueiam navegação (sem catchHandler
   global; `RegistrarServiceWorker` em try/catch silencioso).

---

**Bruno — PO Engenharia**
**Damasceno Dev OS · Sprint 1 da Fase 2.A · 2026-05-08**
