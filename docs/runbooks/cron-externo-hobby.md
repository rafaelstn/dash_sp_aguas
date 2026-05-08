# Runbook — Cron externo (modo Vercel Hobby)

| Campo | Valor |
|-------|-------|
| Owner | Rodrigo (DevOps) |
| Sprint origem | 1.S3.A (ajuste pós-decisão Hobby) |
| Plano Vercel | **Hobby (free)** — schedules nativos limitados a 1×/dia |
| Documento pai | `docs/runbooks/vercel-cron.md` (modo Pro, congelado), ADR-0008 §10 |
| Provedor escolhido | **cron-job.org** (free tier) |
| Endpoint disparado | `GET https://<dominio>/api/cron/liberar-locks-expirados` |
| Cadência | `*/5 * * * *` (a cada 5 minutos) |
| Última revisão | 2026-05-08 |

---

## 1. Contexto e decisão

### 1.1 Problema

Vercel Hobby aceita `crons` em `vercel.json`, mas **só com schedule diário** (1×/dia mínimo). O caso de uso do projeto — liberação de locks expirados em `triagem_locks` (TTL de 1h) — exige cadência sub-horária pra UX aceitável: lock fantasma no máximo +5min após o TTL estourar.

Se mantivéssemos Vercel Cron diário, um aprovador que abandonasse uma triagem prenderia a ficha por até **24h** após o TTL expirar — degradação severa do fluxo do governo SP.

### 1.2 Opções avaliadas

| Opção | Custo | Confiabilidade | Setup | Veredicto |
|-------|-------|----------------|-------|-----------|
| **A — cron-job.org (free)** | 0 (free tier 50 jobs, schedule 1min) | alta — provedor dedicado, dashboard + retry | ~30min | **escolhida** |
| B — GitHub Actions schedule | 0 em repo público; minutes do plano em privado | **baixa** — GitHub documenta skips silenciosos quando repo tem baixa atividade ou em períodos de alta carga global; não recomendado pra cron operacional | ~15min | rejeitada |
| C — Vercel Cron diário + TTL 24h | 0 | alta | trivial | rejeitada — degrada UX, exige ADR pra mudar TTL do schema |
| D — Auto-agendamento Edge `setTimeout` | 0 | nenhuma — serverless cold mata o timer | trivial | inviável |
| E — Upgrade pra Pro ($20/mês) | $20 | alta | trivial | postergado — não justifica enquanto MVP |

**Decisão (Rodrigo, 2026-05-08):** opção A. Cron-job.org isola operação infra do repo (PRs do Dependabot e CI já saturam o canal Actions) e tem dashboard com histórico de execução, retry automático e alerta de falha — superior ao schedule do Actions pra cron operacional.

Migrar pra Vercel Cron nativo quando subir pra Pro (ver `docs/runbooks/vercel-cron.md`).

---

## 2. Setup inicial — passo-a-passo

### 2.1 Pré-requisitos

- [ ] `CRON_SECRET` configurado em Vercel Project Settings → Environment Variables (Production + Preview, mesmo valor, ≥32 chars).
- [ ] Endpoint `/api/cron/liberar-locks-expirados` deployado em produção e respondendo 200 quando chamado com header válido (testar manualmente antes — §6).
- [ ] Domínio de produção conhecido. Placeholder atual: `spaguas-ficha-tecnica.vercel.app` `<<placeholder até confirmação Rafael>>`.

### 2.2 Criar conta no cron-job.org

```
1. Acessar https://cron-job.org
2. Criar conta com e-mail institucional do projeto
   └─ Recomendado: criar caixa compartilhada (ex.: devops+spaguas@<dominio>)
      pra rotação de owner sem reset de senha.
3. Ativar 2FA (TOTP).
4. Confirmar plano Free — limites suficientes pro MVP:
   - 50 jobs simultâneos
   - schedule mínimo de 1 minuto
   - histórico de execução de 24h
   - notificação de falha por e-mail
```

### 2.3 Criar o cron job

```
Dashboard → Jobs → Create cronjob

Title:     SPAGUAS - liberar locks expirados
URL:       https://<dominio-prod>/api/cron/liberar-locks-expirados
                ^^^^^^^^^^^^^^^^^
                (substituir pelo domínio real quando confirmado)

Schedule:  Every 5 minutes
           Cron expression: */5 * * * *
           Timezone: UTC (não importa pra essa frequência)

Request method: GET

Headers:
  Authorization: Bearer <valor de CRON_SECRET>
  User-Agent:    cron-job.org/spaguas-liberar-locks

(Opcional)
Treat 2xx as success: yes
Save responses: yes (últimas 10 — útil pra debug, não vaza secret)

Notifications:
  Notify on failure: yes
  Notify on success: no (ruído)
  Notify on disabled: yes (caso o serviço pause o job por falhas consecutivas)

Failure tolerance:
  Retry on failure: 1
  Retry delay: 60s
```

### 2.4 Validar primeira execução

```
1. Dashboard → Jobs → SPAGUAS - liberar locks expirados → Run now
2. Aguardar resposta (~1s).
3. Esperado: HTTP 200 + body { "liberados": [], "quantidade": N, "duracaoMs": <100 }
4. Confirmar heartbeat na tabela cron_heartbeats:

   SELECT ocorreu_em AT TIME ZONE 'America/Sao_Paulo' AS ocorreu_brt,
          duracao_ms,
          payload->>'quantidade' AS qtd
   FROM cron_heartbeats
   WHERE job = 'triagem-liberar-locks-expirados'
   ORDER BY ocorreu_em DESC
   LIMIT 5;

5. Esperado: linha nova nos últimos 60s.
```

Se 401 → secret divergente entre Vercel e cron-job.org. Re-checar §2.3.
Se 500 → ver Vercel Logs do deploy. Provável DB indisponível.

---

## 3. Como o CRON_SECRET é validado

O handler `/api/cron/liberar-locks-expirados` aceita o secret em duas formas (ver `vercel-cron.md` §2 — comportamento foi mantido pra compatibilidade):

| Forma | Quem usa |
|-------|----------|
| `Authorization: Bearer <secret>` | cron-job.org (configurado em §2.3) e Vercel Cron nativo (futuro Pro) |
| `x-cron-secret: <secret>` | curl manual em emergência (`vercel-cron.md` §5.1) |

Comparação no servidor: igualdade simples (não constant-time porque o secret nunca chega ao público — só ao log de erro caso de bug). Se mudar pra constant-time futuramente, sem impacto neste runbook.

---

## 4. Operação rotineira

### 4.1 Verificações semanais (toda segunda-feira, junto com triagem do Dependabot)

- [ ] Dashboard cron-job.org → SPAGUAS job → Last 24h: ≥288 execuções esperadas (12/h × 24h = 288).
- [ ] Quaisquer falhas → investigar pelo log do dashboard + Vercel Logs.
- [ ] Tabela `cron_heartbeats`: query do §2.4 deve mostrar gap máximo entre `ocorreu_em` < 6 minutos.

### 4.2 Sinais de degradação

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Falhas isoladas (1-2/dia) | Latência de cold start Vercel | aceitar — heartbeat na próxima rodada cobre |
| Falhas consecutivas (≥3) | Endpoint 5xx OU secret rotacionado em uma ponta | §5 |
| Job pausado pelo provedor | cron-job.org desativa após N falhas consecutivas (limite do free tier) | reativar manual + investigar root cause |
| Heartbeat ausente apesar de 200 no provedor | DB indisponível ou bug no use case | Vercel Logs + Supabase status |

---

## 5. Rotação do `CRON_SECRET` no fluxo Hobby

Política trimestral (ver `vercel-cron.md` §6). No fluxo Hobby, o passo extra é **atualizar o cron-job.org** junto:

```
1. Gerar novo secret: openssl rand -base64 48
   └─ Guardar em 1Password.

2. Atualizar Vercel (Project Settings → Env Vars → CRON_SECRET).
   └─ Vercel re-deploy automático.

3. Imediatamente em seguida, atualizar cron-job.org:
   Dashboard → Jobs → SPAGUAS → Edit → Headers → Authorization
   └─ Trocar pro novo Bearer.

4. Rodar manualmente (Run now). Esperado: 200.

5. Aguardar 10min. Verificar histórico:
   - Vercel Logs: 200 nas últimas execuções.
   - cron_heartbeats: nova linha.

6. Documentar em CHANGELOG.md.
```

Janela aceita de inconsistência: até o passo 3 ser feito, próxima execução do cron retornará 401. Como o use case é idempotente e roda a cada 5min, perder 1-2 execuções é irrelevante — locks expirados pegam na rodada seguinte.

---

## 6. Disparo manual em emergência

Mesmo procedimento do `vercel-cron.md` §5.1:

```bash
curl -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  https://<dominio-prod>/api/cron/liberar-locks-expirados
```

Independente do provedor de cron — o handler aceita disparo manual sem passar pelo cron-job.org.

---

## 7. Se cron-job.org cair

Provedor terceiro = ponto de falha. Mitigações:

| Cenário | Ação imediata |
|---------|---------------|
| cron-job.org indisponível < 1h | aceitar — locks fantasmas máximo +1h, reconcilia ao voltar |
| cron-job.org indisponível > 1h | criar workflow GitHub Actions emergencial (template pronto em `.github/workflows-templates/cron-emergencial.yml.example` — quando criado) **OU** disparo manual a cada 30min até voltar |
| cron-job.org descontinuado | migrar pra alternativa: EasyCron, healthchecks.io, ou subir pra Vercel Pro |

**Compromisso de SLO:** lock fantasma máximo aceito em produção = **30min**. Acima disso, escalar pra dispatch manual ou contingência.

---

## 8. Pendências

| Pendência | Owner | Bloqueia |
|-----------|-------|----------|
| Confirmação do domínio de produção | Paula → Rafael → cliente | Setup §2.3 (URL real do job) |
| Criação da conta cron-job.org com caixa institucional | Rodrigo | Setup §2.2 — pode usar conta pessoal de Rafael temporariamente, migrar depois |
| Decisão de subir pra Vercel Pro | Rafael (orçamento) | Migração de volta pro cron nativo |

---

## 9. Quando arquivar este runbook

Quando o projeto migrar pra Vercel Pro:

1. Reativar `crons` em `vercel.json` (template guardado em `vercel-cron.md` §7).
2. Pausar o job no cron-job.org (não apagar — fica como fallback documentado por 30 dias).
3. Validar 24h de operação Vercel Cron.
4. Apagar o job no cron-job.org.
5. Mover este runbook pra `docs/runbooks/_arquivados/` com nota de "substituído por vercel-cron.md em YYYY-MM-DD".

---

**Rodrigo — PO DevOps — Damasceno Dev OS — 2026-05-08**
