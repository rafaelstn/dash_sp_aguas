# Runbook — Vercel Cron + heartbeat (modo Pro — congelado)

| Campo | Valor |
|-------|-------|
| Owner | Rodrigo (DevOps) |
| Sprint origem | 1.S3 (antecipação da pendência #6) |
| Status | **CONGELADO** — projeto está em Vercel Hobby (free); cron nativo só dá pra ativar no Pro. |
| Runbook ativo agora | `docs/runbooks/cron-externo-hobby.md` (cron-job.org disparando o mesmo endpoint) |
| Documento pai | ADR-0008 §10, `supabase/migrations/0026_triagem_locks.sql`, `supabase/migrations/0027_cron_heartbeats.sql` |
| Configuração | `vercel.json` (sem `crons` no Hobby — voltam quando subir pra Pro), `src/app/api/cron/liberar-locks-expirados/route.ts` |
| Última revisão | 2026-05-08 |

---

## 0. Por que este runbook está congelado

Vercel Hobby não suporta `crons` com schedule sub-diário. Como precisamos `*/5 * * * *` (locks com TTL de 1h), movemos a operação pra cron-job.org externo. **Este documento permanece como referência pra reativação quando subir pra Pro.**

Para operação atual: `docs/runbooks/cron-externo-hobby.md`.

Para reativar este modo:
1. Subir o plano pra Pro no painel da Vercel.
2. Restaurar bloco `crons` no `vercel.json` (template em §7 abaixo).
3. Pausar o job no cron-job.org.
4. Seguir checklist do §8.

---

## 1. Visão geral (modo Pro)

| Item | Valor |
|------|-------|
| Job ID | `triagem-liberar-locks-expirados` |
| Schedule | `*/5 * * * *` (a cada 5 minutos) |
| Path | `/api/cron/liberar-locks-expirados` |
| Método disparado pelo Vercel | `GET` |
| Métodos aceitos | `GET` (Vercel) + `POST` (manual) |
| Autenticação | `Authorization: Bearer ${CRON_SECRET}` (Vercel) **ou** `x-cron-secret: ${CRON_SECRET}` (manual) |
| Timeout | 60s (default Vercel — função leve, ~50ms) |
| Heartbeat | tabela `cron_heartbeats` (Postgres) |
| Alerta de saúde | A3 em `docs/runbooks/alertas-siem.md` |

---

## 2. Como o Vercel Cron envia a requisição

A plataforma envia GET com:

```
Authorization: Bearer ${CRON_SECRET}
User-Agent: vercel-cron/1.0
```

**Não dá pra customizar headers em `vercel.json`** (limitação documentada da Vercel). Por isso o handler aceita tanto `Authorization: Bearer` quanto `x-cron-secret`.

`CRON_SECRET` deve ser configurado em **Project Settings → Environment Variables** (escopo Production + Preview), nunca no repo. Mínimo 32 caracteres aleatórios.

Para gerar:

```bash
openssl rand -base64 48
```

Cole no painel da Vercel sem aspas, sem espaço.

---

## 3. Heartbeat — como funciona

A cada execução bem-sucedida, o use case grava uma linha em `cron_heartbeats`:

| Coluna | Valor de exemplo |
|--------|------------------|
| `job` | `triagem-liberar-locks-expirados` |
| `ocorreu_em` | `2026-05-08 14:35:00.123-03` |
| `duracao_ms` | `52` |
| `payload` | `{"quantidade": 0}` |

A mesma chamada **descarta linhas com mais de 7 dias** do mesmo job — retenção operacional. Janela de alerta é 10min, qualquer coisa antiga é histórico.

Decisão de fazer heartbeat em Postgres (não UptimeRobot/BetterStack):

- Custo zero (Supabase já no stack).
- Sem credencial extra pra rotacionar.
- Audit interno (governo SP gosta de ter tudo no DB que ele controla).
- Auto-referência aceita: se Postgres cair, **alerta A3 dispara igual** (ausência de heartbeat).

O heartbeat continua ativo no modo Hobby — quem dispara o endpoint (cron-job.org) não importa pra essa parte; é o use case que grava.

---

## 4. Verificar histórico de execução

### 4.1 Pelo painel Vercel

```
Project → Deployments → Functions → /api/cron/liberar-locks-expirados → Logs
```

Filtrar por `evento:cron.liberar_locks.sucesso` ou `evento:cron.liberar_locks.falha` (logs estruturados em JSON).

### 4.2 Pela tabela `cron_heartbeats`

```sql
SELECT
  ocorreu_em AT TIME ZONE 'America/Sao_Paulo' AS ocorreu_brt,
  duracao_ms,
  payload->>'quantidade' AS qtd_liberados
FROM cron_heartbeats
WHERE job = 'triagem-liberar-locks-expirados'
ORDER BY ocorreu_em DESC
LIMIT 24;
```

Esperado em operação normal: 1 linha a cada 5min, `duracao_ms` < 200ms, `quantidade` quase sempre `0`.

### 4.3 Quando alarme A3 disparar

Significa que **não há heartbeat há mais de 10min**. Possíveis causas:

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Vercel logs mostram 401 | `CRON_SECRET` mudou em uma ponta só | Re-sincronizar (§6) |
| Vercel logs mostram 500 | DB caiu ou conexão estourou | Ver `/api/health` + Supabase status |
| Vercel logs mostram 429 | rate-limit estouro (quase impossível com 5min) | Investigar atacante usando o path |
| Vercel logs vazios | Cron não está rodando | Ver §5 (rodar manual + Project Settings) |

No modo Hobby, vale o equivalente do dashboard cron-job.org — ver `cron-externo-hobby.md` §4.

---

## 5. Como rodar manualmente em emergência

### 5.1 Via curl (mais comum)

```bash
# Substitua $CRON_SECRET pelo valor do env-var de PRODUCTION
# (NÃO commite o secret. Use 1Password ou pegue do Vercel Settings)

curl -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  https://<dominio-prod>/api/cron/liberar-locks-expirados

# Resposta esperada (200):
# {"liberados":[],"quantidade":0,"duracaoMs":42}
```

`<dominio-prod>` é **`dash-sp-aguas.vercel.app`** (confirmado em 18/08/2026). O placeholder anterior, `spaguas-ficha-tecnica.vercel.app`, nunca existiu como deployment.

### 5.2 Via painel Vercel — disparo on-demand (apenas Pro)

```
Project → Cron Jobs → triagem-liberar-locks-expirados → Run
```

No Hobby, esse botão não existe — usar curl (§5.1) ou o "Run now" do cron-job.org.

### 5.3 Em ambiente local

`CRON_SECRET` em `.env.local` com 32+ chars. Rodar:

```bash
curl -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  http://localhost:3000/api/cron/liberar-locks-expirados
```

Mock repository não persiste heartbeat (no-op) — é esperado em modo demo.

---

## 6. Como rotacionar `CRON_SECRET`

Política: rotação **trimestral** + **imediata** se houver suspeita de vazamento (commit acidental, ex-funcionário, etc).

**No modo Hobby atual, o passo extra é atualizar o cron-job.org junto** — ver `cron-externo-hobby.md` §5.

### 6.1 Procedimento sem janela (zero-downtime, modo Pro)

```
1. Gerar novo secret: openssl rand -base64 48
   └─ Guardar em 1Password como "SPAGUAS_CRON_SECRET_<YYYY-MM-DD>".

2. Adicionar como SEGUNDA env-var TEMPORÁRIA:
   └─ Project → Env Vars → CRON_SECRET_NEW = <novo>
   (não toca CRON_SECRET ainda)

3. EDITAR o handler temporariamente (PR de 1 linha):
   └─ Aceitar tanto CRON_SECRET quanto CRON_SECRET_NEW na comparação
      (lógica de fallback). Deploy.

4. Trocar CRON_SECRET pra novo valor:
   └─ Project → Env Vars → CRON_SECRET = <mesmo novo valor>
   └─ Vercel re-deploy automático

5. Aguardar 1 hora — Vercel Cron pega novo secret.

6. Verificar logs: 200 nas últimas execuções (sem 401).

7. Reverter o PR temporário (volta a aceitar só CRON_SECRET).
   └─ Remover CRON_SECRET_NEW das env vars.

8. Rotação concluída. Documentar em CHANGELOG.md.
```

### 6.2 Procedimento com janela (mais simples — preferido pra rotação rotineira)

```
1. Gerar novo secret.
2. Atualizar CRON_SECRET no Vercel.
3. Vercel re-deploy automático (~30s).
4. Esperar 5min — próxima execução do cron.
5. Verificar log: deve estar 200.
6. Se falhou: rollback do env-var pro valor antigo.
```

Janela de "1 cron perdido" (5min) é aceitável — o use case é idempotente, locks expirados pegam na próxima rodada.

---

## 7. Ajustar a frequência (cadência) — válido só no Pro

Editar `vercel.json` — **template para reativação no Pro**:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/liberar-locks-expirados",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Sintaxe cron Vercel: aceita `*/N`, ranges, listas. Mínimo permitido pelo plano Pro: **1 minuto**. Plano Hobby: **dia** (por isso o bloco está fora).

Se for diminuir pra 1min, considerar:

- Carga no DB (10× mais writes em `cron_heartbeats`).
- Custo de função Vercel (free tier: 100 GB-h/mês — folga grande, mas atenção).
- Janela de alerta A3 cai pra 2-3min.

Recomendação atual: **5min** é o sweet spot. Lock fantasma máximo = 5min após TTL de 1h estourar — irrelevante operacionalmente.

---

## 8. Checklist pós-deploy do cron (modo Pro — quando reativar)

Após qualquer mudança no `vercel.json` ou no handler:

- [ ] `vercel.json` validado (Vercel rejeita sintaxe inválida no deploy)
- [ ] `CRON_SECRET` presente em **Production** + **Preview** (mesmo valor)
- [ ] Aguardar 5min após deploy
- [ ] Verificar `cron_heartbeats` recebeu nova linha
- [ ] Verificar Vercel Logs — última execução em 200
- [ ] Se mudou schedule: confirmar no painel **Project → Cron Jobs** que aparece o cronograma novo
- [ ] Pausar (não apagar) o job correspondente no cron-job.org após 24h de operação Vercel estável

---

## 9. Limites conhecidos

| Limite | Valor | Mitigação |
|--------|-------|-----------|
| Headers customizados em `vercel.json` | não suportado | usar `Authorization: Bearer` (Vercel default) |
| **Plano Hobby: schedule mínimo** | **diário** | **operação atual via cron-job.org — `cron-externo-hobby.md`** |
| Vercel Cron timeout | mesmo da função (60s default) | aumentar via `maxDuration` se precisar |
| Heartbeat em modo demo | no-op (mock repo) | aceitável (só prod tem alerta A3) |
| Secret em log de incidente | risco | log sempre escapa via `String(erro)` — sem secret |

---

**Rodrigo — PO DevOps — Damasceno Dev OS — 2026-05-08**
