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
- [x] Domínio de produção conhecido: **`dash-sp-aguas.vercel.app`** (confirmado em 18/08/2026 contra `/api/health`, que respondeu `{"status":"ok","db":"ok"}`). O placeholder anterior, `spaguas-ficha-tecnica.vercel.app`, nunca existiu como deployment.

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

### 2.3.1 Sincronização do Monitor: usa o cron NATIVO da Vercel, não este serviço

Acrescentada em 18/08/2026, depois que a verificação encontrou o mapa do Monitor exibindo dado de
**34 dias atrás**. A sincronização existia apenas como disparo manual, dependia de um aprovador
logado lembrar de executá-la, e ninguém executou entre 15/07 e 18/08. A fonte do Estado estava
atualizada o tempo todo: quem parou foi a carga.

**Este job não é configurado aqui.** Cadência definida pelo Rafael em 18/08/2026: **uma vez por
dia**, o que cabe no limite do plano Hobby e dispensa provedor externo. Ele está declarado em
`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/sincronizar-monitor", "schedule": "0 9 * * *" }
  ]
}
```

`0 9 * * *` é 09:00 UTC, ou seja, 06:00 no horário de Brasília: o dado chega fresco antes do
expediente. A Vercel envia `Authorization: Bearer ${CRON_SECRET}` automaticamente quando a variável
existe no projeto, então não há nada a configurar além dela.

**Por que uma vez por dia basta.** A janela padrão de leituras é de 7 dias, então uma execução
perdida é recuperada pela seguinte sem intervenção. Se um dia a operação precisar de granularidade
maior, o caminho é mover este job para o cron-job.org, como o de liberação de locks, e **revisar
junto** a constante `HORAS_ATE_DEFASAR` (`src/domain/monitor/frescor-dado.ts`), que hoje é 36 horas
justamente para não acender aviso durante o intervalo normal de 24 horas entre cargas.

**Idempotente:** a carga é upsert por prefixo mais gravação de leitura por chave. Rodar duas vezes
não duplica nada.

**Como saber se parou.** É o modo de falha que já aconteceu, e ele é silencioso: nada quebra, a tela
simplesmente envelhece. Três verificações, da mais barata para a mais completa:

1. Abrir o Monitor. Desde 18/08/2026 a própria tela avisa quando a leitura mais recente passa de 36
   horas, com a data e a idade do dado, e oferece o botão de atualizar na hora.
2. Conferir o log por `cron.monitor_sync.sucesso`, emitido a cada execução mesmo quando grava zero
   linha, justamente para que silêncio signifique job parado e não job ocioso.
3. No banco: `SELECT MAX(ultima_transmissao) FROM estacoes_pluviometricas;` deve ficar dentro de
   pouco mais de um dia.

> **Pré-condição descoberta em 18/08/2026, e que valia para TODOS os jobs.** O middleware
> redirecionava `/api/cron/*` para `/login` com 307 antes de o handler ser alcançado. O serviço de
> cron seguia o redirecionamento, recebia o 200 da página de login e marcava a execução como
> bem-sucedida. Ou seja, os jobs deste runbook nunca chegaram a executar, e o painel do provedor
> mostrava verde. Corrigido liberando o prefixo `/api/cron/` no `rotaPublica` do middleware: a
> proteção real desses endpoints sempre foi o `CRON_SECRET` comparado em tempo constante dentro do
> handler, nunca a sessão.

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
