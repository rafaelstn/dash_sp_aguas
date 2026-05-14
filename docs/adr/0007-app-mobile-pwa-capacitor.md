# ADR-0007 — App mobile como PWA progressivo + Capacitor para empacotamento nativo

| Campo | Valor |
|-------|-------|
| Status | Proposto — 2026-05-08 |
| Autor | Damasceno Dev OS (Bruno — Engenharia) |
| Contexto | Módulo mobile do Sistema de Ficha Técnica de Postos Hidrológicos SPÁguas — Fase 2.A |
| Substitui / complementa | ADR-0001 (stack inicial); ADR-0002 (cliente PG); ADR-0006 (auth) |
| Referências | `docs/spec-modulo-mobile.md`; `docs/architecture.md`; ADR-0008 (triagem) |

---

## 1. Contexto

A Fase 2.A introduz dois atores novos:

1. **Técnico de campo** — preenche fichas de inspeção/manutenção/medição em campo, em dispositivo móvel.
2. **Agente aprovador** — triagem das fichas submetidas, na web (mesma base do dashboard atual).

Para o técnico, é necessário um **app mobile**. As opções consideradas vão de "site responsivo simples" até "app nativo Android/iOS dedicado". A pré-condição imposta pelo Rafael é: **entrega rápida primeiro, empacotamento APK depois, iOS futuro**, sem reescrever a base.

A stack atual (Next.js 15 App Router + Supabase Auth + postgres-js) e os schemas Zod canônicos em `src/domain/fichas/schemas.ts` (760 linhas, 7 tipos de ficha) são reutilizáveis — duplicar essa lógica em codebase mobile separado é proibido pela regra de governo (`rules/padrao.md` — sem duplicação).

## 2. Decisão

**Manter um único projeto Next.js. Tratar o app como uma camada de rotas isoladas (`/app/*`) com PWA de primeira classe, e usar Capacitor (apenas) para empacotar quando precisar de APK/iOS.**

Componentes da decisão:

### 2.1 Estrutura de rotas

- **Web atual**: tudo sob `/(dashboard)/*`, `/login`, `/cadastrar`, `/auth/*`, `/api/*` (incluindo `/triagem` da ADR-0008).
- **App mobile**: novo route group `src/app/app/(mobile)/*` com layout próprio, sem sidenav, mobile-first absoluto.
  - `app/app/page.tsx` → home com grade de cards de tipo de ficha.
  - `app/app/postos/page.tsx` → busca de posto.
  - `app/app/fichas/[codigo]/[prefixo]/page.tsx` → formulário dinâmico.
  - `app/app/minhas-fichas/page.tsx` → lista do técnico.
  - `app/app/login/page.tsx` → fluxo dedicado (mantém o mesmo backend de auth, layout otimizado para mobile).
- **Manifest e SW** servidos pela mesma origem. Manifest define `start_url: '/app'` e `scope: '/app/'` — instalação pelo Add-to-Home-Screen abre direto na home do app.
- **Middleware** (`src/middleware.ts`) já trata auth para `/app/*` igual ao resto (mesma `obterUsuarioAtual`). Sem fork de auth.

### 2.2 PWA — `next-pwa` (ou implementação manual fina)

| Item | Decisão |
|------|---------|
| Lib | `next-pwa@5+` para gerar service worker via Workbox. Avaliação: se conflitar com Turbopack ou App Router (problemas conhecidos em versões antigas), trocar por implementação manual de SW + `manifest.webmanifest` estático. **Este ADR autoriza ambos os caminhos** — escolha final por Rodrigo no momento da implementação, com justificativa em commit. |
| Manifest | `public/manifest.webmanifest` com `name`, `short_name`, `start_url: '/app'`, `display: 'standalone'`, `theme_color`, `background_color`, ícones 192/512px gerados a partir do logo SPÁguas. |
| Service Worker | Estratégia: **NetworkFirst** para `/api/*` com fallback offline; **CacheFirst com revalidate** para assets estáticos (`_next/static/*`, ícones, fontes); **NetworkOnly** para auth (login, callback) — nunca cachear. |
| Escopo | Service Worker registrado apenas em `/app/*` para não interferir no dashboard web. Implementado via guard no registrador. |
| Versionamento | Cache name inclui hash do build (`spaguas-app-v${BUILD_HASH}`), garantindo invalidação em deploy novo. SW força `clients.claim()` + skipWaiting para o usuário pegar a versão nova ao reabrir. |
| Notificação de update | Banner discreto "nova versão disponível — atualize" com botão; sem auto-reload silencioso. |

### 2.3 Estratégia offline mínima do MVP

- **NÃO no MVP**: cache pré-populado de postos, sincronização em background, push notification.
- **NO MVP**:
  - Rascunho de formulário em `localStorage` por `rascunho:<usuario_id>:<prefixo>:<codigo>`. Recuperado ao reabrir.
  - Fila de envios pendentes em **IndexedDB** (lib leve — `idb-keyval` ou implementação fina). Drena ao voltar `online`.
  - Retry com backoff em chamadas de envio.

> Implementação técnica em runbook futuro (`runbooks/app-pwa-offline.md` — Rodrigo).

### 2.4 Empacotamento APK via Capacitor (Fase 2.B, fora do MVP da Fase 2.A)

- **Lib**: `@capacitor/core` + `@capacitor/android`. iOS futuro com `@capacitor/ios` (depende de conta Apple do cliente).
- **Modo**: Capacitor aponta `webDir` para o build estático do Next.js? **Não.** O Next.js do projeto roda em modo SSR — não há build estático completo.
  - **Decisão**: Capacitor **embute apenas a webview**, que carrega `https://<host-vercel>/app` da Vercel. Equivalente a TWA (Trusted Web Activity), mas via Capacitor pra ter acesso a APIs nativas (câmera, GPS, file system) quando precisar.
  - Trade-off: APK requer internet pra carregar a UI da primeira vez, tem versão da PWA ativa em paralelo. Aceitável: vantagem é ter ícone no launcher + acesso a APIs nativas, não offline-first profundo.
- **APIs nativas usadas** (quando empacotado): `@capacitor/geolocation` (mais robusto que Web API), `@capacitor/filesystem` (futuro, pra anexar foto local), `@capacitor/preferences` (alternativa nativa ao localStorage).
- **Build pipeline APK**:
  - Pasta `mobile-android/` no monorepo (não em src/), gerada por `npx cap init` + `npx cap add android`.
  - Build via GitHub Actions (`.github/workflows/build-apk.yml`) gera APK assinado de homologação. Distribuição interna via download direto no início; MDM se cliente quiser depois.
  - Keystore gerenciada por Rodrigo, segredo no GitHub Secrets — **nunca no repo**.
- **iOS**: mesmo Capacitor, fora do escopo deste ADR. Quando vier, segue o mesmo padrão.

### 2.5 Reuso de domínio

- `src/domain/fichas/schemas.ts` é **importado direto** pelas rotas `/app/*` — zero duplicação. O renderer dinâmico (`<FormularioFicha schema={SCHEMAS_FICHA[codigo]} />`) é compartilhado entre web (futuro, se precisar) e mobile.
- Use cases (`application/use-cases/`) chamam o mesmo `construirSchemaZod` no servidor para validação dupla.
- Endpoints novos (`/api/triagem/*`) são consumidos por web (aprovador) e mobile (técnico) sem fork.

### 2.6 Auth

Sem mudança no provedor (Supabase Auth). Mesmo `signInWithPassword`, mesma allowlist, mesmo `current-user.ts`. Layout do `/app/login` é dedicado (mais largo, sem sidenav), mas `actions.ts` é o mesmo do web (`app/login/actions.ts` — pode ser refatorado para `application/auth/login.ts` chamado por ambos os layouts).

~~**MFA é exigido apenas para o aprovador (web)**, ver ADR-0008. Técnico no app **não tem MFA**, conforme constraint do Rafael.~~ **Revogado pelo ADR-0010 (2026-05-14):** MFA removido por completo, login fica em email + senha tanto para aprovador quanto para técnico.

### 2.7 Build pipeline

| Artefato | Como builda | Onde roda |
|----------|-------------|-----------|
| Web + App PWA | `next build` (mesmo build) | Vercel |
| APK Android | `next build` + `npx cap copy android` + `gradle assembleRelease` | GitHub Actions, output em release |
| iOS (futuro) | mesmo + `npx cap copy ios` + Xcode build | Mac com conta Apple — postergado |

## 3. Alternativas consideradas

| Alternativa | Por que rejeitada |
|-------------|-------------------|
| App nativo Android (Kotlin) + iOS (Swift) separado | Reescrita do domínio (Zod → Kotlin/Swift), duplicação proibida pela regra de governo, time não tem nativo. Impacto: ~10x esforço. |
| React Native | Compartilharia o domínio TS, mas não a UI; e exige stack paralela (Metro, gradle/xcode). Mais peças móveis, sem ganho real sobre PWA + Capacitor pro caso. |
| Expo | Variante de RN com DX melhor, mesmas críticas. Bom pra projeto mobile-first puro; pra extensão de webapp existente é overkill. |
| Repo separado pra mobile | Quebra reuso direto de `schemas.ts`; obrigaria publicar pacote npm interno. |
| TWA puro (Bubblewrap) | Cobre só Android, não dá acesso a APIs nativas nem caminho pra iOS. Capacitor faz tudo que TWA faz e mais. |
| Site responsivo dentro do dashboard atual (sem PWA) | Não permite "Add to Home Screen" com cara de app, sem service worker = sem rascunho/fila offline. Experiência ruim em campo. |
| Implementar SW manual sem `next-pwa` | Reservado como fallback se houver incompatibilidade; mais código, sem ganho funcional. |

## 4. Consequências

### 4.1 Positivas

- **Reuso máximo**: schemas Zod, auth, busca de posto, layout base — tudo compartilhado.
- **Entrega rápida**: PWA pronta para distribuição via link (sem loja); empacotamento APK depois sem reescrever.
- **Caminho pra iOS** existe sem reescrita.
- **Offline mínimo viável** com IndexedDB + localStorage cobre os 2 casos críticos (rascunho + fila).

### 4.2 Negativas / trade-offs

- **`next-pwa` tem riscos de incompatibilidade** com versões mais novas do Next.js / Turbopack (já vimos isso com `experimental.typedRoutes` no commit 6b992a9). Mitigação: ADR autoriza fallback pra implementação manual; gate de qualidade exige SW funcionando antes do release.
- **APK como webview wrapper** não é offline-first profundo. Aceitável para o caso (técnico tem internet 4G na maior parte do território).
- **iOS Apple Developer**: $99/ano + processo institucional. Postergado.
- **Tamanho do bundle do app**: o build do Next.js carrega muito código de dashboard que o app não usa. Mitigação: code-splitting agressivo por route group `(mobile)`, exclui rotas pesadas do dashboard via `dynamic` import gates.

### 4.3 Impacto operacional

- **Novos arquivos**:
  - `public/manifest.webmanifest`
  - `public/icons/icon-{192,512}.png`
  - `src/app/app/(mobile)/layout.tsx` (novo)
  - `src/app/app/(mobile)/page.tsx`
  - `src/app/app/(mobile)/postos/page.tsx`
  - `src/app/app/(mobile)/fichas/[codigo]/[prefixo]/page.tsx`
  - `src/app/app/(mobile)/minhas-fichas/page.tsx`
  - `src/components/mobile/CardTipoFicha.tsx`
  - `src/components/mobile/FormularioFicha.tsx` (renderer dinâmico)
  - `src/infrastructure/storage/rascunho-local.ts`
  - `src/infrastructure/storage/fila-envios.ts` (IndexedDB)
  - `next.config.ts` ganha config do `next-pwa` (ou registro manual de SW)
- **Novas dependências**: `next-pwa` (~), `idb-keyval` (~), `workbox-window` (~) — tudo open source, peso aceitável.
- **Em fase 2.B**: pasta `mobile-android/` + `mobile-ios/` (futura), workflow de build APK no GitHub Actions, keystore no Secrets.

## 5. Como rolar back

Se o PWA se mostrar inadequado:

1. Manter as rotas `/app/*` como página web mobile-first comum, sem manifest/SW.
2. Remover o registro de SW no `layout.tsx` mobile.
3. Site continua funcionando — só perde "instalável" e fila offline.
4. Schemas e backend já criados pra triagem permanecem válidos.

Sem migration de banco pra reverter.

## 6. Status de execução

- [ ] Manifest + ícones criados (Fernanda + Marina pra ícones)
- [ ] Service Worker registrado no layout `/app/*` (Rodrigo)
- [ ] Route group `(mobile)` com layout próprio (Fernanda)
- [ ] Renderer dinâmico de formulário (Fernanda + Bruno)
- [ ] Rascunho + fila offline (Lucas no backend de aceitação, Fernanda no client)
- [ ] **Capacitor (Fase 2.B)** — postergado

## 7. Pendências

- [ ] Decisão final entre `next-pwa` e SW manual (Rodrigo decide na implementação, com base em compatibilidade Next 15.5).
- [ ] Definir keystore Android (Rodrigo, Fase 2.B) — discussão com cliente sobre nome do certificado.
- [ ] Rafael decide se quer Apple Developer agora ou só quando iOS for explicitamente pedido.
