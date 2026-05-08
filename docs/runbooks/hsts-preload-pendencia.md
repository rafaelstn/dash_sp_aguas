# Pendência — HSTS preload

| Campo | Valor |
|-------|-------|
| Owner | Rodrigo (DevOps) — bloqueado por confirmação de Rafael/cliente |
| Sprint origem | 1.S3 |
| Pendência fechada (parcialmente) | `docs/seguranca/owasp-review-sprint-1.md` §A02 + §5 #7 |
| Documento pai | `next.config.ts` (header HSTS) |
| Status | **Não ativado**. Aguardando confirmação. |
| Domínio assumido | `spaguas-ficha-tecnica.vercel.app` `<<placeholder até confirmação Rafael>>` |
| Última revisão | 2026-05-08 |

---

## 1. Estado atual

```ts
// next.config.ts
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }
```

- 2 anos de max-age.
- `includeSubDomains` ativo.
- **Sem `preload`.**

---

## 2. Por que não ativei `preload` ainda

**`; preload` é IRREVERSÍVEL na prática.** Uma vez que o domínio entra na [HSTS Preload List](https://hstspreload.org/), o navegador (Chrome/Firefox/Safari/Edge) força HTTPS no domínio + todos subdomínios **mesmo antes** da primeira request. Sair da lista leva **meses** (manual, depende do Chrome team).

Pré-requisitos absolutos antes de submeter:

| Pré-requisito | Status atual | Como verificar |
|---------------|--------------|----------------|
| Domínio raiz responde HTTPS válido | **DESCONHECIDO** | curl -I https://<dominio> |
| Redirect 301 de HTTP→HTTPS no raiz | **DESCONHECIDO** | curl -I http://<dominio> |
| **TODOS os subdomínios** servem HTTPS | **DESCONHECIDO** | inventário com cliente |
| `www.<dominio>` em HTTPS | **DESCONHECIDO** | curl -I https://www.<dominio> |
| Certificado válido por ≥18 meses contínuos | **PROVÁVEL** (Vercel renova auto) | check com Lighthouse |
| Header HSTS já em `max-age >= 31536000` | **OK** (63072000 = 2 anos) | next.config.ts |
| `includeSubDomains` no header | **OK** | next.config.ts |

**Domínio de produção do projeto SPÁguas Ficha Técnica é desconhecido neste sprint.** Só uma URL Vercel temporária ou domínio custom do cliente Governo SP — preciso da confirmação.

**Decisão Rafael (2026-05-08):** documentar tudo com **`spaguas-ficha-tecnica.vercel.app`** como `<<placeholder até confirmação Rafael>>`. Substituir pelo domínio real quando cliente decidir. Como provavelmente entraremos com subdomínio do `vercel.app` (modo Hobby) ou subdomínio institucional do governo, **a recomendação de NÃO ativar `preload`** se mantém — qualquer um dos dois cenários já cai no §3 abaixo como "não ativar".

---

## 3. O que precisa do Rafael / cliente

**Pergunta-chave:** *qual é o domínio de produção da aplicação?*

Hipóteses:

| Cenário | Implicação para preload |
|---------|-------------------------|
| Subdomínio do `vercel.app` (ex.: `spaguas-fichas.vercel.app`) | **NÃO ATIVAR** — preload em `vercel.app` afetaria 3M+ projetos. Já está na lista da Vercel global. |
| Subdomínio do governo SP (ex.: `fichas.saneamento.sp.gov.br`) | **MUITO PROVÁVEL TER QUE NÃO ATIVAR.** Subdomínio em domínio compartilhado com órgão público — outros sistemas talvez ainda em HTTP. Preload "preto" em sp.gov.br quebraria sistemas legados. |
| Domínio próprio do projeto (ex.: `spaguas-fichas.com.br`) | **PODE ATIVAR**, depois de inventário de subdomínios e confirmação de TLS em todos. |

**Na prática esperada:** governo SP deve preferir publicar em subdomínio institucional. Isso significa que **provavelmente NÃO ativaremos `preload`** — não somos donos do domínio raiz, então a decisão envolve o admin de DNS do órgão.

---

## 4. Checklist se / quando ativar

```
1. Inventariar TODOS os subdomínios sob o domínio raiz:
   $ dig +short ANY <dominio> | head -20
   $ subfinder -d <dominio>  # ou Cert Transparency logs
   └─ Lista completa de subdomínios em uso pelo cliente.

2. Para cada subdomínio:
   $ curl -I https://<sub>.<dominio>
   └─ Confirmar 200/301/302 em HTTPS.
   $ curl -I http://<sub>.<dominio>
   └─ Confirmar redirect 301 → HTTPS.

3. Se algum subdomínio NÃO está em HTTPS válido:
   ABORTAR. Avisar cliente. Não submeter.

4. Se todos OK:
   a. Editar next.config.ts:
      value: 'max-age=63072000; includeSubDomains; preload'
   b. PR + review André + deploy prod.
   c. Aguardar 1 semana de operação estável (header servido em produção).

5. Submeter em https://hstspreload.org:
   - Inserir o domínio raiz.
   - Aguardar verificação automática.
   - Inclusão no Chrome leva 1-3 ciclos de release (12-24 semanas).

6. Documentar em CHANGELOG.md a inclusão e a data de submissão.

7. Atualizar este runbook com status "ativado em YYYY-MM-DD".
```

---

## 5. Como reverter (em emergência)

Sair da preload list:

1. Editar `next.config.ts`: `max-age=0; preload` (sim, com preload).
2. Deploy + aguardar todos navegadores expirarem o cache HSTS (até 2 anos no pior caso, mas com max-age=0 cai pro ciclo de release dos browsers — semanas).
3. Submeter [HSTS Preload Removal](https://hstspreload.org/removal/).
4. Aguardar 12+ semanas pra o Chrome processar.

**Tempo médio de saída: 6 meses.** Por isso não brincamos com isso.

---

## 6. Mitigações compensatórias enquanto não ativa

Sem `preload`, ainda temos:

- `max-age=63072000` (2 anos) — qualquer browser que já visitou o site fica protegido.
- `includeSubDomains` — proteção estende a todos os subdomínios *do mesmo domínio raiz que o servidor servir*.
- TLS terminado pela Vercel + redirect HTTP→HTTPS automático.
- COOP/CORP/X-Frame-Options/CSP `frame-ancestors 'none'` cobrem cross-origin.

**Gap residual:** primeira visita de usuário novo via HTTP é vulnerável a downgrade attack até a primeira resposta com HSTS. Risco baixo (atacante precisa MITM ativo na primeira conexão). **Aceito.**

---

## 7. Decisão final

**Recomendação Rodrigo:** **NÃO ativar `preload`** se o domínio de produção for subdomínio institucional do governo SP. Custo da reversão é alto, ganho marginal sobre `max-age=2y + includeSubDomains` é pequeno pro perfil de ataque do projeto.

**Decisão Rafael (2026-05-08):** mantém **NÃO ativado**. Domínio fica em placeholder `spaguas-ficha-tecnica.vercel.app` até cliente decidir — em ambos os cenários prováveis (subdomínio `*.vercel.app` ou subdomínio institucional `*.sp.gov.br`) **`preload` não será ativado**. Reabrir esta decisão somente se o cliente comprar domínio próprio dedicado (ex.: `spaguas-fichas.com.br`) com inventário completo de subdomínios.

---

**Rodrigo — PO DevOps — Damasceno Dev OS — 2026-05-08**
