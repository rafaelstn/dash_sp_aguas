# Especificação Funcional — Módulo Mobile + Triagem (Fase 2.A)

| Campo | Valor |
|-------|-------|
| Cliente | SPÁguas — Governo do Estado de São Paulo |
| Responsável pela especificação | Camila — PO Produto (Damasceno Dev OS) |
| Versão | 0.1 — rascunho de planejamento |
| Data | 2026-05-08 |
| Status | Aguardando aprovação do Rafael antes de disparar implementação |
| Tom do documento | Formal — padrão governo |
| Documento pai | `docs/spec.md` (MVP — Fase 1) |
| ADRs vinculados | ADR-0007 (PWA + Capacitor), ADR-0008 (triagem de fichas) |
| Referências de auth | ADR-0006 (email + senha + self-signup) |

---

## 1. Visão Geral

Este módulo estende o sistema entregue na Fase 1 (dashboard de consulta) com **dois novos atores em fluxo coordenado**:

1. **Técnico de campo**, operando em dispositivo móvel (PWA, depois APK), responsável por **digitar fichas de inspeção/manutenção/medição diretamente no campo**, eliminando a etapa de scan de PDF que hoje alimenta o repositório em HD de rede.
2. **Agente aprovador**, operando na web, responsável por **triagem das fichas submetidas pelo app** antes que entrem na base de produção (`fichas_visita`, migration 0022).

A submissão pelo app não grava direto em `fichas_visita`. Grava em uma **tabela nova `fichas_triagem`** (staging) que carrega o ciclo de vida de aprovação. Apenas após aprovação manual a ficha é promovida para `fichas_visita` — preservando a integridade da base que o dashboard de consulta já lê.

### 1.1 Problema resolvido

| Problema atual | Solução proposta |
|----------------|-------------------|
| Técnico em campo preenche ficha em papel, escaneia ao retornar, arquiva PDF no HD; informação demora dias até estar consultável | App permite envio direto do campo, com GPS e horário de visita capturados |
| Não há controle de qualidade antes da ficha entrar na base — depende de quem indexa o PDF | Triagem por agente aprovador com motivo de rejeição estruturado |
| Cronologia de visitas só existe em PDF (não estruturada), inviabiliza analytics | Ficha digitalizada vira dado estruturado em `fichas_visita.dados` (JSONB) com schema Zod por tipo |

### 1.2 Usuários (personas)

| Persona | Onde opera | Volume estimado | Perfil de auth |
|---------|-----------|-----------------|----------------|
| **Técnico de campo** | App mobile (PWA → APK) | ~10–30 usuários ativos por mês | Email + senha (mesmo da web) — ADR-0006. **Sem MFA** no MVP do app. Self-signup com allowlist. |
| **Agente aprovador** | Dashboard web atual em `/triagem` | ~3–8 usuários (gestores SPÁguas) | Email + senha **+ MFA TOTP obrigatório** (operação crítica — regra `banco.md`). Allowlist de email reforçada por flag de papel. |

> O perfil "agente aprovador" é o primeiro caso real de RBAC do projeto. ADR-0008 define como o papel é representado (sem schema RBAC completo — flag por usuário, ver §6.3).

### 1.3 Plataforma (visão de produto)

- **PWA primeiro** — entrega rápida, instalável via "Adicionar à tela inicial" no Android e iOS, funciona em qualquer navegador moderno, sem fricção de loja de app.
- **APK Android via Capacitor** — fase 2.B, quando o cliente exigir empacotamento (typicamente para distribuição interna por MDM ou para usar APIs nativas mais profundas, como câmera nativa). Detalhes técnicos em ADR-0007.
- **iOS futuro** — mesmo Capacitor, depende do cliente conseguir conta Apple Developer institucional. Não no escopo deste módulo.

---

## 2. Fluxo Principal — Técnico de Campo

```
[abrir app]
  → login (email + senha — primeira vez ou sessão expirada)
  → home (grade de cards — tipos de ficha disponíveis)
  → seleciona tipo de ficha
  → busca posto (search igual ao da web — por prefixo, nome, município)
  → seleciona posto
  → formulário daquela ficha (campos vêm de SCHEMAS_FICHA[codigo])
  → preenche / pode salvar como rascunho local
  → enviar
  → confirmação na tela ("ficha enviada — aguardando aprovação")
  → volta pra home (ou ver histórico de envios)
```

### 2.1 Edge cases — fluxo do técnico

| Cenário | Comportamento esperado |
|---------|------------------------|
| Sem internet ao abrir o app | Mostra tela offline com botão "tentar novamente". Se houver rascunho local, permite continuar editando rascunho. |
| Sem internet ao **enviar** ficha | Ficha vai pra fila local (IndexedDB via Service Worker). Usuário vê estado "aguardando sincronização". App tenta enviar a cada `online` event. **Não tenta sincronização em background** no MVP (precisa de Service Worker robusto + Push API). |
| Conexão cai durante preenchimento | Estado do formulário preservado em `localStorage`/IndexedDB a cada `change`. Recuperado ao reabrir. |
| GPS negado / indisponível | Ficha permite envio sem coordenadas. Campo `latitude_capturada`/`longitude_capturada` vai como NULL. Aprovador vê esse fato no painel. |
| Posto não existe na busca | Mensagem clara: "posto não encontrado — verifique o prefixo ou contate o gestor". App **não permite criação de posto**. Cadastro de posto é fora do MVP. |
| Tipo de ficha não aplicável ao posto | Pré-filtro: ao selecionar posto, o app filtra os tipos exibidos com base em `tipo_de_estacao` do posto. Tipos não aplicáveis ficam ocultos (não desabilitados). |
| Sessão expira durante o preenchimento | App pede re-login mantendo o rascunho local. Após login, restaura o formulário. |
| Usuário envia, depois fecha o app, volta — ficha foi rejeitada | App tem aba "Minhas fichas" com lista filtrada por status. Notificação por badge no ícone (push notification fora do MVP). |
| Token de sessão é alterado server-side (logout forçado) | Próxima requisição retorna 401, app volta pra tela de login. |

### 2.2 Estratégia offline mínima do MVP

- **Rascunho local persistente:** todo formulário em edição é salvo em `localStorage` por chave `rascunho:<usuario_id>:<prefixo>:<codigo_tipo>` a cada mudança. Recuperado ao reabrir.
- **Fila de envios pendentes:** se o `POST /api/triagem/fichas` falha por rede, o payload vai pra IndexedDB com timestamp. App tenta drenar a fila quando volta `online`.
- **NÃO no MVP:** sincronização em background com Service Worker (Background Sync API), busca de postos offline (cache de 2.484 postos é grande demais pro MVP). Detalhe técnico em ADR-0007.

---

## 3. Fluxo Principal — Agente Aprovador

```
[abrir /triagem na web]
  → login + MFA TOTP
  → lista de fichas com status `pendente` ou `em_revisao` (default: pendente, ordenado por mais antigas)
  → filtros: tipo de ficha, posto, técnico, data
  → clica em ficha
  → tela de revisão: dados estruturados + GPS + foto do posto (se houver) + histórico do técnico
  → ações: aprovar / rejeitar (com motivo) / devolver (com solicitação de correção)
  → aprovar: ficha sai da triagem e entra em `fichas_visita`. Imutável a partir daí.
  → rejeitar: ficha fica visível pro técnico em "Minhas fichas" com motivo. Não retorna pra triagem (ciclo encerrado).
  → devolver: ficha volta pro técnico editar. Quando o técnico re-envia, volta pra triagem como nova revisão.
```

### 3.1 Edge cases — fluxo do aprovador

| Cenário | Comportamento esperado |
|---------|------------------------|
| Dois aprovadores abrem a mesma ficha | Quem clicar em "iniciar revisão" primeiro pega a ficha (status `em_revisao` + `revisor_id`). O outro vê "em revisão por Fulano" e pode forçar tomar (com aviso). |
| Aprovador esquece a aba aberta | Após 30 min sem ação, status `em_revisao` volta pra `pendente`. Lock por TTL, não por sessão. |
| Aprovador aprova ficha de posto que foi descomissionado entre o envio e a aprovação | Backend verifica `postos.ativo` antes de promover. Bloqueia com mensagem clara. |
| Ficha aprovada precisa ser corrigida | Não é editável após aprovada. Tem que **criar nova ficha** que substitui (campo `substitui_ficha_id` na próxima migration — fora do MVP, declarado como pendência). |
| Técnico foi desligado entre envio e aprovação | Aprovador continua podendo aprovar. Histórico mantém `tecnico_id` e `tecnico_nome`. |
| MFA do aprovador não funciona | Aprovador não consegue entrar. Suporte é via reset manual no painel Supabase pelo Rafael. Documentado no runbook (responsabilidade Rodrigo). |

---

## 4. Regras de Negócio — Estados da Triagem

### 4.1 Máquina de estados

```
            [técnico envia]
                  │
                  ▼
            ┌───────────┐  [aprovador clica em
            │ pendente  │   "iniciar revisão"]
            └─────┬─────┘
                  │ ──────────────────────────┐
                  ▼                            ▼
            ┌──────────────┐  [TTL 30min]  ┌───────────┐
            │ em_revisao   │ ─────────────▶│ pendente  │
            └─────┬────────┘               └───────────┘
                  │
       ┌──────────┼──────────────┐
       │          │              │
   [aprovar]  [devolver]     [rejeitar]
       │          │              │
       ▼          ▼              ▼
  ┌─────────┐  ┌──────────┐  ┌───────────┐
  │aprovada │  │devolvida │  │ rejeitada │
  └─────────┘  └────┬─────┘  └───────────┘
                    │ [técnico re-envia
                    │  a ficha corrigida]
                    ▼
              ┌───────────┐
              │ pendente  │
              └───────────┘
```

### 4.2 Estados — definição

| Estado | Descrição | Quem altera | Quem vê |
|--------|-----------|-------------|---------|
| `pendente` | Ficha submetida pelo técnico, ainda sem revisor associado | técnico (entra) → aprovador (sai) | aprovador (lista padrão); técnico (em "Minhas fichas") |
| `em_revisao` | Aprovador iniciou a revisão e tem lock por 30min | aprovador (entra/sai) | aprovador (com indicador de quem); técnico (vê "em revisão") |
| `aprovada` | Ficha aprovada — promovida pra `fichas_visita`. Imutável. | aprovador (entra) | técnico + aprovadores (consulta). Promovida pra `fichas_visita`. |
| `rejeitada` | Aprovador recusou e o ciclo terminou. Motivo registrado. | aprovador (entra) | técnico + aprovadores |
| `devolvida` | Aprovador pediu correção. Volta pro técnico, que pode re-submeter. | aprovador (entra) → técnico (sai, ao re-enviar) | técnico (com solicitação visível) |

### 4.3 Transições válidas

| De → Para | Permitido? | Quem | Restrições |
|-----------|------------|------|-----------|
| (init) → pendente | sim | técnico | payload válido pelo Zod |
| pendente → em_revisao | sim | aprovador | aprovador tem MFA + papel |
| em_revisao → pendente | sim | sistema (TTL) ou aprovador (cancelar) | TTL 30min sem ação |
| em_revisao → aprovada | sim | aprovador | posto ativo; payload válido |
| em_revisao → rejeitada | sim | aprovador | motivo obrigatório (≥ 20 chars) |
| em_revisao → devolvida | sim | aprovador | solicitação obrigatória (≥ 20 chars) |
| devolvida → pendente | sim | técnico | re-submissão com mesma ficha (mesmo `id`) |
| aprovada → * | **não** | — | imutável |
| rejeitada → * | **não** | — | imutável |
| pendente → rejeitada/devolvida | **não** (sem em_revisao) | — | aprovador tem que iniciar revisão antes |

### 4.4 Prazos / SLA

- **Triagem de ficha:** SLA-alvo de 5 dias úteis entre `pendente` e decisão final (aprovada/rejeitada/devolvida). Não há enforcement automático (sem timer disparando notificação no MVP).
- **Lock de revisão:** 30 minutos sem update no registro libera o lock. Implementado em job (Vercel Cron ou similar — Rodrigo decide na fase de implementação).
- **Retenção:** fichas em qualquer estado retidas indefinidamente (regra LGPD — dado tem valor histórico). Direito de exclusão tratado caso-a-caso pelo gestor.

### 4.5 Auditoria

Toda transição gera linha em **`triagem_eventos`** (tabela append-only — ADR-0008 §3.2):

| Coluna | Conteúdo |
|--------|---------|
| `id` | UUID |
| `ficha_triagem_id` | FK → `fichas_triagem.id` |
| `evento` | enum (`enviada`, `revisao_iniciada`, `revisao_liberada`, `aprovada`, `rejeitada`, `devolvida`, `re_enviada`) |
| `usuario_id` | quem fez |
| `motivo` | texto opcional (rejeição/devolução obrigatórios) |
| `criado_em` | timestamp |
| `ip`, `user_agent` | headers de auditoria |

REVOKE UPDATE/DELETE (igual `acesso_ficha` da Fase 1).

---

## 5. User Stories — formato GWT

### US-MOB-001 — Login no app móvel

**Como** técnico de campo
**Quero** entrar no app com meu email e senha
**Para que** minhas submissões fiquem associadas à minha identidade

**Critérios (Given/When/Then):**

- **Given** o técnico está com email cadastrado na allowlist e senha correta
  **When** clica em "entrar"
  **Then** sessão é estabelecida, redireciona pra home
- **Given** o técnico erra a senha
  **When** clica em "entrar"
  **Then** mensagem genérica "credenciais inválidas" (sem revelar se o email existe), formulário permanece preenchido (exceto a senha)
- **Given** o técnico não tem cadastro
  **When** vai pra "criar conta"
  **Then** preenche nome + email institucional + senha; só consegue se domínio passar na allowlist
- **Given** o técnico tinha sessão e o token expira
  **When** abre o app de novo
  **Then** rascunho local é preservado; após login, formulário é recuperado

**Estimativa:** S (reuso de actions já existentes em `app/login/` e `app/cadastrar/`).

### US-MOB-002 — Home com grade de tipos de ficha

**Como** técnico
**Quero** ver os tipos de ficha disponíveis em cards visuais
**Para que** eu identifique rapidamente qual preencher

**Critérios:**

- **Given** o técnico está autenticado
  **When** abre a home
  **Then** vê grade com 1 card por tipo de `SCHEMAS_FICHA[codigo].disponivel === true` (hoje os 7), cada card mostrando rótulo + ícone representativo
- **Given** o técnico clica em um card
  **When** o tipo é selecionado
  **Then** navega pra busca de posto, tipo guardado em estado de navegação
- **Given** existem rascunhos locais não enviados
  **When** abre a home
  **Then** vê banner "você tem N rascunhos pendentes" com link pra lista

**Estimativa:** M (UI nova + design system, reuso de `SCHEMAS_FICHA`).

### US-MOB-003 — Buscar e selecionar posto

**Como** técnico com tipo de ficha selecionado
**Quero** buscar o posto onde estou
**Para que** vincule a ficha ao posto correto

**Critérios:**

- **Given** o técnico digitou ≥ 3 caracteres
  **When** debounce expira (300ms)
  **Then** lista resultados (até 20) com prefixo + nome + município
- **Given** o técnico clica em um resultado
  **When** o posto é selecionado
  **Then** se o tipo da ficha é aplicável ao `tipo_de_estacao` do posto, navega pro formulário; senão mostra aviso e oferece voltar pra home
- **Given** sem internet
  **When** o técnico tenta buscar
  **Then** mensagem "busca requer conexão", botão "tentar de novo"

**Estimativa:** S (reuso da rota de busca já existente).

### US-MOB-004 — Preencher formulário dinâmico de ficha

**Como** técnico com posto + tipo selecionados
**Quero** preencher os campos da ficha conforme o schema
**Para que** envie dados estruturados e válidos

**Critérios:**

- **Given** o tipo é Inspeção (codigo=3)
  **When** o formulário renderiza
  **Then** gera seções e campos conforme `SCHEMAS_FICHA[3].secoes`, com widgets corretos por `tipo` (texto, textarea, numero, select, checkbox)
- **Given** o usuário preenche um campo numérico fora do `min`/`max`
  **When** tenta enviar
  **Then** validação client-side bloqueia, mostra erro inline, não envia
- **Given** o usuário deixa campo `obrigatorio: true` vazio
  **When** tenta enviar
  **Then** validação bloqueia, foca o primeiro erro, anuncia via aria-live (a11y)
- **Given** o usuário fecha o app no meio
  **When** abre de novo
  **Then** rascunho é recuperado da chave `rascunho:<usuario_id>:<prefixo>:<codigo>`
- **Given** GPS está disponível e usuário consentiu
  **When** abre o formulário
  **Then** captura coordenadas em background (não bloqueia UI), envia junto no submit

**Estimativa:** M-L (renderer dinâmico, validação dupla, persistência local, a11y).

### US-MOB-005 — Enviar ficha pra triagem

**Como** técnico com ficha preenchida
**Quero** enviar a ficha
**Para que** ela entre no fluxo de aprovação

**Critérios:**

- **Given** ficha válida + internet
  **When** clica em "enviar"
  **Then** POST `/api/triagem/fichas` retorna 201 com ID; tela de sucesso; rascunho local apagado
- **Given** ficha válida + sem internet
  **When** clica em "enviar"
  **Then** vai pra fila local em IndexedDB, mostra "aguardando sincronização"; ao voltar online, drena fila automaticamente
- **Given** Zod do servidor rejeita o payload
  **When** o servidor responde 422
  **Then** mensagem específica + foco no primeiro campo problemático
- **Given** rate limit é atingido
  **When** servidor responde 429
  **Then** mensagem "muitas requisições — tente em X segundos" + retry automático com backoff

**Estimativa:** M (fila offline + tratamento de erro robusto).

### US-MOB-006 — Ver "Minhas fichas" com status

**Como** técnico
**Quero** ver minhas fichas enviadas e seus status
**Para que** acompanhe e responda a devoluções

**Critérios:**

- **Given** o técnico abre a aba "Minhas fichas"
  **When** lista carrega
  **Then** mostra fichas agrupadas por status (pendente, em_revisao, devolvida, aprovada, rejeitada), com data e tipo
- **Given** uma ficha está devolvida
  **When** o técnico clica
  **Then** vê motivo do aprovador + botão "editar e re-enviar"
- **Given** uma ficha foi rejeitada
  **When** o técnico clica
  **Then** vê motivo do aprovador, sem ação possível (só leitura)

**Estimativa:** M.

### US-WEB-001 — Tela de triagem (web)

**Como** agente aprovador
**Quero** ver a fila de fichas pendentes
**Para que** eu trabalhe na ordem certa

**Critérios:**

- **Given** estou autenticado com MFA + papel `aprovador`
  **When** abro `/triagem`
  **Then** vejo lista filtrável (tipo, posto, técnico, data); default = `pendente` ordenado por mais antigos
- **Given** clico em ficha
  **When** abre detalhe
  **Then** status passa a `em_revisao` (com meu `revisor_id`); evento registrado em `triagem_eventos`
- **Given** outro aprovador já está revisando
  **When** abro a mesma ficha
  **Then** vejo "em revisão por Fulano há X minutos" + botão "tomar a ficha" (com confirmação)

**Estimativa:** M.

### US-WEB-002 — Aprovar ficha

**Como** aprovador em `em_revisao`
**Quero** aprovar a ficha
**Para que** ela entre em `fichas_visita`

**Critérios:**

- **Given** ficha em `em_revisao` por mim
  **When** clico em "aprovar"
  **Then** dispara transação atômica: status → `aprovada`, INSERT em `fichas_visita`, evento em `triagem_eventos`
- **Given** o posto foi descomissionado entre envio e aprovação
  **When** clico em "aprovar"
  **Then** sistema bloqueia com mensagem clara; ficha permanece em `em_revisao`

**Estimativa:** S (use case bem isolado).

### US-WEB-003 — Rejeitar ficha

**Como** aprovador
**Quero** rejeitar com motivo claro
**Para que** o técnico entenda

**Critérios:**

- **Given** ficha em `em_revisao` por mim
  **When** clico em "rejeitar" e preencho motivo (≥ 20 chars)
  **Then** status → `rejeitada`, motivo em `triagem_eventos.motivo`, ficha some da fila
- **Given** motivo < 20 chars
  **When** tento confirmar
  **Then** validação bloqueia, foca campo

**Estimativa:** S.

### US-WEB-004 — Devolver ficha pra correção

**Como** aprovador
**Quero** devolver com solicitação de correção
**Para que** o técnico ajuste sem refazer do zero

**Critérios:**

- **Given** ficha em `em_revisao` por mim
  **When** clico em "devolver" e preencho solicitação
  **Then** status → `devolvida`, solicitação visível pro técnico
- **Given** o técnico re-envia (após editar)
  **When** o sistema recebe
  **Then** mesmo `id`, status volta pra `pendente`, novo evento `re_enviada`

**Estimativa:** M.

### US-WEB-005 — Auditoria por ficha

**Como** aprovador ou gestor
**Quero** ver o histórico completo de eventos de uma ficha
**Para que** entenda quem fez o quê

**Critérios:**

- **Given** estou em uma ficha
  **When** abro "histórico"
  **Then** vejo timeline com todos os eventos de `triagem_eventos` (envio, início revisão, decisão), com usuário, timestamp, motivo

**Estimativa:** S.

---

## 6. Estimativa em Sprints

| Sprint | Conteúdo | Tamanho |
|--------|----------|---------|
| Sprint 1 | ADRs aprovados; migration de `fichas_triagem` + `triagem_eventos` + flag de papel; backend `/api/triagem/fichas` (POST do app) com Zod por tipo + rate limit; tela `/triagem` (lista + detalhe) só de leitura | M |
| Sprint 2 | Backend: ações aprovar/rejeitar/devolver com transação atômica + promoção pra `fichas_visita`; Frontend web: ações na tela de triagem + auditoria | M |
| Sprint 3 | App PWA shell: manifest, service worker básico, login, home, busca de posto, formulário dinâmico, envio simples (sem fila offline) | M |
| Sprint 4 | App: rascunho local, fila de envios offline, tela "Minhas fichas", a11y completa, MFA pro aprovador | M |
| Sprint 5 | Capacitor + APK pro Android (build pipeline), runbooks, hardening de segurança, regression check, deploy homologação | S |

**Total: ~5 sprints de 2 semanas (~10 semanas).** Itens "iOS via Capacitor" e "Background Sync" ficam fora — backlog.

---

## 7. Estados de Interface Cobertos

Cada tela do app + nova tela de triagem deve cobrir:

| Estado | Aplicável a |
|--------|------------|
| Vazio (sem dados) | Home (sem rascunhos), Minhas fichas (sem envios), Triagem (fila vazia) |
| Carregando | Busca de posto, lista de triagem, ações (aprovar/rejeitar) |
| Erro | Sem internet, 401, 422, 429, 500 |
| Sucesso | Envio confirmado, aprovação confirmada |
| Borda | Rascunho recuperado, fila offline drenando, sessão expirou no meio |
| Sem permissão | Técnico tenta acessar `/triagem`, aprovador sem MFA habilitado |

---

## 8. Requisitos Não-Funcionais

- **Acessibilidade:** WCAG 2.1 AA / e-MAG. Foco visível, ARIA roles corretos, contraste mínimo, suporte a leitor de tela em campo (técnico pode usar TalkBack), tamanhos de toque ≥ 44px.
- **Performance:** First Contentful Paint < 2s em 3G simulado; offline-ready em < 5s após primeira instalação.
- **Audit trail:** toda ação relevante (envio, transição, login do aprovador) registrada com `usuario_id`, `ip`, `user_agent`, timestamp.
- **LGPD:** consentimento documentado pra captura de GPS; direito de exclusão tratado caso-a-caso (ficha tem valor histórico institucional — não cabe exclusão automática).
- **Segurança:** ver seção 8 do ADR-0008 e relatório do André em `docs/seguranca/checklist-modulo-mobile.md`.

---

## 9. Pendências bloqueantes (aguardando Rafael)

Ver "Pendências" no relatório executivo do Matheus (entrega desta rodada).

---

## 10. Próximos Passos

1. Rafael revisa este documento + ADR-0007 + ADR-0008 + checklist André.
2. Decisões nas pendências bloqueantes (rate limit infra, MFA via Supabase nativo, papel de aprovador).
3. Disparo da Sprint 1 com Lucas (backend) e Bruno (migrations + scaffolding `/app/*`) primeiro, Fernanda em sequência pra UI da triagem na web.

---

**Camila — PO Produto**
**Damasceno Dev OS**
**2026-05-08**
