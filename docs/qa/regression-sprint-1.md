# Regression checklist — Sprint 1 (Fase 2.A)

| Campo | Valor |
|-------|-------|
| Cliente | SPÁguas — Governo do Estado de São Paulo |
| Responsável | Thiago — PO QA |
| Versão | 1.0 — pós-Sprint 1.S3 |
| Data | 2026-05-08 |
| Frequência | **Antes de cada deploy de produção** + ad-hoc após qualquer mudança em `src/domain/`, `src/application/use-cases/triagem/`, `src/infrastructure/db/`, ou middleware/auth |
| Comando one-liner | `npm test && npm run lint && npm run typecheck` |

Este documento lista os cenários a re-rodar antes de cada deploy. Cobre Fase 1 (dashboard de consulta) + Fase 2.A (módulo mobile + triagem). Em vermelho: cenários **gating** — bloqueiam deploy se falharem.

---

## 1. Smoke automatizado (gating — bloqueia deploy)

### 1.1 Suite Vitest

```bash
npm test
```

Esperado: **110+ testes passando, 0 failed.** Cobertura mínima:
- `src/domain/triagem.ts` ≥ 90% lines
- `src/application/use-cases/triagem/**` ≥ 80% lines
- `src/infrastructure/security/rate-limit.ts` ≥ 80% lines

Se algum threshold quebrar, **bloquear merge**. Não usar `--coverage.thresholds.skipFull`.

### 1.2 TypeScript estrito

```bash
npm run typecheck
```

Esperado: **0 erros.** A presença de testes em `tests/` não pode introduzir erro no `tsc`.

### 1.3 Lint

```bash
npm run lint
```

Esperado: **0 erros**, warnings tolerados se pré-existentes (`AbrirNoExplorer.tsx` é conhecido — registrado em `owasp-review-sprint-1.md §A09`).

### 1.4 Pen-test exploratório

```bash
npm test -- tests/security/
```

Esperado: **24 cenários passando.** Falha em qualquer um significa regressão de segurança — **bloquear deploy**.

---

## 2. Cenários manuais (gating)

### 2.1 Login e auth (Fase 1 + Fase 2.A)

| # | Cenário | Esperado |
|---|---------|----------|
| L1 | Login com email correto + senha correta | sessão criada, redirect para `/` |
| L2 | Login com email não-allowlisted | mensagem genérica "credenciais inválidas" |
| L3 | Login com senha errada | mensagem genérica, formulário preserva email |
| L4 | Cadastrar com email institucional | aceito; cria usuário; pré-aprovado |
| L5 | Cadastrar com email fora da allowlist | rejeitado em runtime |
| L6 | Logout limpa cookies | sessão Supabase removida; redirect para `/login` |
| L7 | Sessão expirada → tenta acessar `/triagem` | redirect para `/login` |

### 2.2 Triagem — fluxo do aprovador

| # | Cenário | Esperado |
|---|---------|----------|
| T1 | Aprovador (com MFA) abre `/triagem` | lista pendente carrega |
| T2 | Não-aprovador acessa `/triagem` | 403 ou redirect, log de bloqueio |
| T3 | Aprovador clica "iniciar revisão" | estado vai a `em_revisao`, lock visível |
| T4 | 2º aprovador tenta abrir mesma ficha em revisão | aviso "em revisão por X há Y min" |
| T5 | Aprovador aprova → ficha aparece em `/api/fichas/[id]` | `fichas_visita` recebe linha |
| T6 | Aprovador rejeita com motivo válido (≥ 20) | estado `rejeitada`, ficha some da fila |
| T7 | Aprovador devolve com solicitação válida | estado `devolvida` |
| T8 | Técnico re-envia ficha devolvida | nova linha com `ficha_origem_id` |
| T9 | Aprovador sem MFA tenta aprovar | 403 `mfa_obrigatorio` |
| T10 | Aprovador com sessão aal1 tenta aprovar | 403 `mfa_nao_validado_na_sessao` |

### 2.3 Triagem — fluxo do técnico (PWA quando estiver pronto)

| # | Cenário | Esperado |
|---|---------|----------|
| M1 | Técnico abre app, faz login | redireciona para home |
| M2 | Selecionar tipo + posto + preencher ficha + enviar | 201, ficha em `pendente` |
| M3 | Re-enviar com mesma `Idempotency-Key` | retorna mesma ficha, sem duplicar |
| M4 | Re-enviar com payload com campo extra | 400 `dados_invalidos` |
| M5 | Tela "Minhas fichas" lista por status correto | OK |
| M6 | Sem internet → fila local IndexedDB | OK; drena ao voltar online |

### 2.4 Cron de liberação de locks

| # | Cenário | Esperado |
|---|---------|----------|
| C1 | POST sem `x-cron-secret` | 401 `nao_autorizado` |
| C2 | POST com secret errado | 401 (mesma latência aproximada que C1) |
| C3 | POST com secret correto | 200, body `{liberados, quantidade}` |
| C4 | Após 1h sem ação, lock expira automaticamente | estado volta para `pendente` |
| C5 | `CRON_SECRET` ausente ou < 32 chars | 500 `configuracao_invalida` |

---

## 3. Acessibilidade (gating para governo — `governo.md`)

### 3.1 WCAG 2.1 AA / e-MAG — checklist mínimo

| # | Cenário | Esperado |
|---|---------|----------|
| A1 | Navegação por teclado em `/` (dashboard) | foco visível, ordem lógica, skip-link |
| A2 | Navegação por teclado em `/triagem` (lista + detalhe) | foco visível em todos os botões de ação |
| A3 | Leitor de tela (NVDA Windows) anuncia status de ficha | "ficha pendente do técnico X em posto Y" |
| A4 | Contraste mínimo 4.5:1 em texto / 3:1 em ícones | Lighthouse a11y > 90 |
| A5 | Tamanho de toque ≥ 44px em controles do app móvel | medido em DevTools |
| A6 | Form de ficha com erros: foco no primeiro inválido + aria-live | OK |
| A7 | Tabela de pendentes em `/triagem` tem cabeçalho semântico | `<th scope="col">` |
| A8 | Modal de motivo de rejeição é trapped focus | foco não escapa, ESC fecha |

### 3.2 Lighthouse PWA + a11y

```bash
npm run pwa:audit
```

Esperado: **Acessibilidade ≥ 90**, PWA installable ≥ 1 critério OK.

---

## 4. PWA (smoke pós-deploy de Fase 2.A)

| # | Cenário | Esperado |
|---|---------|----------|
| P1 | Manifest carregado em `/app/manifest.webmanifest` | 200 + JSON válido |
| P2 | Service Worker registrado em `/app/sw.js` | sem erros no console |
| P3 | Botão "Instalar app" aparece no Chrome desktop | OK |
| P4 | App instala via "Adicionar à tela inicial" no Android | ícone no launcher |
| P5 | Offline → app abre tela offline (não tela em branco) | banner "sem conexão" |
| P6 | Rascunho local persiste após reload | `localStorage` recuperado |
| P7 | API `/api/auth/*` e `/api/triagem/*` NÃO entram em precache | inspecionar SW cache |

---

## 5. Dados financeiros / regras de negócio

Sprint 1.S3 ainda não tem fluxo financeiro pago, mas há **rateio de eventos auditáveis**. Validar:

| # | Cenário | Esperado |
|---|---------|----------|
| F1 | Cada decisão de triagem (aprovar/rejeitar/devolver) gera 1 evento em `triagem_eventos` | append-only, REVOKE UPDATE/DELETE |
| F2 | `triagem_eventos.usuario_id`, `ip`, `user_agent` populados em todas as transições | OK |
| F3 | `acesso_ficha` (Fase 1) continua registrando consultas a `fichas_visita` | OK |

---

## 6. Performance / smoke não-funcional

| # | Cenário | Esperado |
|---|---------|----------|
| N1 | `GET /api/triagem?limite=50` com 100 fichas pendentes | < 500 ms p95 |
| N2 | `POST /api/app/fichas` com payload típico | < 500 ms p95 |
| N3 | `POST /api/triagem/[id]/aprovar` (com transação atômica) | < 1 s p95 |
| N4 | `POST /api/cron/liberar-locks-expirados` | < 200 ms p95 |
| N5 | Lighthouse perf em `/app` | ≥ 80 |
| N6 | Lighthouse perf em `/` (dashboard) | ≥ 80 |

---

## 7. Gaps conhecidos a monitorar

### R-MOCK-01 — Bug do `clonar` em `triagem-repository.mock.ts`

**Onde:** `src/infrastructure/mock/triagem-repository.mock.ts:36-38, 298-300`.
**Sintoma:** `JSON.parse(JSON.stringify(v))` perde tipo `Date` → `listarEventos()` quebra com `TypeError: getTime is not a function`. Validado em `tests/security/pentest-sprint-1.md §3 Obs-1`.
**Impacto:** **NULO em produção** — só afeta dev/test. Mas torna audit trail invisível em testes.
**Fix proposto:** reviver `Date` no `JSON.parse` para chaves terminadas em `Em`/`_em`. Patch sugerido em `tests/security/pentest-sprint-1.md §3`.
**Owner:** Lucas — Sprint 1.S4.

### R-WEB-01 — Schema legado `.passthrough()` ainda aceita campos extras no `/api/postos/[prefixo]/fichas`

**Onde:** `src/domain/fichas/schemas.ts:763`.
**Status:** documentado em ADR-0008 §8, OWASP review §A03, Threat Model §R5.
**Owner:** Lucas + Thiago — Sprint 1.S5.

### R-LOG-01 — Rotas legadas (Fase 1) logam objeto Error completo

**Onde:** `src/app/api/fichas/[id]/route.ts:28,85,103`, `src/app/api/postos/[prefixo]/route.ts:168`.
**Status:** documentado em OWASP review §A09. Risco baixo (sem PII no payload), mas inconsistente com endpoints novos.
**Owner:** Marina + Rodrigo — Sprint 2.

### R-CRON-01 — Heartbeat do cron + alerta SIEM ainda não configurado

**Onde:** `docs/runbooks/alertas-siem.md` mencionado mas não criado.
**Owner:** Rodrigo — Sprint 1.S3 (item #5 do OWASP review §5).

---

## 8. Como executar antes de deploy (procedimento)

1. **Sincroniza branch:** `git fetch origin && git status` deve estar limpo.
2. **Roda suite completa:**
   ```bash
   npm install --no-fund --no-audit
   npm test
   npm run typecheck
   npm run lint
   ```
3. **Smoke manual:** abrir `http://localhost:3000` e cobrir L1, L2, T1, T3, T5 (5 minutos).
4. **Smoke acessibilidade:** Tab navegando pela home + `/triagem` (2 minutos).
5. **Lighthouse audit (opcional, quando PWA completo):** `npm run pwa:audit`.
6. **Tag de release:** `git tag v0.X.0 -m "Sprint 1.S3 — pen-test + suite Vitest"`.

Se qualquer item gating falhar: **abrir issue** e bloquear deploy até resolução.

---

**Thiago — PO QA — Damasceno Dev OS — 2026-05-08**
