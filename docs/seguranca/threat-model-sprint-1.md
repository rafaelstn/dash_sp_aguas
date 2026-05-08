# Threat Model — Sprint 1.S1 (módulo triagem)

| Campo | Valor |
|-------|-------|
| Cliente | SPÁguas — Governo do Estado de São Paulo |
| Responsável | André — PO Segurança |
| Versão | 1.0 — pós-implementação backend |
| Data | 2026-05-08 |
| Documentos pais | `docs/seguranca/checklist-modulo-mobile.md §3`, `docs/seguranca/owasp-review-sprint-1.md`, ADR-0008 |

Este documento substitui o §3 do checklist agora que o código foi entregue. Cada vetor é avaliado contra o **código real** do commit `97226cc`, com mitigações implementadas e gap residual.

Frame: **STRIDE** + **abuse cases** específicos do domínio (triagem).

---

## 1. Atores e superfícies

### 1.1 Atores legítimos
- **Técnico em campo** — autenticado, papel comum. Submete fichas via app (PWA).
- **Aprovador** — autenticado, papel `aprovador`, MFA TOTP obrigatório (aal2). Decide cada ficha.
- **Cron Vercel** — invoca `/api/cron/liberar-locks-expirados` com `x-cron-secret`.
- **DPO / admin DB** — acesso direto ao Postgres via service role para casos excepcionais (LGPD, anonimização).

### 1.2 Atores hostis modelados
- **Atacante externo anônimo** — sem credenciais, internet pública.
- **Técnico mal-intencionado** — credenciais válidas, papel comum.
- **Aprovador comprometido** — credenciais (incluindo TOTP) vazadas.
- **Atacante com cookie aal1 vazado** — password de aprovador roubada via phishing, TOTP NÃO comprometido.
- **Atacante interno** — desenvolvedor / devops com acesso ao painel Supabase ou variáveis de ambiente.
- **Técnico desligado** — credenciais ainda ativas após desligamento.

### 1.3 Superfícies
- 9 endpoints HTTP (ver `owasp-review-sprint-1.md §1`).
- Tabelas: `fichas_triagem`, `triagem_eventos`, `triagem_locks`, `usuarios_papeis`, `fichas_visita`.
- Cookies de sessão Supabase.
- Service Worker em `/app/*`.
- Variáveis de ambiente: `CRON_SECRET`, `DATABASE_URL`, `SUPABASE_*`.

---

## 2. Vetores de ataque (12 mapeados)

### V1 — Submissão de ficha falsa por técnico em posto não-visitado
- **Categoria STRIDE**: Tampering / Repudiation
- **Ator**: Técnico mal-intencionado
- **Cenário**: técnico envia ficha de visita sem ter ido ao posto, falsificando GPS.
- **Mitigação atual**:
  - Aprovação humana obrigatória (`fichas_triagem` → `fichas_visita` só via use case `aprovar`).
  - GPS capturado pelo dispositivo + `precisao_gps_m` → aprovador avalia confiabilidade.
  - Audit trail (`triagem_eventos`) com `usuario_id`, `ip`, `user_agent` no envio.
- **Gap residual**: aprovador depende do GPS reportado pelo cliente — técnico determinado falsifica navegador. Defesa: aprovação humana cruzando com cronograma operacional. **Aceito** (não dá pra fechar 100% sem hardware specifico, fora do escopo MVP).

### V2 — Técnico desligado com sessão ainda ativa
- **Categoria STRIDE**: Elevation of Privilege
- **Ator**: Técnico desligado
- **Cenário**: refresh token ainda válido após desligamento; envia fichas em nome do órgão.
- **Mitigação atual**:
  - Allowlist de email (ADR-0006) — desligamento remove email da allowlist, próximo refresh falha.
  - Audit trail captura user_id no envio.
- **Gap residual**: janela entre desligamento e remoção da allowlist (até refresh expirar). Mitigação: runbook de offboarding (Rodrigo) — pendente de doc. **Aceito com documentação** — Marina cria runbook na Sprint 2.

### V3 — Aprovador com password vazada (sem TOTP)
- **Categoria STRIDE**: Spoofing
- **Ator**: Atacante externo
- **Cenário**: phishing leva password do aprovador. Atacante loga e tenta aprovar.
- **Mitigação atual**:
  - **Camada 1**: Login exige MFA challenge → atacante sem TOTP fica em aal1.
  - **Camada 2**: `papeisRepository.temMFAVerificado` no use case checa fator, mas atacante "tem fator" (o aprovador tem) → passa.
  - **Camada 3 (NOVA, Sprint 1.S2)**: `exigirSessaoAal2` no `_helpers.ts` checa que ESTA sessão fez MFA challenge. Atacante em aal1 → 403 `mfa_nao_validado_na_sessao`.
- **Gap residual**: atacante com TOTP secret também roubado (chave física comprometida) — fora do escopo. Mitigação organizacional: rotacionar fator se houver suspeita.

### V4 — Cookie aal1 roubado de aprovador legitimo
- **Categoria STRIDE**: Spoofing
- **Ator**: Atacante externo (XSS em outro domínio, MITM se TLS quebrado)
- **Cenário**: atacante rouba cookie de sessão antes do aprovador subir pra aal2.
- **Mitigação atual**:
  - Cookie `httpOnly` + `secure` + `sameSite=lax` (ataques XSS limitados).
  - HSTS (NOVO, Sprint 1.S2) — força TLS estrito.
  - Camada 3 MFA (NOVO) — aal1 não autoriza ações destrutivas.
- **Gap residual**: leitura via `GET /api/triagem` continua possível com aal1 (lista é não-destrutiva). Aceito — não há dado pessoal sensível na lista (só prefixo, técnico, data).

### V5 — Race entre dois aprovadores no mesmo ficha
- **Categoria STRIDE**: Tampering
- **Ator**: dois aprovadores legítimos (acidental) ou aprovador comprometido tentando aprovação dupla
- **Cenário**: dois POSTs simultâneos em `/api/triagem/[id]/iniciar-revisao` para a mesma ficha.
- **Mitigação atual**:
  - UNIQUE em `triagem_locks(triagem_id)` — driver dispara violação, se trata em `iniciarRevisao` retornando `ResultadoIniciarRevisao { adquirido: false, motivo: 'lock_em_uso' }`.
  - Aprovação subsequente (`aprovar`) verifica `lock.revisor_id === aprovadorId` dentro da transação.
- **Gap residual**: nenhum identificado. Pen-test pra confirmar é pendência (owner Thiago + André, Sprint 2).

### V6 — Promoção atômica falha no meio
- **Categoria STRIDE**: Tampering / Information Disclosure
- **Ator**: bug ou falha de infra
- **Cenário**: INSERT em `fichas_visita` ok, UPDATE em `fichas_triagem` falha → ficha duplicada.
- **Mitigação atual**:
  - `sql.begin()` envolve INSERT + UPDATE + DELETE lock + INSERT evento. Rollback automático em qualquer falha.
  - Constraint `chk_fichas_triagem_aprovada` exige `ficha_visita_id IS NOT NULL` quando `estado='aprovada'` — DB bloqueia inconsistência.
- **Gap residual**: nenhum identificado. Teste em ambiente de staging com kill -9 do node no meio da transação é pendência da Thiago (Sprint 2).

### V7 — Cron forjado / brute-force do secret
- **Categoria STRIDE**: Spoofing / Elevation of Privilege
- **Ator**: Atacante externo
- **Cenário**: atacante descobre URL `/api/cron/liberar-locks-expirados` e tenta brute force do header `x-cron-secret` ou usa secret legítimo vazado.
- **Mitigação atual**:
  - `crypto.timingSafeEqual` com padding (NOVO, Sprint 1.S2) — compara em tempo constante mesmo com tamanhos diferentes.
  - Rate limit por IP 60/min (NOVO).
  - Misconfig (`< 32 chars` no env) → 500 com erro de configuração, não autorização.
  - Even if forjado: ação é idempotente, só libera locks expirados — impacto baixo, mas evento `lock_expirado` fica gravado em `triagem_eventos`.
- **Gap residual**: secret vazado em log do Vercel ou em variável de ambiente compartilhada. Mitigação: secret em painel Vercel (não em repo), rotação trimestral (runbook pendente — Rodrigo, Sprint 1.S3).

### V8 — IDOR / enumeração de IDs
- **Categoria STRIDE**: Information Disclosure
- **Ator**: Técnico mal-intencionado
- **Cenário**: técnico A varre UUIDs de fichas tentando descobrir ficha do técnico B.
- **Mitigação atual**:
  - `obterFichaTriagem` retorna null para não-dono não-aprovador → 404 (anti-oracle).
  - UUID v4 (~122 bits de entropia) — varredura por força bruta inviável.
  - Log estruturado `seg.triagem.idor_blocked` (NOVO, Sprint 1.S2) — SIEM detecta padrão de enumeração.
  - Rate limit 200/min por usuário em GET.
- **Gap residual**: alerta SIEM ainda não configurado (pendência Rodrigo, Sprint 1.S3). Sem alerta, log fica só em Vercel Logs.

### V9 — DoS via spam de submissão
- **Categoria STRIDE**: Denial of Service
- **Ator**: Atacante externo ou técnico mal-intencionado
- **Cenário**: 1000 POSTs/seg em `/api/app/fichas` para encher `fichas_triagem`.
- **Mitigação atual**:
  - Rate limit dual: 30/min por usuário + 100/min por IP.
  - Idempotency-Key faz duplicatas devolverem a ficha existente sem novo INSERT.
  - Rate limit limpa buckets antigos com piso temporal (NOVO, Sprint 1.S2) — ataque com 50k chaves distintas não causa OOM.
  - Hard cap de 50k buckets antes de limpeza forçada.
- **Gap residual**: rate limit reset por deploy (in-memory). Atacante coordenado pode aproveitar redeploy para resetar contadores. Aceito até Camada 2 (Upstash) ser aprovada (pendência Rafael).

### V10 — XSS via campo de ficha
- **Categoria STRIDE**: Tampering / Information Disclosure
- **Ator**: Técnico mal-intencionado ou aprovador comprometido
- **Cenário**: campo `observacoes` ou `dados.*` recebe `<script>...</script>`. Renderiza no detalhe da ficha do aprovador → vai pra `fichas_visita` → renderiza no dashboard.
- **Mitigação atual**:
  - Zod valida tipos (number, string, enum, boolean) — string aceita texto livre, mas React escapa por default.
  - Sem `dangerouslySetInnerHTML` em nenhum componente que renderiza ficha (validado por grep durante revisão).
  - CSP global (NOVO) com `script-src 'self' 'unsafe-inline'` — bloqueia carregamento de script externo, mas `'unsafe-inline'` ainda permite inline. **Defense limitada**.
- **Gap residual**: `'unsafe-inline'` é necessário para o Next.js runtime atual. Migração para CSP nonce-based postergada (não trivial). Defesa principal continua sendo escape do React + ausência de `dangerouslySetInnerHTML`. **Aceito**, documentado em `next.config.ts` e `owasp-review-sprint-1.md §A05`.

### V11 — Atacante interno edita registros direto no Postgres
- **Categoria STRIDE**: Tampering / Repudiation
- **Ator**: dev/devops com acesso ao DB via painel Supabase ou service role
- **Cenário**: alterar `fichas_triagem.estado` ou apagar `triagem_eventos` para encobrir aprovação fraudulenta.
- **Mitigação atual**:
  - REVOKE UPDATE/DELETE em ambas as tabelas para `PUBLIC` — só service role pode mutar.
  - Audit log do Supabase Postgres registra toda query do service role (Supabase Dashboard).
  - Snapshots automáticos do Supabase (free tier: diário; pago: PITR).
- **Gap residual**: service role compartilhada entre devs em dev/staging. Em produção, role separada e em vault (Vercel env). Pendência Rodrigo: runbook de quem-tem-acesso-ao-quê (Sprint 2).

### V12 — Memory exhaustion / OOM via rate-limit
- **Categoria STRIDE**: Denial of Service
- **Ator**: Atacante externo
- **Cenário**: atacante manda requests com `x-forwarded-for` rotativo (IPs spoofados na CDN) → cria bucket por IP → cresce Map sem bound.
- **Mitigação atual**:
  - Hard cap de 50k buckets (NOVO).
  - Limpeza forçada quando atinge cap.
  - Limpeza por TTL de 10min em todos os buckets ociosos.
  - Limpeza por piso temporal (1min) garante que ataque rápido com chaves novas não bloqueia limpeza.
- **Gap residual**: nenhum identificado em Camada 1. Camada 2 (Upstash) não tem esse problema (Redis tem TTL nativo).

---

## 3. Riscos formalmente aceitos

### R1 — `'unsafe-inline'` em script-src e style-src
**Por quê**: Next.js 15 runtime injeta scripts inline; migrar para CSP nonce-based exige refactor de `_document.tsx` / `app/layout.tsx`. Custo alto, ROI baixo no MVP.

**Mitigação compensatória**: React escapa por default, ausência de `dangerouslySetInnerHTML`, audit trail de toda submissão.

**Quando reabrir**: Sprint pós-MVP de hardening. Owner: Fernanda + André.

### R2 — Rate limit Camada 1 (in-memory) reseta por deploy
**Por quê**: free tier — sem orçamento aprovado para Upstash. ~$10/mês não é zero pra contratos de governo.

**Mitigação compensatória**: rate limit Supabase nativo no login + audit trail + alerta de pico de 5xx (quando Rodrigo configurar).

**Quando reabrir**: Rafael aprovar orçamento. Pendência ativa.

### R3 — Política de senha em 6 chars (Supabase default)
**Por quê**: pendência Rafael. Aprovador tem MFA, então a senha não é único fator. Técnico em campo aceita 6 chars por usabilidade.

**Mitigação compensatória**: MFA obrigatório no aprovador faz 6 chars do aprovador "irrelevante". Técnico não tem operação destrutiva — força bruta dá só "ler/criar fichas pendentes" que aprovador filtra.

**Quando reabrir**: decisão Rafael (Sprint 1.S2).

### R4 — Confirm email desativado (ADR-0006)
**Por quê**: governo SP — email institucional já validado pelo órgão. Confirm email atrasaria onboarding sem ganho real.

**Mitigação compensatória**: allowlist explícita (não basta cadastrar — tem que estar na lista). Cadastro auto sem allowlist falha em runtime.

**Quando reabrir**: nunca, decidido em ADR-0006 com justificativa contratual.

### R5 — `construirSchemaZod` web legado mantém `.passthrough()`
**Por quê**: fluxo web está em produção desde Fase 1. Trocar pra `.strict()` exige varredura de payloads existentes em `fichas_visita.dados` para confirmar que nenhum campo "extra" legítimo entrou — Lucas detectou ao menos 2 campos órfãos no banco que precisam de schema antes de virar strict. Risco alto de quebrar fluxo aprovado.

**Mitigação compensatória**: fluxo TRIAGEM (mais nova) já usa `construirSchemaZodEstrito` (.strict()). Fluxo web legado não recebe payload do app móvel — só do dashboard interno (superfície menor). Logs estruturados em `obterFichaTriagem` capturariam padrões anômalos.

**Quando reabrir**: Sprint 1.S5 — Thiago roda regressão completa do dashboard com schema endurecido. Owner: Lucas + Thiago.

---

## 4. Próximos passos

1. **Pen-test interno** — Thiago + André, Sprint 2: race condition, IDOR de cross-aprovador, cron forjado, promoção atômica com falha simulada.
2. **Configurar Dependabot/Renovate** — Rodrigo, Sprint 1.S2.
3. **Configurar alertas SIEM** (5 thresholds em `owasp-review-sprint-1.md §A09`) — Rodrigo, Sprint 1.S3.
4. **Runbook de offboarding** — Marina, Sprint 2.
5. **Decisão Rafael** sobre senha e Upstash — Paula encaminha.
6. **Migração `construirSchemaZod` web → strict** — Lucas + Thiago, Sprint 1.S5.

---

**André — PO Segurança — Damasceno Dev OS — 2026-05-08**
