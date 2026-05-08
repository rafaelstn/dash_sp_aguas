# ADR-0006 — Pivô da autenticação: email + senha + cadastro self-service

| Campo | Valor |
|-------|-------|
| Status | Aceito — 2026-05-08 |
| Autor | Damasceno Dev OS (Bruno — Engenharia; André — Segurança) |
| Contexto | Ficha Técnica de Postos Hidrológicos SPÁguas — MVP (Fase 1) |
| Substitui / complementa | **Suplementa e atualiza ADR-0004** (mantém isolamento, allowlist e ausência de MFA; muda método de login e self-signup) |
| Referências | `docs/adr/0004-auth-supabase-fase-1.md`; `docs/adr/0005-favoritos-por-usuario.md`; `docs/architecture.md §2.1, §4.2, §5.3.4, §5.4, §10` |

---

## 1. Contexto

A ADR-0004 fixou em 23/04/2026 a primeira encarnação da autenticação no MVP:
**magic link** por email + **sem self-signup funcional** + allowlist server-side
de domínios institucionais. A decisão foi tomada para destravar o deploy
Vercel mantendo identidade individual nas trilhas LGPD (`acesso_ficha`,
`revisoes_desconformidade`).

Entre 23/04/2026 e 05/05/2026, três fatos operacionais reabriram a decisão:

1. **Demo a avaliadores externos:** o cliente solicitou que consultores e
   revisores externos pudessem entrar no sistema durante a fase de
   homologação, sem passar por provisionamento manual de conta no painel
   Supabase para cada avaliador.
2. **Atrito com magic link:** logs de avaliadores reportaram experiência
   confusa com o fluxo de email — links expirando antes do clique, caixa
   de SPAM em provedores institucionais filtrando o remetente, e
   necessidade de copiar o código manualmente em alguns clientes de email
   corporativo. Em uma demo presencial, três avaliadores não conseguiram
   entrar.
3. **Necessidade de cadastro de nome de exibição:** a sidenav passou a
   mostrar o nome do usuário logado (commit `3f8f176`), o que não é
   coletado em nenhum momento do fluxo de magic link puro.

Mantida a pré-condição original (sistema na Vercel, internet pública,
identidade individual obrigatória para LGPD), o método precisa ser
revisado.

## 2. Decisão

Substituir o método de autenticação documentado na ADR-0004 pelo conjunto
abaixo. O **isolamento arquitetural** (item 7 da ADR-0004), a **allowlist
server-side** (item 3) e a **ausência de MFA / RBAC** (itens 5 e 6) ficam
**preservados**.

1. **Método de login:** email + senha (`signInWithPassword` do Supabase
   Auth). Sessão estabelecida imediatamente no cookie httpOnly do
   `@supabase/ssr`. Mensagem de erro deliberadamente genérica para não
   revelar se o email existe na base.
2. **Self-signup ativo:** rota `/cadastrar` com formulário de nome + email
   + senha. `nome` armazenado em `user_metadata.nome` do Supabase Auth e
   exibido na sidenav. Senha mínima de 6 caracteres (validada client +
   server). Tratamento explícito do estado *unconfirmed* caso o painel
   Supabase tenha "Confirm email" ativo.
3. **Allowlist permanece como gate principal:** validação de domínio
   `sp.gov.br` / `daee.sp.gov.br` + `AUTH_EXTRA_ALLOWED_EMAILS` ocorre
   server-side **antes** do `signInWithPassword` ou do `signUp`. Nunca
   tocamos Supabase Auth com email não autorizado.
4. **Wildcard de demo:** setar `AUTH_ALLOWED_EMAIL_DOMAINS=*` libera
   qualquer domínio (mantida a validação de formato). Uso restrito à fase
   de homologação com avaliadores externos. Em produção, restaurar a lista
   institucional. Documentado no `.env.example` e no comentário do
   `allowlist.ts`.
5. **Bypass de desenvolvimento:** `infrastructure/auth/dev-bypass.ts`
   permite simular um usuário logado em `next dev` quando
   `DEV_BYPASS_AUTH_EMAIL` e `DEV_BYPASS_AUTH_USER_ID` (UUID válido) estão
   no `.env.local`. Duas guardas obrigatórias: `NODE_ENV === 'development'`
   e `DEV_BYPASS_AUTH_EMAIL` presente. Validação estrita de UUID v1–v5 com
   *fail-fast* — sem isso, FKs para `auth.users` quebram em runtime com
   mensagem opaca. Em produção, qualquer valor é ignorado.
6. **Rotas públicas do middleware:** `/login`, `/cadastrar`, `/auth/callback`,
   `/auth/sair`, `/api/health`. Usuário autenticado tentando acessar
   `/login` ou `/cadastrar` é redirecionado para a home. Matcher do
   middleware exclui assets estáticos para evitar 307 em arquivos de
   `public/` (logo, ícones, fontes).
7. **Layout chrome só em rotas autenticadas:** `/login` e `/cadastrar`
   renderizam centralizados, sem sidenav. Implementado no root layout
   (commit `d2136f0`).

## 3. Alternativas consideradas

| Alternativa | Por que rejeitada |
|-------------|-------------------|
| Manter magic link e treinar avaliadores | Não resolve filtros de SPAM nem expiração curta; treinamento não escala para todo avaliador externo. |
| Magic link + email + senha como opção | Dois fluxos paralelos dobram a superfície de bug e a documentação. |
| OAuth Google institucional | Avaliadores externos não têm conta `@daee.sp.gov.br`; provisioning OAuth no Entra ID do cliente não estava negociado. |
| Manter `shouldCreateUser: false` + provisionar manualmente cada avaliador | Operacionalmente inviável em escala de homologação; gera atrito de suporte para o consultor. |
| Email + senha **sem** self-signup (só painel Supabase) | Resolve método mas não a fricção de provisionamento — mesmo problema da alternativa anterior. |
| Email + senha + self-signup com **confirmação** obrigatória de email | Reintroduz o problema do magic link (filtros de SPAM); mantida como opção configurável no painel Supabase, com tratamento de fallback no `cadastrar/actions.ts`. |

## 4. Consequências

### 4.1 Positivas

- **Friction de onboarding zero** durante demo: avaliador externo entra em
  `/cadastrar`, preenche 3 campos, está dentro do sistema. Não depende de
  caixa de email institucional.
- **Nome de exibição** disponível desde o cadastro (sidenav, possíveis
  futuras telas de perfil) sem fluxo adicional de coleta.
- **Allowlist mantida** preserva o controle territorial original — em
  produção, basta restaurar a lista institucional para reforçar o gate.
- **Dev-bypass** acelera o ciclo local: sem precisar logar a cada `next dev`,
  com validação de UUID que falha cedo se a configuração estiver errada.

### 4.2 Negativas / trade-offs

- **Senha gerenciada:** usuários precisam memorizar/gerenciar uma senha
  adicional. Mitigação: política mínima de 6 caracteres no MVP; revisão
  na Fase 2 quando o gestor do DAEE definir política de senha
  institucional.
- **Superfície de força bruta:** `signInWithPassword` é alvo natural; o
  Supabase aplica rate limit nativo, mas a allowlist passa a ter peso
  ainda maior como primeira linha. **Em produção, o wildcard `*` está
  proibido** — a operação de retomar a lista institucional é bloqueante
  para liberar acesso público.
- **Estado *unconfirmed*:** se o painel Supabase tiver "Confirm email"
  ATIVO, `signUp` completa mas não cria sessão. O `cadastrar/actions.ts`
  detecta a ausência de `data.session` e retorna mensagem amigável;
  responsabilidade do painel Supabase manter "Confirm email" DESMARCADO
  durante a fase de homologação. Documentar no runbook.

### 4.3 Impacto operacional

- **Mudança no `.env`:** adicionado `AUTH_ALLOWED_EMAIL_DOMAINS` (com
  suporte a `*` para demo) e `DEV_BYPASS_AUTH_USER_ID` (UUID).
- **Rotas novas:** `/cadastrar` (page + form + server action) na fronteira
  pública.
- **`infrastructure/auth/`:** ganhou `dev-bypass.ts`. Mantidos `allowlist.ts`,
  `current-user.ts`, `supabase-server.ts`, `supabase-browser.ts`.
- **Painel Supabase:** "Confirm email" deve ficar **DESMARCADO** em
  homologação. Auditar antes de promover para produção.
- **Sem migrations novas:** o schema continua compatível — `usuario_id`
  permanece nullable em `acesso_ficha` e `revisoes_desconformidade`,
  `usuarios_favoritos.usuario_id` continua FK para `auth.users(id)`.

## 5. Como rolar back

Reverter para o estado da ADR-0004 exige:

1. Remover rota `/cadastrar` (page, form, action).
2. Trocar `signInWithPassword` por `signInWithOtp` no
   `app/login/actions.ts` (e ajustar a UI do formulário).
3. Reativar `shouldCreateUser: true` no `signInWithOtp` ou desativar
   conforme política do momento.
4. Manter `allowlist.ts`, `current-user.ts`, `dev-bypass.ts` — são
   ortogonais ao método.
5. Restaurar a lista institucional em `AUTH_ALLOWED_EMAIL_DOMAINS`.

Nenhuma migration de banco é necessária para o rollback. Dados de
usuários cadastrados via self-signup continuam existindo em `auth.users`
e podem ser desativados pelo painel Supabase.

## 6. Status de execução

- `app/login/actions.ts` migrado para `signInWithPassword` ✓ (commit `cfc0813`)
- `app/cadastrar/{page,FormularioCadastro,actions}.ts` criados ✓ (commit `3f8f176`)
- `infrastructure/auth/dev-bypass.ts` criado com validação de UUID ✓ (commits `cfc0813`, `0a32ded`)
- `middleware.ts` atualizado: rotas públicas, redirect de logado, matcher de assets ✓ (commits `cfc0813`, `ca4c39b`)
- `current-user.ts` lendo `user_metadata.nome` ✓
- `allowlist.ts` com suporte a wildcard `*` (modo demo) ✓
- Layout chrome apenas em rotas autenticadas ✓ (commit `d2136f0`)
- Sidenav exibindo nome do usuário ✓ (commit `3f8f176`)

## 7. Pendências

- [ ] Auditoria de produção: confirmar `AUTH_ALLOWED_EMAIL_DOMAINS` com
  domínios institucionais antes do *go-live* — wildcard `*` é homologação
  apenas.
- [ ] Runbook descrevendo como o painel Supabase deve estar configurado
  (Email provider habilitado, "Confirm email" desmarcado em homologação).
- [ ] Política de senha do DAEE definida (Fase 2): revisar `SENHA_MINIMA`
  no `cadastrar/actions.ts` se o cliente exigir mínimo > 6.
- [ ] Avaliação de MFA na Fase 2 conforme exigência contratual.
