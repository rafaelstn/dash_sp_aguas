# Runbook — Alertas SIEM (segurança)

| Campo | Valor |
|-------|-------|
| Owner | Rodrigo (DevOps) |
| Sprint origem | 1.S3 |
| Pendência fechada | `docs/seguranca/owasp-review-sprint-1.md` §A09 + §5 #5 |
| Documento pai | `docs/seguranca/threat-model-sprint-1.md`, ADR-0008 |
| Estratégia (modo Pro — futuro) | Vercel Log Drains → webhook (Slack ou e-mail institucional) |
| Estratégia (modo Hobby — atual) | **Logs-only** — JSON estruturado em stdout, retenção Vercel 1h, revisão manual via dashboard. Logger preparado pra drain HTTP futuro via env vars. |
| Última revisão | 2026-05-08 |

---

## 0. Modo Hobby (atual) — operação compensatória

**Decisão Rafael (2026-05-08):** projeto fica em **Vercel Hobby (free)** por enquanto. Vercel Log Drains são feature do Pro — não dá pra ativar agora.

**Decisão Rodrigo (2026-05-08):** rodar em **modo logs-only** + preparar logger pra drain HTTP futuro:

| Componente | Status no Hobby | Observação |
|------------|-----------------|------------|
| Logger estruturado JSON (`src/infrastructure/logging/logger.ts`) | **ativo** — emite stdout/stderr | Mesmo formato que será consumido pelo drain quando ativar |
| Suporte opcional a drain HTTP no logger | **código pronto, desativado** | Ativa via env vars (`LOG_DRAIN_URL`, `LOG_DRAIN_TOKEN`, `LOG_DRAIN_MIN_SEVERITY`) — sem deploy de código |
| Vercel Logs (dashboard) | **única fonte de visibilidade** | Retenção 1h no Hobby (era 7 dias no Pro). Revisão manual diária do Rodrigo. |
| Alertas A1–A5 automáticos | **inativos** | Disparo é por convenção operacional: Rodrigo filtra `severidade:"security"` 1×/dia no dashboard |
| Alerta A3 (cron ausente) | **mitigação compensatória** | Notificação de falha do cron-job.org chega por e-mail (`cron-externo-hobby.md` §2.3) — cobre o gap principal |

**Quando Rafael decidir o canal de drain (Slack? Better Stack? Logtail? Axiom? caixa institucional?):**

1. Configurar duas env vars em Vercel Project Settings:
   - `LOG_DRAIN_URL` — endpoint HTTPS do destino.
   - `LOG_DRAIN_TOKEN` — Bearer token de autenticação no destino (se aplicável).
   - `LOG_DRAIN_MIN_SEVERITY` (opcional, default `security`) — filtrar quais eventos vão pro drain.
2. Re-deploy. Logger passa a emitir POST fire-and-forget pro destino.
3. Sem mudança de código — só configuração.

**Por que não escolher canal agora:** decisão postergada por Rafael. Logger preparado pra qualquer drain HTTP genérico, então pivot é flip de env var.

**Gaps aceitos no modo Hobby:**

- Alerta de IDOR (A1) não dispara em tempo real → revisão manual diária pega no dia seguinte. **Aceito pra MVP**, com plano de elevar pra Pro+drain antes de UAT do governo.
- Retenção de log de 1h é curta → registros importantes vazam se Rodrigo não fizer review diário. Mitigação: tabela `auditoria` (Postgres) cobre eventos de domínio (estados de triagem, aprovação) — log de aplicação só complementa.
- Brute force (A5) não dispara → Vercel WAF + rate limit do Supabase mitigam o pior caso.

Resto do runbook descreve a **arquitetura final (Pro)** — referência pra quando subir.

---

## 1. Decisão de arquitetura — por que **Log Drains**, não SIEM dedicado

**Cliente:** Governo SP. Contrato MVP, sem orçamento aprovado para Splunk/Datadog/Elastic Cloud.

**Avaliado:**

| Opção | Custo/mês | Esforço de setup | Nota |
|-------|-----------|------------------|------|
| **Vercel Log Drains + filtro JSON → Slack/e-mail** | 0 (Vercel) + free tier do destino | baixo | ✓ escolhida |
| Datadog Logs | ~$15/host/mês | médio | postergado |
| Elastic Cloud (self-hosted) | ~$50/mês mínimo | alto | rejeitado (custo + ops) |
| Sentry (logs) | ~$26/mês | baixo | considerado para FUTURO (já é usado em outros projetos da OS) |

**Decisão (Rodrigo, 2026-05-08):** começar com **Vercel Log Drains** porque:

1. Logger estruturado JSON (`src/infrastructure/logging/logger.ts`) já emite formato consumível por qualquer ferramenta.
2. Vercel exporta logs sem custo no plano Pro.
3. Drain destino aceita HTTPS endpoint qualquer — Slack webhook, e-mail via SMTP-over-HTTP, n8n, etc. Sem lock-in.
4. Migração futura para Sentry/Datadog é troca do drain, não do código de log.

**Decisão pendente (Rafael):** definir destino dos webhooks (Slack do projeto? Caixa institucional do cliente? Telegram?). Marcado em §6.

---

## 2. Formato canônico do log estruturado

Toda linha emitida pelo `logger.security` (e por extensão `logger.error`) tem formato fixo:

```json
{
  "ts": "2026-05-08T14:32:11.123Z",
  "severidade": "security",
  "evento": "seg.triagem.idor_blocked",
  "mensagem": "Tentativa de leitura cruzada bloqueada",
  "triagemId": "uuid",
  "usuarioId": "uuid",
  "donoId": "uuid",
  "estado": "pendente"
}
```

Chaves obrigatórias: `ts`, `severidade`, `evento`. Demais são contexto-dependentes mas estáveis por evento.

**Filtro genérico de alerta SIEM:**

```
severidade = "security" OR (severidade = "error" AND evento ~ "^cron\.")
```

---

## 3. Os 5 alertas — A1 a A5

### A1 — IDOR blocked (alta criticidade — tentativa ativa)

| Campo | Valor |
|-------|-------|
| Evento | `seg.triagem.idor_blocked` |
| Severidade do log | `security` |
| Onde é emitido | `src/application/use-cases/triagem/listar-triagem-pendentes.ts` (função `obterFichaTriagem`) |
| Trigger do alerta | **toda ocorrência** (1 evento já é alarme) |
| Janela | imediata |
| Destino | webhook + e-mail @André |
| Severidade do alerta | **CRÍTICA** |
| Ação | Triar imediatamente — usuário tentou acessar ficha alheia. Possível conta comprometida ou pen-test interno não-autorizado. |

**Filtro (DSL Vercel Log Drain):**
```
severidade:"security" AND evento:"seg.triagem.idor_blocked"
```

**Body do alerta:**
```
[A1] IDOR BLOCKED
Usuário {usuarioId} tentou ler ficha {triagemId} (dono real: {donoId}, estado: {estado}).
Timestamp: {ts}
Investigar: SELECT * FROM auditoria WHERE ator_id = '{usuarioId}' ORDER BY ocorreu_em DESC LIMIT 50;
```

---

### A2 — MFA rejected (sessão sem AAL2)

| Campo | Valor |
|-------|-------|
| Evento | `seg.triagem.aal_insuficiente` |
| Severidade do log | `security` |
| Onde é emitido | `src/app/api/triagem/_helpers.ts` (função `exigirSessaoAal2`) |
| Trigger do alerta | **>5 ocorrências do mesmo `usuarioId` em 5min** |
| Janela | 5min sliding |
| Destino | webhook |
| Severidade do alerta | **ALTA** |
| Ação | Possível phishing/cookie roubado de aprovador. Forçar logout + rotação MFA. |

**Filtro:**
```
severidade:"security" AND evento:"seg.triagem.aal_insuficiente"
```

**Lógica de threshold:** agregar por `usuarioId` em janela 5min. Disparar quando `count >= 5`.

**Implementação no destino:** em Slack, usar Bolt + Redis pra contagem; em e-mail, configurar threshold no log drain (Vercel suporta filtro com `count` em alguns drains).

**Body:**
```
[A2] MFA REJECTED
Usuário {usuarioId} teve {N} tentativas em sessão aal1 nos últimos 5min.
AAL atual: {aalAtual}.
Ação imediata: forçar logout e revisar fatores MFA do usuário no Supabase Dashboard.
```

---

### A3 — Cron ausente (heartbeat perdido)

| Campo | Valor |
|-------|-------|
| Evento | **ausência** de heartbeat (sem log positivo) |
| Severidade do log | n/a (alerta por *ausência*) |
| Onde é checado | tabela `cron_heartbeats` (`MAX(ocorreu_em)` por job) |
| Trigger do alerta | `MAX(ocorreu_em) < NOW() - INTERVAL '10 minutes'` |
| Janela | check a cada 5min |
| Destino | webhook + e-mail @Rodrigo |
| Severidade do alerta | **ALTA** |
| Ação | Ver `docs/runbooks/vercel-cron.md` §4.3. Investigar Vercel Cron + Supabase + secret. |

**Implementação em duas opções:**

**Opção A — Polling no `/api/health` (sem dep nova):**
Adicionar a rota `/api/health` (já existe) checando heartbeat e retornar 503 se atrasado. Monitor externo (UptimeRobot free, ou GitHub Actions a cada 5min) bate em `/api/health` e dispara webhook quando 503. **Decisão atual: implementar em Sprint 1.S4** (Rodrigo) — `/api/health` precisa de hardening pra não expor info pública.

**Opção B — Query SQL agendada (Supabase Edge Function):**
Edge function dispara em cron próprio (5min) e checa `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(ocorreu_em))) FROM cron_heartbeats WHERE job = ...`. Webhook se > 600s.

**Decisão (Rodrigo, 2026-05-08):** começar com **opção A** porque já temos `/api/health`. Edge function só se virar requisito.

**Body:**
```
[A3] CRON AUSENTE
Job {job} sem heartbeat há mais de 10min.
Última execução: {ultimoHeartbeat} ({minutosAtras} min atrás).
Próximo passo: vercel-cron.md §4.3 + verificar Supabase status.
```

---

### A4 — Pico de 5xx

| Campo | Valor |
|-------|-------|
| Evento | `evento_inesperado` em qualquer rota (severidade `error`) ou status code 5xx |
| Severidade do log | `error` |
| Onde é emitido | `src/app/api/triagem/_helpers.ts` (função `respostaDeErro`) + Vercel runtime |
| Trigger do alerta | **>5% das requests em janela de 5min** com status 5xx |
| Janela | 5min sliding |
| Destino | webhook |
| Severidade do alerta | **MÉDIA** |
| Ação | Verificar Vercel Logs + correlationId. Possível bug + DB indisponível + dependência externa fora. |

**Filtro:**
```
severidade:"error" AND evento:"erro_inesperado"
```

**Threshold via Vercel Observability:** painel `5xx Rate` com alert rule `> 5% over 5min`. Exporta pra webhook.

**Body:**
```
[A4] PICO DE 5xx
Taxa atual: {taxa}% (>5% threshold).
Rotas afetadas: {top3}.
correlationIds amostra: {ids}.
Última correlationId: link pro log.
```

---

### A5 — Brute force login

| Campo | Valor |
|-------|-------|
| Evento | falha de login na camada Supabase (status 401/422 em `/auth/v1/token`) |
| Onde é capturado | Vercel HTTP logs (não código nosso — gate é Supabase) |
| Trigger do alerta | **>10 falhas em 1min do mesmo IP** |
| Janela | 1min |
| Destino | webhook + bloqueio temporário |
| Severidade do alerta | **MÉDIA** |
| Ação | Bloquear IP por 1h via Vercel WAF rule (manual no painel). Investigar pattern. |

**Filtro Vercel logs HTTP:**
```
path:"/api/auth*" AND status:>=400 AND status:<500
```

**Threshold via Vercel Observability rule:** count by `ip` > 10 in 1min.

**Bloqueio temporário:**
- Manual: Project → Firewall → Add Rule → IP block (1h).
- Automatizado (futuro): integrar com Cloudflare ou Vercel WAF API. Postergado pra Sprint 2 — risco baixo enquanto operação humana monitora.

**Body:**
```
[A5] BRUTE FORCE LOGIN
IP {ip} fez {N} tentativas em 1min.
Email tentado: {emails} (top 3).
Ação sugerida: bloquear IP por 1h via Vercel Firewall.
```

---

## 4. Tabela-resumo dos thresholds

| Alerta | Trigger | Janela | Severidade | SLA de resposta |
|--------|---------|--------|------------|-----------------|
| A1 IDOR | 1 evento | imediata | crítica | 1h |
| A2 MFA rejected | >5 / usuário | 5min | alta | 4h |
| A3 Cron ausente | >10min sem heartbeat | check 5min | alta | 4h |
| A4 5xx pico | >5% de requests | 5min | média | 8h |
| A5 Brute force | >10 / IP | 1min | média | 4h |

SLA de resposta = tempo entre alerta disparar e haver triagem registrada (não resolução).

---

## 5. Setup operacional dos drains (modo Pro — futuro)

> **Modo atual (Hobby): logs-only.** Esta seção descreve a configuração quando subir pra Pro **OU** quando Rafael decidir um canal e habilitar o drain HTTP via env vars no logger (ver §0 + §5.5).

### 5.1 Pré-requisitos

- [ ] Plano Vercel Pro (Log Drains não estão no Hobby) **OU** drain HTTP do logger configurado via env vars.
- [ ] Webhook de destino configurado (Slack incoming webhook OU SMTP-over-HTTP OU Better Stack/Logtail/Axiom).
- [ ] `CRON_SECRET` rotacionado nos últimos 90 dias.
- [ ] Logger estruturado em uso (verificado: `src/infrastructure/logging/logger.ts` já está em produção desde Sprint 1.S3, com extensão de drain HTTP pronta na Sprint 1.S3.A).

### 5.2 Configurar drain no painel Vercel

```
Account Settings → Log Drains → Create Log Drain
├─ Source: Project SPAGUAS Ficha Técnica
├─ Type: HTTPS
├─ Endpoint: <URL do webhook>
├─ Filter: severidade:"security" OR severidade:"error"
└─ Custom secret header: X-Log-Drain-Secret = <secret>
```

Custom secret header impede webhook ser disparado por terceiros — destino valida o header.

### 5.3 Testar drain

```bash
# Forçar 5xx pra ver A4 disparar
curl -X POST https://<dominio-prod>/api/triagem/<id-inexistente>/aprovar

# Esperado: drain entrega evento "erro_inesperado" no destino em ≤30s
```

### 5.4 Rotação de credencial

A cada 90 dias:
- Webhook secret → rotar no destino + atualizar no painel Vercel.
- Endpoint URL → trocar se houver suspeita.

### 5.5 Setup alternativo no Hobby — drain HTTP do logger

Sem precisar subir pra Pro, é possível ativar drain HTTP direto pelo `logger.ts`. Útil pra usar **Better Stack/Logtail (free 1GB/mês)** ou **Axiom (free 500GB/mês)**.

```
1. Criar conta no destino (ex.: Better Stack):
   └─ Dashboard → Sources → Add HTTP source
   └─ Copiar endpoint URL + token de ingestão.

2. Configurar 2 env vars em Vercel Project Settings (Production + Preview):
   - LOG_DRAIN_URL    = <endpoint HTTPS>
   - LOG_DRAIN_TOKEN  = <Bearer token do destino>

   Opcional:
   - LOG_DRAIN_MIN_SEVERITY = security
     (default: "security". Outras opções: warn, error)

3. Re-deploy (qualquer commit ou redeploy manual).

4. Validar:
   - Forçar evento de teste:
     curl -X POST -H "x-cron-secret: $CRON_SECRET" \
       https://<dominio>/api/cron/liberar-locks-expirados
     (gera log info — não dispara drain se MIN_SEVERITY=security; ajustar pra warn se quiser ver agora)
   - Forçar IDOR (logado em produção real ou em staging):
     usuário A tenta GET /triagem/<id-do-B>/ficha
     => evento seg.triagem.idor_blocked → drain → destino em ≤2s.

5. Verificar no destino: payload JSON canônico (ver §2).
```

**Comportamento do drain do logger:**
- Fire-and-forget: chamada HTTP em background, não bloqueia a request.
- Timeout 2s por POST; falha silenciosa (cai no console como fallback).
- Sem `LOG_DRAIN_URL` configurado: drain inativo, apenas console (modo atual).
- Sem retry: aceitamos perder eventos ocasionais — é monitoring auxiliar, não auditoria.

**Limites:**
- Não substitui Vercel Log Drains pra HTTP logs (5xx, brute force) — essas alertas (A4, A5) ainda exigem Pro ou ferramenta no edge (Cloudflare/WAF).
- Para A1, A2, A3 (eventos de aplicação, gravados pelo logger), o drain HTTP **cobre 100%** — equivalente funcional do Pro.

---

## 6. Pendências de input externo

| Pendência | Owner | Bloqueia |
|-----------|-------|----------|
| Definir destino do drain (Slack? Better Stack? Axiom? Logtail? E-mail institucional?) | Paula → Rafael → cliente | Setup §5.2 ou §5.5 |
| Aprovar plano Vercel Pro (Log Drains nativos + retenção 7d) | Rafael (orçamento) | §5.2 — alternativa: §5.5 cobre A1/A2/A3 sem subir |
| Decidir se `/api/health` será público ou só monitor externo | Rodrigo + André (Sprint 1.S4) | A3 implementação no modo Pro |

Enquanto pendências não fecham (modo Hobby atual):

- **Mitigação compensatória:** logs estruturados ficam disponíveis em **Vercel Logs** com retenção 1h no Hobby. Rodrigo faz **revisão diária manual** no painel filtrando `severidade:"security"` (5min de check). Eventos críticos de domínio (estados de triagem, aprovação) duplicam em `auditoria` (Postgres) — auditoria persistente independente do log de aplicação.
- **Alarme A3 (cron):** notificação de falha do **cron-job.org** (configurada em `cron-externo-hobby.md` §2.3) chega por e-mail em ≤5min após falha consecutiva. Cobre o gap principal sem depender de Postgres ou drain.
- **Alarme A1 (IDOR):** review diário manual + `auditoria` table. Aceito pra MVP; **plano de elevar antes de UAT do governo** — drain HTTP via §5.5 é caminho rápido (sem custo Vercel adicional).

---

## 7. Quando reabrir este runbook

| Gatilho | Ação |
|---------|------|
| Cliente aprovou Slack/e-mail oficial | Atualizar §5.2 + ativar drains |
| Sentry virou orçamento aprovado | Substituir destino + manter formato JSON |
| Terceiro alerta de incidente real | Ajustar threshold do alerta correspondente |
| Plano Vercel mudar | Verificar se Log Drains continuam disponíveis |

---

## 8. Anexo: o que NÃO logamos (regra de PII)

Lembrete pra quem mexer no logger:

- **Nunca logar `dados` de ficha** (campos hidrométricos podem ter PII residual mesmo o schema não pedindo).
- **Nunca logar `password`, `token`, `secret`, body de auth.**
- **Email pode ir** em log de segurança (login failed) — política do governo SP aceita pra detecção de phishing. Documentado.
- **CPF, RG, telefone**: NÃO. Schema da ficha não pede; se algum endpoint legado emitir, abrir issue imediato.

---

**Rodrigo — PO DevOps — Damasceno Dev OS — 2026-05-08**
