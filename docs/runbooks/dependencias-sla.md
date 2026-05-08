# Runbook — SLA e processo de atualização de dependências

| Campo | Valor |
|-------|-------|
| Owner | Rodrigo (DevOps) |
| Sprint origem | 1.S3 |
| Pendência fechada | `docs/seguranca/owasp-review-sprint-1.md` §A06 + §5 #2 |
| Documento pai | ADR-0008, `governo.md` |
| Configuração | `.github/dependabot.yml` |
| Última revisão | 2026-05-08 |

Este runbook define **como tratar atualizações de dependência** (rotina e urgência) no projeto SPÁguas Ficha Técnica. Cliente Governo SP — exige rastreabilidade de patches por contrato.

---

## 1. SLA por severidade da CVE

Tabela canônica — qualquer desvio precisa de ADR.

| Severidade | Critério (CVSS v3.1) | SLA até merge em `main` | Quem aprova |
|------------|----------------------|-------------------------|-------------|
| **Crítica** | 9.0 – 10.0 | **7 dias corridos** | André + Rafael |
| **Alta**    | 7.0 – 8.9  | **14 dias corridos**    | André |
| **Média**   | 4.0 – 6.9  | **30 dias corridos**    | Rodrigo |
| **Baixa**   | < 4.0      | **Trimestral** (próxima janela) | Rodrigo |

**Regra de governo (`governo.md`):** atualização que envolve componente em allowlist do órgão (TLS, autenticação, criptografia) sobe um nível na criticidade.

**Contagem do SLA:** começa na data do GHSA (security advisory) que originou o PR, **não** na data do PR. Dependabot inclui `GHSA-xxxx` no body do PR — usar essa data.

---

## 2. Política de schedule (rotina)

Configurada em `.github/dependabot.yml`:

- **Cadência:** semanal, segunda-feira 06:00 BRT.
- **Patch + minor:** PR automático.
- **Major:** **bloqueado** via `ignore: version-update:semver-major`. Quando precisa subir major, abrir manualmente com ADR-0009+ explicando impacto.
- **Auto-merge:** **desativado**. Política revisada quando Thiago entregar suíte E2E (Sprint 2).
- **Limite simultâneo:** 10 PRs npm + 5 PRs GitHub Actions.

---

## 3. Agrupamentos (anti-PR-storm)

Dependabot agrupa em um único PR:

| Grupo | Pacotes | Por quê |
|-------|---------|---------|
| `next-react` | `next`, `eslint-config-next`, `react`, `react-dom`, `@types/react`, `@types/react-dom` | Matriz acoplada — Next 15.5 exige React 19; subir um sem outro quebra build. |
| `supabase` | `@supabase/*` | SDKs costumam mover juntos em minor (auth + ssr). |
| `serwist` | `serwist`, `@serwist/*` | Plugin + runtime do PWA versionados em sincronia. |
| `tooling` | `eslint`, `eslint-plugin-*`, `typescript`, `autoprefixer`, `postcss`, `tailwindcss`, `@types/node` | DevDeps de build — atualização em bloco evita conflito de configs. |

Demais pacotes seguem PR individual.

---

## 4. Processo padrão (PR rotineiro do Dependabot)

```
1. Dependabot abre PR (segunda 06:00 BRT)
   ├─ Labels: `dependencies` + `npm` ou `github-actions`
   ├─ Reviewer: rafaelstn (Rafael)
   └─ Body: changelog + GHSA links se houver

2. CI roda automaticamente (lint + typecheck)
   ├─ Falhou? → comentar root cause no PR e rebase OU fechar
   └─ Passou? → segue

3. Deploy preview (Vercel automaticamente)
   └─ URL ephemeral fica no PR

4. Smoke test manual no preview (≤ 5 min):
   ├─ /login → entra com conta de teste
   ├─ /triagem → lista carrega
   ├─ /app → PWA registra service worker
   └─ /api/health → 200

5. Aprovar e merge em `main`.

6. Se for crítico/alta: anotar em CHANGELOG.md o motivo (CVE-XXXX).
```

**Tempo orçado por PR rotineiro:** 10 min. Se passa de 30 min, escalar pro Bruno (engenharia) — provavelmente é breaking change disfarçado.

---

## 5. Processo de emergência (CVE crítica/alta)

```
1. GitHub envia security advisory → Dependabot abre PR fora do schedule
   └─ Label automática `security` adicionada

2. Triagem em ≤ 4h úteis:
   ├─ Confirmar exposição: o componente é usado em runtime ou só dev?
   │  ├─ Só devDep + sem CI poisoning conhecido → SLA de "média"
   │  └─ Runtime ou supply chain → segue como crítica
   ├─ Confirmar fix-version: existe patch disponível na linha atual?
   │  └─ Não? → ver §6 (exceção)
   └─ Decidir: aplicar fix-em-place OU rollback temporário do componente

3. Aplicar fix:
   ├─ CI verde → deploy preview → smoke test (§4 passo 4)
   ├─ Se passou → merge em `main` → deploy prod imediato
   └─ Comunicar Rafael por canal direto + abrir entrada em CHANGELOG.md

4. Pós-mortem em ≤ 48h:
   └─ docs/seguranca/postmortems/YYYY-MM-DD-<cve>.md
       (Marina escreve, André valida)
```

---

## 6. Exceções — CVE com fix apenas em major

Quando a única correção da CVE está em uma major version bloqueada pela política:

**Decisão obrigatória via ADR.** Modelo:

```
docs/adr/000X-cve-<id>-major-bump.md
├─ Contexto: CVE-XXXX-YYYY no pacote `foo` v1.x — fix em v2.0
├─ Opções avaliadas:
│  1. Subir pra v2.0 (breaking → custo de refactor + regressão Thiago)
│  2. Manter v1.x + mitigação compensatória (WAF rule, feature flag, remoção do uso)
│  3. Substituir o pacote
├─ Decisão: <opção>
├─ Plano: passos + cronograma + owner
└─ Compensação: o que cobre o gap até a decisão sair
```

Owner do ADR: Rodrigo (DevOps) com co-revisão do André (Segurança).

**Tempo máximo entre identificação da CVE e decisão registrada:** 7 dias se crítica, 14 dias se alta.

---

## 7. Auditoria mensal de baixa

Última quinta-feira do mês, Rodrigo roda:

```bash
npm audit --omit=dev --audit-level=low
npm outdated
```

Saída: `docs/relatorios/dependencias-YYYY-MM.md` (criar se não existir; Marina templatiza no longo prazo).

Alvo: zero CVE crítica + alta + média no relatório. Baixas pendentes listadas com plano.

---

## 8. Acompanhamento de saúde do Dependabot

Sinais de saúde (Rodrigo monitora):

| Métrica | Alvo | Onde olhar |
|---------|------|------------|
| PRs abertos do dependabot | < 8 | aba **Pull requests** filtro `is:open author:app/dependabot` |
| Idade média dos PRs abertos | < 7 dias | mesmo filtro |
| % de PRs verdes no CI | > 90% | aba **Actions** |
| Vulnerabilidades open no Security tab | 0 críticas, 0 altas | **Security → Dependabot alerts** |

Se algum desses estoura → backlog de manutenção pra próxima sprint.

---

## 9. Quando reabrir auto-merge

Auto-merge **só fica viável** quando todas as condições baterem:

1. Suíte E2E do Thiago cobrindo fluxos críticos (`/triagem/*` aprovação, `/app/fichas` submissão).
2. CI roda E2E em PR de Dependabot.
3. Deploy preview validado por automação (smoke test scriptado).

Até lá: **review humano obrigatório**. Reabrir em sprint específica de DX.

---

## 10. Quem faz o quê

| Tarefa | Responsável |
|--------|-------------|
| Configurar Dependabot e ajustes do YAML | Rodrigo |
| Triar PR rotineiro (1×/semana) | Rafael |
| Decidir exceção de major | Rodrigo + André + Rafael |
| Atualizar este runbook | Rodrigo (PR de revisão a cada 6 meses) |
| Pós-mortem de CVE crítica | Marina escreve, André valida |
| Comunicar cliente (governo) | Paula (se houver impacto contratual) |

---

**Rodrigo — PO DevOps — Damasceno Dev OS — 2026-05-08**
