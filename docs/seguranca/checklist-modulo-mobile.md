# Checklist de Segurança — Módulo Mobile + Triagem

| Campo | Valor |
|-------|-------|
| Cliente | SPÁguas — Governo do Estado de São Paulo |
| Responsável | André — PO Segurança (Damasceno Dev OS) |
| Versão | 0.1 — rascunho de planejamento |
| Data | 2026-05-08 |
| Status | Aguardando aprovação do Rafael antes de virar requisito de implementação |
| Regras aplicadas | `~/.claude/rules/governo.md`, `~/.claude/rules/banco.md` (sem PCI-DSS — ver §5), `~/.claude/rules/padrao.md` |
| Documentos pais | `docs/spec-modulo-mobile.md`, ADR-0007, ADR-0008 |

---

## 1. Escopo do checklist

Este documento mapeia controles de segurança aplicáveis especificamente aos artefatos novos da Fase 2.A:

- App PWA (rotas `/app/*`) — superfície que o técnico em campo usa.
- Endpoints novos (`/api/triagem/*`) — superfície que app + web aprovador usam.
- Tabelas `fichas_triagem`, `triagem_eventos`, `usuarios_papeis` — superfície de dados.
- Mecanismo de promoção `fichas_triagem` → `fichas_visita` — superfície crítica de integridade.
- Aprovador na web — superfície de operação crítica (regra `banco.md`).

Não cobre o dashboard de consulta original (já com OWASP rodado na Fase 1) exceto onde o módulo novo introduz mudanças.

---

## 2. OWASP Top 10 — mapeamento por endpoint novo

Cada endpoint novo é avaliado contra os 10 riscos. Marcado como [APLICA] / [NÃO APLICA] / [MITIGADO].

### Tabela síntese

| Endpoint | Auth | Autorização | Input val. | Rate limit | Audit | Idempotência |
|----------|------|-------------|------------|------------|-------|---------------|
| `POST /api/triagem/fichas` | sessão técnico | papel = qualquer | Zod por tipo | sim — por usuário | sim | não (cria novo) |
| `GET /api/triagem/fichas` | sessão | papel = aprovador | Zod query params | sim — global | leitura — `acesso_ficha` | n/a |
| `GET /api/triagem/fichas/:id` | sessão | aprovador OU dono | UUID estrito | sim | leitura | n/a |
| `POST /api/triagem/fichas/:id/iniciar-revisao` | sessão + MFA | papel = aprovador | UUID | sim | evento | sim — verifica status |
| `POST /api/triagem/fichas/:id/aprovar` | sessão + MFA | aprovador + revisor | UUID | sim | evento | sim — transação |
| `POST /api/triagem/fichas/:id/rejeitar` | sessão + MFA | aprovador + revisor | motivo ≥ 20 | sim | evento | sim |
| `POST /api/triagem/fichas/:id/devolver` | sessão + MFA | aprovador + revisor | solicitação ≥ 20 | sim | evento | sim |
| `GET /api/triagem/minhas-fichas` | sessão | dono | Zod query | sim | leitura | n/a |
| `POST /api/triagem/cron/liberar-locks` | secret cron | n/a | nenhum body | sim — cron | evento | sim — idempotente |

### Detalhe por risco OWASP

#### A01:2021 — Broken Access Control [APLICA]

- **Pano de fundo**: 2 papéis lógicos (técnico comum, aprovador). Aprovador faz operações destrutivas (decisão final).
- **Controles**:
  - Toda rota `/api/triagem/*` valida `usuario_id = obterUsuarioAtual()`. Sem sessão = 401.
  - Rotas de aprovador chamam `eh_aprovador(usuario_id)` antes da ação. Sem papel = 403.
  - Rotas de aprovador exigem `aal2` (MFA passou) na sessão Supabase. Sem AAL2 = 403 com mensagem "MFA obrigatório".
  - `GET /api/triagem/fichas/:id` libera leitura pra técnico **só se for o dono**. Aprovador vê tudo. Implementado em use case, não no router.
  - `POST .../aprovar|rejeitar|devolver` só permite se `revisor_id = usuario_atual` e `status = em_revisao`. Lock evita race.
- **Teste obrigatório (Thiago)**:
  - Técnico tenta listar fila completa → 403.
  - Técnico A tenta ler ficha do técnico B → 404 (não 403, evita oracle).
  - Aprovador sem MFA tenta aprovar → 403 com mensagem específica.
  - Race: dois aprovadores tentam iniciar revisão simultânea → só um ganha.

#### A02:2021 — Cryptographic Failures [MITIGADO]

- TLS terminado na Vercel. HSTS já configurado.
- Cookie de sessão `httpOnly`, `secure`, `sameSite=lax` (default `@supabase/ssr`).
- **Sem dado sensível em texto plano em `dados` JSONB**: schemas Zod não pedem CPF/RG/dados financeiros pessoais. Auditar em revisão de migration.
- Logs **não imprimem** payload completo de envio de ficha — só `id`, `prefixo`, `usuario_id`, `status`. (Marca pra Rodrigo configurar masking no logger).

#### A03:2021 — Injection [MITIGADO]

- `postgres-js` com tagged template — zero concatenação. Reusa padrão da Fase 1.
- Zod valida todo input (Body + Params + Query) antes de chegar no use case.
- **Risco específico do JSONB**: `dados` é objeto livre. Mitigação: Zod por tipo (`construirSchemaZod(codigo)`) **rejeita campos extras com tipo errado** mas a função usa `.passthrough()` no fim — re-avaliar se isso é desejado pra triagem (decisão: trocar por `.strict()` no endpoint de triagem; passthrough fica só pra leitura). **Pendência André**.

#### A04:2021 — Insecure Design [APLICA]

- **Padrão do design**: tabela de staging + audit trail + transação atômica + lock por TTL — todos vêm de padrões maduros (Saga, Outbox, Audit Log).
- **Threat model resumido**: ver §3.

#### A05:2021 — Security Misconfiguration [APLICA]

- Headers HTTP (revisar e endurecer no `next.config.ts`):
  - `Content-Security-Policy` restritivo: `default-src 'self'; script-src 'self' 'unsafe-inline'` (necessário pro Next runtime); `connect-src 'self' https://*.supabase.co`; `img-src 'self' data:`.
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(self), camera=(self)` — geolocation só pro app.
- CORS: API só responde same-origin. Sem `Access-Control-Allow-Origin: *`.
- Service Worker registrado com escopo `/app/` apenas.
- Manifest sem dados sensíveis (apenas `name`, `short_name`, ícones, theme_color).

#### A06:2021 — Vulnerable and Outdated Components [APLICA]

- `npm audit` no CI a cada PR — bloqueador se houver CVE crítica.
- Dependências novas auditadas individualmente:
  - `next-pwa` — última versão, projeto ainda mantido (verificar antes de instalar). Se inativo, ir pra SW manual.
  - `idb-keyval` — pequeno, auditável (~150 LOC).
  - `@capacitor/core` (futuro) — versão LTS.
- Renovate / Dependabot ativo no repo (Rodrigo).

#### A07:2021 — Identification and Authentication Failures [APLICA]

- **Login do técnico**: email + senha + allowlist (ADR-0006). Mensagem genérica em erro. Senha mínima 6 chars (revisar pro app — pode subir pra 8).
- **Login do aprovador**: tudo do técnico **+ MFA TOTP obrigatório**. Configurado no Supabase Auth (`auth.mfa_factors`).
- **MFA enforcement**:
  - Backend verifica `session.aal === 'aal2'` em toda rota de aprovador.
  - Se aprovador entra sem MFA configurado, é redirecionado pra `/configurar-mfa` no primeiro login.
  - Sem opção de "lembrar dispositivo" — MFA toda vez que sessão é nova.
- **Senha**: política inicial = 6 chars (ADR-0006). Recomendação André: subir pra 8 + 1 maiúscula + 1 número pro app, ou aceitar 6 e contar com lockout do Supabase. Confirmar com Rafael.
- **Lockout**: Supabase Auth aplica rate limit nativo após N tentativas falhadas (default 30/hora por IP). Suficiente pro MVP.
- **Sessão**: `@supabase/ssr` gerencia. Refresh automático. Logout no app limpa cookie + revoga refresh token via API.

#### A08:2021 — Software and Data Integrity Failures [APLICA]

- Service Worker servido pela mesma origem (mesmo certificado). Sem CDN externo.
- Manifest e SW versionados por hash de build — invalidação automática.
- Capacitor APK assinado com keystore controlada pelo Rodrigo. Distribuição interna (sem loja Google Play no MVP) — risco aceito; documentado.
- Promoção `fichas_triagem` → `fichas_visita` em transação atômica (ADR-0008 §2.4) — invariante de integridade garantida no DB, não na app.

#### A09:2021 — Security Logging and Monitoring Failures [APLICA]

- **Tabela `triagem_eventos`** registra toda transição com `usuario_id`, `ip`, `user_agent`, `motivo`. REVOKE UPDATE/DELETE.
- **Tabela `acesso_ficha`** já existente continua registrando consulta de prefixo.
- **Logs de aplicação** (Vercel Logs + log estruturado): toda 4xx e 5xx em rotas de triagem têm log com `usuario_id`, `endpoint`, `status`, `latência`. Sem payload no log.
- **Alertas mínimos** (Rodrigo configura):
  - Mais de 50 falhas de login por hora — possível brute force.
  - Mais de 10 rejeições de MFA em 1h — possível tentativa de phishing.
  - Job de liberação de lock falhou — operação degrada.
  - 5xx em `/api/triagem/*` acima de 1% — incidente.

#### A10:2021 — Server-Side Request Forgery (SSRF) [NÃO APLICA]

- Endpoints novos não fazem chamada externa baseada em input do usuário. Sem URLs no payload.

---

## 3. Threat model resumido

### 3.1 Ataques considerados

| Ator | Vetor | Mitigação |
|------|-------|-----------|
| Técnico mal-intencionado | Submete ficha falsa pra posto que não foi visitado | Aprovação humana + GPS capturado + verificação de aprovador |
| Técnico desligado | Ainda com sessão ativa, tenta enviar ficha | Tabela `usuarios_papeis` com flag de ativo (futuro). MVP: revogação manual via painel Supabase |
| Aprovador comprometido | Conta com senha vazada aprova fichas em massa | MFA obrigatório + audit trail por evento permite reverter (criar substituição) |
| Atacante externo | Brute force de senha do aprovador | Rate limit Supabase nativo + MFA TOTP elimina cenário mesmo com senha vazada |
| Atacante externo | XSS via campo de ficha que vira HTML em algum render | Zod rejeita tipos errados; React escapa por default; auditar qualquer `dangerouslySetInnerHTML` (não há) |
| Atacante externo | DoS via spam de envios | Rate limit por usuário no `POST /api/triagem/fichas`; rate limit global na API |
| Atacante interno | Edita registro direto no banco | REVOKE UPDATE/DELETE em `fichas_triagem` e `triagem_eventos`. Service role só usada pelo backend. Acesso direto ao banco = trilha de auditoria do Supabase |
| Cron forjado | Atacante chama `/api/triagem/cron/liberar-locks` indevidamente | Rota protegida por header `Authorization: Bearer ${CRON_SECRET}`; sem o secret = 401 |

### 3.2 Riscos aceitos (documentados)

1. **MFA não enforcement automático na criação do papel aprovador.** Backend valida em runtime, mas se Rafael ativar papel via SQL e aprovador não configurar MFA, primeiro login força configuração. Risco de janela: aprovador com papel mas sem MFA durante minutos. Mitigação: documentado no runbook, painel Supabase deve usar fluxo "ativar aprovador" via app admin (Fase 3).
2. **Distribuição APK sem loja**: APK baixado por link direto. Risco de phishing interno. Mitigação: hash SHA-256 do APK publicado junto com download.
3. **Sem detecção de root/jailbreak no APK**: técnico em dispositivo comprometido pode burlar localmente. Aceito — superfície de campo, baixa criticidade, risco coberto pela aprovação humana subsequente.

---

## 4. MFA — decisão técnica

### 4.1 Para o aprovador (obrigatório)

**Opções avaliadas:**

| Opção | Prós | Contras | Decisão |
|-------|------|---------|---------|
| Supabase Auth nativo (TOTP via `auth.mfa_factors`) | Já está no provedor; sem dependência nova; cookie já carrega `aal` | API ainda em GA recente; requer UI custom pra enrollment | **Escolhida** |
| Supabase Auth + lib externa (Auth0, Clerk) | Mais maturidade na UI | Troca de provedor = breaking change pra ADR-0004/0006 | Rejeitada |
| MFA via SMS/Email | Familiar pro usuário | Custo de SMS, latência, dependência de operadora; menos seguro | Rejeitada |
| WebAuthn (FIDO2) | State-of-the-art | Cliente sem passkey institucional, complexidade alta no MVP | Postergada — pauta pra Fase 3 |

**Decisão**: Supabase Auth TOTP, com app autenticador (Google Authenticator, Microsoft Authenticator, Authy). Recovery codes de uso único gerados no enrollment.

**Implementação**:

- Página `/configurar-mfa` exibe QR code + secret manual + 8 recovery codes.
- Backend valida `aal2` em todas as rotas de aprovador.
- `usuarios_papeis.mfa_obrigatorio = true` por default pra `aprovador = true`. Trigger SQL impede salvar papel aprovador sem MFA configurado em `auth.mfa_factors`.

### 4.2 Para o técnico (opcional / não exigido no MVP)

- MFA permitido (Supabase Auth permite enrollment voluntário) mas não obrigatório.
- Decisão Rafael: técnico em campo enfrenta latência de TOTP em conexão ruim, fora da realidade operacional. Aceito.

---

## 5. PCI-DSS — não aplicável

Decisão registrada explicitamente conforme exigência da regra `banco.md`:

> Este sistema **não processa, armazena, nem transmite dados de portador de cartão**. Não há campos de cartão, conta bancária, PIX ou similares em nenhum schema (`fichas_triagem.dados`, `fichas_visita.dados`, `postos.*`). Não há gateway de pagamento integrado. Logo, **PCI-DSS não se aplica**.
>
> Se em fase futura houver pagamento (não previsto no roadmap), abrir nova ADR e aplicar PCI-DSS por completo.

Decisão homologada por: André — PO Segurança, em 2026-05-08. Confirmação contratual fica com Paula.

---

## 6. Rate limiting — estratégia

### 6.1 Necessidade

Regra `banco.md` exige rate limiting **obrigatório em todos os endpoints**. Hoje o sistema tem apenas o limit nativo do Supabase (login e API postgres) — não cobre `/api/*`.

### 6.2 Opções avaliadas

| Opção | Prós | Contras | Custo estimado |
|-------|------|---------|----------------|
| **Vercel Edge Middleware in-memory** | Sem dependência externa; latência zero | Reset a cada deploy; não-distribuído entre regions; estado por instância | Zero |
| **Upstash Redis (REST)** | Distribuído; persistente; latência ~10ms da Vercel | Dependência externa; custo recorrente | Free tier ~10k req/dia; pago a partir de ~$10/mês |
| **Postgres (count-based)** | Banco já existe | Latência alta (~50ms+); pressão em escrita; lock contention | Zero (mas custo de performance) |
| **Cloudflare Rate Limiting** | Robusto, bem testado | Exige migrar DNS / proxy de Vercel pra CF; mudança operacional | Paid plan ~$20/mês |

### 6.3 Recomendação

**Híbrida em duas camadas:**

1. **Camada 1 — Vercel Edge Middleware in-memory** com `lru-cache` por IP+rota.
   Limites:
   - `POST /api/triagem/fichas`: 30/min por usuário, 100/min global por IP.
   - `POST .../aprovar|rejeitar|devolver`: 60/min por usuário (aprovador).
   - `GET /api/triagem/*`: 200/min por usuário.
   - Login: 10/min por IP (complementa Supabase nativo).
   - Cron: bypass por header.
2. **Camada 2 — Upstash Redis (opcional)** ativada **só em produção** quando o tráfego justificar (free tier paga).
   Mesmas regras, distribuído.

**Decisão pendente do Rafael**: aprovar ou não orçamento de Upstash Redis. Sem aprovação, fica só Camada 1 (in-memory) — atende MVP, com aviso documentado de que reset por deploy é aceito.

### 6.4 Headers de resposta

Todo endpoint sob rate limit responde:

- `X-RateLimit-Limit: 30`
- `X-RateLimit-Remaining: 27`
- `X-RateLimit-Reset: <epoch>`
- Em 429: `Retry-After: 12` segundos.

---

## 7. LGPD — plano específico do módulo

### 7.1 Dados pessoais novos coletados

| Campo | Tabela | Sensível? | Base legal |
|-------|--------|-----------|------------|
| `tecnico_nome` | `fichas_triagem`, `fichas_visita` | Identificação direta — Sim | Execução de contrato (servidor SPÁguas em atividade) |
| `tecnico_id` (UUID auth) | `fichas_triagem`, `fichas_visita` | Pseudoanônimo | mesma |
| `latitude_capturada` / `longitude_capturada` | `fichas_triagem`, `fichas_visita` | Localização — sim, **mas é de POSTO**, não da pessoa em casa | Execução de contrato (verificar visita) |
| `precisao_gps_m` | `fichas_triagem` | Não-pessoal | n/a |
| `ip` / `user_agent` | `triagem_eventos`, `acesso_ficha` | Acessório — Sim | Auditoria legal (Marco Civil + LGPD Art. 7º IX) |
| MFA secret (TOTP) | `auth.mfa_factors` (Supabase) | Sim — credencial | Execução de contrato + obrigação legal de segurança |

### 7.2 Direitos do titular

| Direito | Como atender |
|---------|--------------|
| Acesso | Endpoint `/api/lgpd/meus-dados` (Fase 3, fora do MVP) — por hora, mediante solicitação ao DPO via canal institucional |
| Correção | Painel Supabase (manual pelo DPO) ou via tela de perfil (Fase 3) |
| Exclusão | **Não aplicável a registros de auditoria** (LGPD Art. 16). Para conta inteira: anonimização (`auth.users.email = 'anonimizado@spaguas.gov.br'`, `tecnico_nome = '[anonimizado]'`). Mantém integridade histórica das fichas |
| Portabilidade | Export JSON via SQL admin sob solicitação ao DPO |
| Revogação de consentimento | Para GPS: usuário revoga permissão no navegador/app; backend aceita `latitude_capturada = NULL` |

### 7.3 Retenção

- Fichas (todas): retenção indefinida — dado institucional com valor histórico (séries hidrológicas).
- Eventos de triagem: retenção indefinida — auditoria.
- Logs de acesso a ficha: retenção indefinida — auditoria.
- MFA factors: retenção enquanto a conta existir.
- Senhas: hash via Supabase Auth (bcrypt), nunca em plaintext.

### 7.4 Comunicação de incidente

Procedimento padrão de incidente (André + Rafael decidem comunicação). Prazo ANPD: 48h após conhecimento. Documentado em `runbooks/incidente-lgpd.md` (a criar).

---

## 8. Hardening do app móvel (PWA)

| Item | Estado |
|------|--------|
| `Content-Security-Policy` em `/app/*` mais restritivo que no dashboard (sem `unsafe-eval`) | a fazer |
| Service Worker não cacheia rotas de `/api/auth/*` nem `/login`, `/cadastrar` | a fazer |
| `localStorage` de rascunho **não armazena senha**, **não armazena token** | obrigatório |
| Token de sessão **só em cookie httpOnly** (via `@supabase/ssr`) — nunca em `localStorage`/`sessionStorage` | já é assim |
| Logout no app limpa rascunhos do usuário (chave `rascunho:<usuario_id>:*`) | a fazer |
| Tela de bloqueio do app após N minutos sem interação (re-pede senha) | postergado — Fase 3 |
| Detecção de root/jailbreak no APK | postergado — risco aceito |
| Certificate pinning no Capacitor | postergado — Vercel rota TLS público, baixo benefício |

---

## 9. Auditoria pré-produção (gate de release)

Antes do *go-live* da Fase 2.A:

- [ ] OWASP Top 10 revisado por endpoint (este doc — atualizar com resultados de teste).
- [ ] `npm audit` sem CVE crítica.
- [ ] Pen test interno (André + Thiago) com checklist:
  - Login brute force
  - Bypass de MFA
  - IDOR em `GET /api/triagem/fichas/:id`
  - Race condition em iniciar revisão (2 aprovadores simultâneos)
  - Promoção `fichas_triagem` → `fichas_visita` com erro no meio (rollback funciona?)
  - Cron forjado sem secret
  - XSS via campo de ficha
  - SQL injection via `prefixo` ou IDs
- [ ] Verificação de allowlist em produção (sem `*` wildcard).
- [ ] Verificação de "Confirm email" desativado se for fluxo aprovado.
- [ ] CSP testada com browser real.
- [ ] Headers de segurança testados via `securityheaders.com`.
- [ ] LGPD: `runbooks/incidente-lgpd.md` criado.
- [ ] Audit log testado: criar ficha → aprovar → ler `triagem_eventos` → tudo presente.

---

## 10. Pendências bloqueantes pro Rafael

Replicadas no relatório executivo do Matheus, mas registradas aqui para rastreabilidade:

1. **Rate limit em produção**: aprovar Upstash Redis (~$10/mês inicial, free tier por enquanto) ou aceitar Camada 1 in-memory apenas?
2. **Política de senha do app**: manter 6 chars (ADR-0006) ou subir pra 8 + 1 maiúscula + 1 número?
3. **MFA**: confirmar que é TOTP via Supabase Auth nativo (não app externo tipo Google Authenticator institucional, etc)?
4. **Consentimento explícito de GPS**: telinha "permitir captura de localização para verificação da visita" no primeiro acesso, ou implícito pelo navegador? Recomendação André: explícito.

---

**André — PO Segurança**
**Damasceno Dev OS**
**2026-05-08**
