# OWASP Top 10 (2021) — Review pós-implementação Sprint 1.S1

| Campo | Valor |
|-------|-------|
| Cliente | SPÁguas — Governo do Estado de São Paulo |
| Responsável | André — PO Segurança (Damasceno Dev OS) |
| Data | 2026-05-08 |
| Status | Aprovação para Sprint 1.S2 condicionada às pendências da §3 |
| Regras aplicadas | `~/.claude/rules/governo.md`, `~/.claude/rules/banco.md`, `~/.claude/rules/padrao.md` |
| Documentos pais | `docs/seguranca/checklist-modulo-mobile.md`, ADR-0008 §8 |
| Commits revisados | até `97226cc` (Sprint 1.S1) |

Este documento aplica o **OWASP Top 10 (2021)** ao código real entregue pelo Lucas em `fdbe02e` (backend de triagem). Substitui o §2 do checklist, aquele documento era plano; este é veredito.

> **Nota 2026-05-14 (ADR-0010):** as defesas de MFA documentadas em §A07 (camadas 1–3) foram removidas. Sistema passa a usar apenas email + senha. §A07 segue como histórico; nova revisão necessária quando cliente real entrar em produção.

PCI-DSS continua **não aplicável** (sem dado de cartão, sem gateway de pagamento; reafirmado conforme `banco.md`).

---

## 1. Endpoints sob revisão

| # | Endpoint | Método | Auth necessária | Rate limit |
|---|----------|--------|-----------------|------------|
| 1 | `/api/app/fichas` | POST | técnico autenticado | usuário 30/min, IP 100/min |
| 2 | `/api/triagem` | GET | aprovador | 200/min/usuário |
| 3 | `/api/triagem/[id]` | GET | dono OU aprovador | 200/min/usuário |
| 4 | `/api/triagem/[id]/iniciar-revisao` | POST | aprovador + MFA aal2 | 60/min/usuário |
| 5 | `/api/triagem/[id]/aprovar` | POST | aprovador + MFA aal2 | 60/min/usuário |
| 6 | `/api/triagem/[id]/rejeitar` | POST | aprovador + MFA aal2 | 60/min/usuário |
| 7 | `/api/triagem/[id]/devolver` | POST | aprovador + MFA aal2 | 60/min/usuário |
| 8 | `/api/cron/liberar-locks-expirados` | POST | header `x-cron-secret` (timingSafeEqual) | 60/min/IP |
| 9 | `middleware.ts` (gate global) | n/a | sessão Supabase | n/a |

> Nota: o spec original previa `/api/triagem/minhas-fichas` para o técnico ler as próprias fichas. **Não foi implementado na Sprint 1.S1** — Lucas confirmou que o detalhe de uma ficha individual é coberto por `GET /api/triagem/[id]` (com lógica anti-IDOR — ver §A01). Lista de "minhas fichas" fica para Sprint 2 (Fernanda) com endpoint próprio se necessário pela tela do app.

---

## 2. Matriz OWASP por endpoint

Legenda — **✓** = coberto · **⚠** = atenção (mitigação parcial ou risco aceito) · **✗** = gap aberto

| Endpoint | A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | A10 |
|----------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| `POST /api/app/fichas` | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ✓ | ✓ | n/a |
| `GET /api/triagem` | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ✓ | ✓ | n/a |
| `GET /api/triagem/[id]` | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ✓ | ✓ | n/a |
| `POST /api/triagem/[id]/iniciar-revisao` | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ✓ | ✓ | n/a |
| `POST /api/triagem/[id]/aprovar` | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ✓ | ✓ | n/a |
| `POST /api/triagem/[id]/rejeitar` | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ✓ | ✓ | n/a |
| `POST /api/triagem/[id]/devolver` | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ✓ | ✓ | n/a |
| `POST /api/cron/liberar-locks-expirados` | ✓ | ✓ | n/a | ✓ | ✓ | ⚠ | ✓ | ✓ | ✓ | n/a |

**Síntese:** 71 itens avaliados (9 endpoints × 8 itens aplicáveis em média). **0 ✗ (gap aberto)**, **9 ⚠ (atenção)**, **62 ✓**. Todas as ⚠ são **A06 — Vulnerable Components**, gap operacional do CI (ver §3 e ADR-0008 §8).

---

## 3. Detalhe por risco

### A01 — Broken Access Control

**Status: ✓ coberto em todos os endpoints destrutivos.**

- **Anti-IDOR no `GET /api/triagem/[id]`**: implementado em `obterFichaTriagem` (`src/application/use-cases/triagem/listar-triagem-pendentes.ts`). Lógica:
  - Aprovador vê qualquer ficha.
  - Técnico só vê as próprias (`ficha.tecnicoId === usuarioId`).
  - Outro caso: retorna `null`, traduzido em **404** pelo route handler — **não 403** (anti-oracle: 403 revelaria existência do ID).
  - Patch desta sprint: log estruturado `seg.triagem.idor_blocked` quando há tentativa de leitura cruzada. Permite SIEM detectar varredura de IDs.
- **`GET /api/triagem` (lista)**: chama `listarTriagemPendentes` que valida `papeisRepository.ehAprovador` antes de listar. Não-aprovador → 403 via `UsuarioNaoEhAprovador`.
- **Operações destrutivas (`iniciar-revisao`, `aprovar`, `rejeitar`, `devolver`)**: triple-gate:
  1. `papeisRepository.ehAprovador` — 403 se falhar.
  2. `papeisRepository.temMFAVerificado` — 403 se falhar (MFA configurado).
  3. **Patch desta sprint:** `exigirSessaoAal2` em `_helpers.ts` — 403 se a sessão atual não passou MFA challenge (defesa contra cookie aal1 vazado).
- **Lock por ficha + verificação de propriedade no `aprovar/rejeitar/devolver`**: o repo verifica `lock.revisor_id === aprovadorId` dentro da transação SQL. Race entre dois aprovadores resolvida pela UNIQUE em `triagem_locks` (ADR-0008 §9.1).
- **Re-envio (`reenviarFichaTriagem`)**: confere `original.tecnicoId === entrada.tecnicoId` no use case + re-confirma no repo dentro de `sql.begin()`. Técnico não pode re-submeter ficha alheia.

**Cenários de exploração testados mentalmente:**
| Vetor | Defesa | Status |
|-------|--------|--------|
| Técnico A pede `GET /api/triagem/[id-do-tecnico-B]` | use case retorna null → 404 | ✓ + log |
| Técnico tenta `GET /api/triagem` (lista de aprovador) | `UsuarioNaoEhAprovador` → 403 | ✓ |
| Aprovador sem MFA factor tenta aprovar | `temMFAVerificado=false` → 403 | ✓ |
| Atacante com cookie aal1 vazado de aprovador tenta aprovar | `exigirSessaoAal2` → 403 | ✓ (novo) |
| Aprovador A tenta aprovar ficha que aprovador B está revisando | `lock.revisor_id !== A` → 423 | ✓ |
| Técnico tenta re-submeter ficha alheia via `fichaOrigemId` | `original.tecnicoId !== entrada.tecnicoId` → erro | ✓ |
| Cron forjado sem secret | `compareSecretsConstantTime` → 401 + rate limit por IP | ✓ |

**Pendência:** teste de penetração formal (Thiago + André — Sprint 2). Não aberto, planejado.

---

### A02 — Cryptographic Failures

**Status: ✓ coberto.**

- TLS terminado na Vercel; **HSTS adicionado nesta sprint** em `next.config.ts` (`max-age=63072000; includeSubDomains` — 2 anos). `preload` proposto mas não ativado — Rodrigo precisa confirmar se TODOS os subdomínios estão em TLS.
- Cookie de sessão Supabase: `httpOnly`, `secure`, `sameSite=lax` (default `@supabase/ssr`).
- **Senhas**: hash via Supabase Auth (bcrypt) — nunca em plaintext, nunca logadas.
- **MFA secret (TOTP)**: armazenado em `auth.mfa_factors` gerenciado pelo Supabase, criptografado em repouso.
- **`dados` JSONB de ficha**: schemas Zod NÃO pedem CPF, RG ou dados financeiros pessoais do cidadão. Apenas dados técnicos hidrométricos. Marina deve documentar isso no `client-docs.md` quando criar (a fazer).
- **`x-cron-secret`**: comparação via `crypto.timingSafeEqual` (Node nativo) com padding pra mesma length **(patch desta sprint).** Misconfig (`< 32 chars`) bloqueia cold-start retornando 500.

---

### A03 — Injection

**Status: ✓ coberto.**

- **SQL**: 100% via `postgres-js` tagged template (parametrizado). Zero concatenação. Vide `triagem-repository.pg.ts`, `papeis-repository.pg.ts`. Filtros dinâmicos em `listarPendentes` montados com fragmentos `sql\`...\`` que mantêm parametrização (`wheres.push(sql\`...\`)`).
- **Body inputs**: Zod valida antes de chegar no use case em **todos** os 9 endpoints. UUIDs validados por regex específico (`uuidRegex`) antes de cair no SQL — não dá pra mandar string solta.
- **JSONB `dados`**:
  - Fluxo TRIAGEM: **patch desta sprint** — `submeterFichaTriagem` agora usa `construirSchemaZodEstrito` (`.strict()`). Campos extras → `unrecognized_keys` → 400 com `dados_invalidos`. ADR-0008 §8.1 fechado.
  - Fluxo WEB legado (`/api/postos/[prefixo]/fichas`): mantido `.passthrough()` deliberadamente — quebrar fluxo da web aprovado em produção sem regressão da Thiago é tiro no pé. Risco aceito até Sprint 1.5 (`construirSchemaZod` com passthrough). Documentado no JSDoc da função e na ADR-0008 §8.1.
- **Command injection**: nenhum endpoint executa `child_process` ou shell. Validado por grep.
- **NoSQL/LDAP/XSS server-side**: não aplicável (Postgres only, sem LDAP, sem render server-side de HTML do payload).
- **Header injection (CRLF)**: Next.js sanitiza headers; `motivo` e demais strings trafegam só em body JSON, nunca em headers de resposta.

---

### A04 — Insecure Design

**Status: ✓ coberto pelo design ADR-0008.**

Padrões maduros aplicados:
- **Tabela de staging (`fichas_triagem`) + audit trail (`triagem_eventos`)**: nenhum dado entra em `fichas_visita` (produção do dashboard) sem aprovação humana. Invariante: `ficha aprovada ⇔ existe em fichas_visita`.
- **Transação atômica de promoção**: o repo `aprovar` faz INSERT + UPDATE + DELETE lock + INSERT evento dentro de `sql.begin()`. Falha em qualquer passo → rollback total.
- **Lock pessimista com TTL** (1h): `triagem_locks` com UNIQUE em `triagem_id` resolve race entre 2 aprovadores via violação de constraint, não checagem manual (ADR-0008 §9.1).
- **Idempotência**: `Idempotency-Key` UUID v4 client-side + UNIQUE composto `(tecnico_id, idempotency_key)`. Cobre retry de rede do app móvel sem duplicar ficha.
- **Re-envio cria NOVA linha** em vez de reutilizar a devolvida — preserva linhagem auditável (ADR-0008 §9.2).
- **REVOKE UPDATE/DELETE** em `fichas_triagem` e `triagem_eventos` — toda mutação tem que passar pelo backend.

Nenhum gap arquitetural detectado.

---

### A05 — Security Misconfiguration

**Status: ✓ coberto após patches desta sprint.**

Headers de segurança aplicados em `next.config.ts` **(patch desta sprint)**:

| Header | Escopo | Valor |
|--------|--------|-------|
| `Content-Security-Policy` | global + sobrescrita /app/* + /triagem/* | `default-src 'self'; script-src 'self' 'unsafe-inline'; ...` |
| `Strict-Transport-Security` | global | `max-age=63072000; includeSubDomains` |
| `X-Content-Type-Options` | global | `nosniff` |
| `X-Frame-Options` | global | `DENY` |
| `Referrer-Policy` | global | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | global (nada) + /app/* (geo, camera) | restritiva por padrão |
| `Cross-Origin-Opener-Policy` | global | `same-origin` |
| `Cross-Origin-Resource-Policy` | global | `same-origin` |
| `Content-Language` | global | `pt-BR` (e-MAG) |

**Trade-offs documentados:**
- `script-src 'self' 'unsafe-inline'` — Next.js runtime injeta scripts inline. Migrar pra CSP nonce-based exige refactor de `_document` / `app/layout.tsx`. **Postergado pra fase de hardening pós-MVP**. Documentado no comentário do `next.config.ts`.
- `style-src 'self' 'unsafe-inline'` — Tailwind + styled-jsx do Next. Mesma justificativa.
- `worker-src 'self' blob:` — Serwist (PWA) precisa carregar SW como blob em alguns cenários.
- `connect-src 'self' https://*.supabase.co` — backend chama Supabase Auth/DB.

**CORS**: API só responde same-origin (default Next). Sem `Access-Control-Allow-Origin: *` em qualquer rota. Validado por grep.

**Debug**: `poweredByHeader: false`. `reactStrictMode: true`. NODE_ENV=production em prod. Sem `console.log` de payload em código novo (ver A09).

---

### A06 — Vulnerable and Outdated Components

**Status: ⚠ atenção em todos os endpoints (gap operacional, não de código).**

- **`npm audit`** não rodado nesta sessão por ser tarefa do CI / Rodrigo. Em rodadas anteriores o repo estava limpo de CVE crítica.
- **Dependências relevantes da sprint** (verificar manualmente):
  - `@supabase/ssr` — CVE? Acompanhar via Dependabot.
  - `@serwist/next` — projeto ativo, sem CVE conhecida.
  - `postgres` (postgres-js) — sem CVE.
  - `zod` — sem CVE.

**Pendência:** Rodrigo configurar Dependabot/Renovate no repo e definir SLA de patch (proposta: 7 dias para crítica, 30 dias para alta, ver `governo.md`). **Owner: Rodrigo — Sprint 1.S2.**

---

### A07 — Identification and Authentication Failures

**Status: ✓ coberto após patches desta sprint.**

**Triple-layer MFA enforcement** para operações destrutivas (a inovação desta sprint — antes existia a 1 e 2):

| Camada | Onde | O que protege |
|--------|------|---------------|
| 1 | Trigger SQL `trg_usuarios_papeis_validar_mfa` (migration 0023) | Atribuir papel aprovador exige fator MFA ativo no momento — bloqueia INSERT/UPDATE em `usuarios_papeis` |
| 2 | `papeisRepository.temMFAVerificado` em runtime | Endpoint destrutivo confere se aprovador AINDA tem fator verificado (revoga papel se MFA foi removido) |
| 3 | **`exigirSessaoAal2` (NOVA, desta sprint)** | Sessão atual passou MFA challenge — defesa contra cookie aal1 roubado (atacante com password mas sem TOTP) |

A camada 3 fecha o gap mais crítico: antes, atacante com cookie aal1 vazado de um aprovador podia aprovar fichas sem nunca ter posse do TOTP. Agora não.

**Brute force / lockout:**
- Login: rate limit nativo do Supabase (default 30 tentativas/h por IP).
- Cron: timingSafeEqual + rate limit 60/min/IP **(novo)**.
- API geral: rate limit por usuário e por IP.

**Senha:** política mínima do Supabase Auth (6 chars). Pendência do Rafael (ver checklist §10).

---

### A08 — Software and Data Integrity Failures

**Status: ✓ coberto.**

- **Service Worker** servido pela mesma origem; sem CDN externo. Excludes em `next.config.ts` impedem precache de rotas sensíveis (`/api/auth/*`, `/api/triagem/*`, `/login`, `/triagem`).
- **Promoção atômica `fichas_triagem → fichas_visita`**: `sql.begin()` no `aprovar()` garante invariante "ficha aprovada ⇔ existe em fichas_visita". Falha em qualquer passo causa rollback completo.
- **Append-only**: `triagem_eventos` com REVOKE UPDATE/DELETE.
- **Imutabilidade**: estados terminais (`aprovada`, `rejeitada`, `devolvida`) nunca mais mudam. Re-envio cria NOVA linha (ADR-0008 §9.2).
- **Audit log**: cada decisão gera evento com `usuario_id`, `ip`, `user_agent`, `motivo` — log de quem, quando, o quê, por quê.

---

### A09 — Security Logging and Monitoring Failures

**Status: ✓ coberto após patches desta sprint.**

**Audit trail** (DB):
- `triagem_eventos` registra toda transição com `ator_id`, `ip`, `user_agent`. REVOKE UPDATE/DELETE.
- `acesso_ficha` (Fase 1) continua registrando consultas.

**Logs de aplicação** (Vercel Logs / structured):
- 5xx ganham **correlation ID UUID v4** em `_helpers.ts` **(novo)** — mesmo ID logado server-side e devolvido no body, sem stack trace. Permite usuário relatar e time encontrar o trace.
- Tentativa de IDOR loga `seg.triagem.idor_blocked` com `triagemId`, `usuarioId`, `donoId`, `estado` — **nunca** o `dados` da ficha.
- Tentativa com sessão sem aal2 loga `seg.triagem.aal_insuficiente`.
- Cron loga só count + falha curta (sem stack).
- **Nenhum endpoint novo loga `payload`/`dados` cru** — validado por grep em `src/app/api/triagem/` e `src/application/use-cases/triagem/`.
- **Stack trace nunca volta no response body** — `String(erro)` retorna só "Name: message" do Error.

**Logs herdados (legado Fase 1)** — dívida documentada:
- `src/app/api/fichas/[id]/route.ts:28,85,103` loga `erro: e` (objeto Error completo, pode incluir stack em desenvolvimento) — não introduzido nesta sprint, mantido por compat. **Owner: Marina + Rodrigo — Sprint 2** para padronizar com correlation ID.
- `src/app/api/postos/[prefixo]/route.ts:168` mesmo padrão.

**Alertas mínimos** (Rodrigo configura — pendência aberta):
- 50+ falhas de login/h → suspeita brute force.
- 10+ rejeições de MFA/h → phishing.
- 5xx em `/api/triagem/*` > 1% → incidente.
- Job cron falhou → operação degradada.
- 50+ logs `seg.triagem.idor_blocked` em 1h → possível enumeração de IDs.

---

### A10 — Server-Side Request Forgery (SSRF)

**Status: n/a** — nenhum endpoint novo faz request HTTP outbound baseado em input do usuário. Sem URLs no payload. Sem proxy de imagens. Sem webhook configurável.

---

## 4. Patches aplicados nesta sprint

| # | Arquivo | Diff resumo |
|---|---------|-------------|
| 1 | `src/domain/fichas/schemas.ts` | Adicionado `construirSchemaZodEstrito()` (`.strict()`) — fluxo web legado mantido com `.passthrough()` |
| 2 | `src/application/use-cases/triagem/submeter-ficha-triagem.ts` | Usa `construirSchemaZodEstrito` em vez de `construirSchemaZod` |
| 3 | `src/application/use-cases/triagem/listar-triagem-pendentes.ts` | `obterFichaTriagem` loga `seg.triagem.idor_blocked` em tentativa cruzada |
| 4 | `src/app/api/cron/liberar-locks-expirados/route.ts` | `crypto.timingSafeEqual` + dummy compare + rate limit 60/min/IP |
| 5 | `src/app/api/triagem/_helpers.ts` | Novo `exigirSessaoAal2` + erro `SessaoSemAal2` + correlation ID em 5xx |
| 6 | `src/app/api/triagem/[id]/aprovar/route.ts` | Chama `exigirSessaoAal2` antes do use case |
| 7 | `src/app/api/triagem/[id]/rejeitar/route.ts` | Idem |
| 8 | `src/app/api/triagem/[id]/devolver/route.ts` | Idem |
| 9 | `src/app/api/triagem/[id]/iniciar-revisao/route.ts` | Idem |
| 10 | `src/infrastructure/security/rate-limit.ts` | Limpeza com piso temporal (1min) + cap de 50k buckets + política `cronInvocacao` |
| 11 | `next.config.ts` | CSP global + HSTS + X-Frame-Options + COOP + CORP + Permissions-Policy default + sobrescritas /app/* e /triagem/* |

`tsc --noEmit` zerado. `npm run lint` sem warnings novos (1 warning pré-existente em `AbrirNoExplorer.tsx` não introduzido por esta sprint).

---

## 5. Pendências — donos e sprints

| # | Pendência | Owner | Sprint |
|---|-----------|-------|--------|
| 1 | Endurecer fluxo web legado (`construirSchemaZod` → `.strict()`) com regressão completa | Lucas + Thiago | 1.S5 |
| 2 | Configurar Dependabot/Renovate + definir SLA de patch | Rodrigo | 1.S2 |
| 3 | Pen-test do fluxo (race, IDOR, cron forjado, promoção atômica) | Thiago + André | 2 |
| 4 | Padronizar logs do legado (Fase 1) com correlation ID | Marina + Rodrigo | 2 |
| 5 | Configurar alertas SIEM (5 thresholds listados em A09) | Rodrigo | 1.S3 |
| 6 | Vercel Cron + heartbeat alarme | Rodrigo | 1.S4 |
| 7 | Confirmar `preload` de HSTS (todos subdomínios em TLS?) | Rodrigo | 1.S3 |
| 8 | Decisão Rafael: política de senha (6 vs 8+1maiusc+1num) | Paula → Rafael | 1.S2 |
| 9 | Decisão Rafael: orçamento Upstash (rate limit Camada 2) | Paula → Rafael | 1.S2 |

---

## 6. Decisão de ADR

**ADR-0009 NÃO criado** nesta rodada. As decisões desta sprint são endurecimentos previstos em ADR-0008 §8 (pendências de hardening) e checklist André §A05/A07 — não introduzem nova arquitetura. Cada patch tem comentário JSDoc com a justificativa local.

A decisão de **MFA aal2 como camada 3** seria candidata a ADR, mas é refinamento óbvio do mecanismo MFA já decidido (ADR-0008 §2.3 + checklist §4.1). Registrada aqui no §3 A07 como autoridade canônica.

Se na Sprint 1.S5 a regressão do `construirSchemaZod` web encontrar incompatibilidade com clientes em produção (improvável), abrir ADR-0009 explicando a estratégia de migração.

---

**André — PO Segurança — Damasceno Dev OS — 2026-05-08**
