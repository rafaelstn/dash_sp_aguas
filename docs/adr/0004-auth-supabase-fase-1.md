# ADR-0004 — Autenticação Supabase antecipada para a Fase 1 (desvio da US-008)

| Campo | Valor |
|-------|-------|
| Status | Aceito — 2026-04-23 |
| Autor | Damasceno Dev OS (André — Segurança; Bruno — Engenharia) |
| Contexto | Ficha Técnica de Postos Hidrológicos SPÁguas — MVP (Fase 1) |
| Substitui / complementa | ADR-0002 (§"Sem cliente supabase-js no MVP") |
| Referências | `docs/spec.md §1.2, §4.5, US-008`; `docs/architecture.md §5.6, §10` |

---

## 1. Contexto

A versão original da **US-008** (autenticação) estava classificada como Fase 2 por decisão
do Rafael em 22/04/2026, sob a pré-condição obrigatória de que **o MVP rodasse
exclusivamente em rede interna do setor SPÁguas, sem exposição à internet pública**
(spec §1.2). A trilha LGPD (`acesso_ficha`) registrava apenas `timestamp`, `ip`,
`user_agent` e `prefixo_consultado`, com `usuario_id` nullable até a Fase 2.

Em 23/04/2026, o Rafael decidiu subir o dashboard para a Vercel (ambiente de
homologação/preview). Isso cria uma URL pública, o que viola a pré-condição
acima enquanto não houver autenticação.

## 2. Decisão

Antecipar a autenticação para a Fase 1, com as seguintes restrições deliberadas:

1. **Provedor:** Supabase Auth (mesma organização que hospeda o PostgreSQL do
   MVP). Integração via `@supabase/ssr` no Next.js 15 (App Router).
2. **Método de login:** **magic link** por email (OTP). Dispensa gestão de senha,
   reduz superfície de ataque e é adequado ao tom formal do setor público.
3. **Allowlist de domínios:** apenas endereços em domínios institucionais
   (`sp.gov.br`, `daee.sp.gov.br`) + lista de exceções via env
   (`AUTH_EXTRA_ALLOWED_EMAILS`) para consultor/administrador. Validação
   ocorre server-side **antes** de qualquer chamada ao Supabase — nunca
   disparamos email para endereço não autorizado.
4. **Sem self-signup funcional pro usuário final:** `shouldCreateUser: true` é
   usado porque o Supabase cria o registro no primeiro login, mas a allowlist
   garante que apenas emails autorizados chegam a esse passo.
5. **Sem MFA no MVP.** Reavaliado na Fase 2 se houver exigência contratual.
   Nenhuma regra de governo consultada (`~/.claude/rules/governo.md`) exige MFA
   para este escopo.
6. **Escopo: apenas gate.** Sem distinção de papel (leitor vs curador) no MVP —
   qualquer usuário autenticado pode marcar desconformidades como revisadas.
   Evolução pra RBAC fica para ADR futuro se necessário.
7. **Isolamento arquitetural:** todo código relacionado a auth fica em
   `src/infrastructure/auth/` (clientes, helper `obterUsuarioAtual`, allowlist)
   + `src/middleware.ts` (gate) + `src/app/login/` + `src/app/auth/*`. Casos
   de uso (`application/use-cases/*`) e domínio (`domain/*`) permanecem
   desconhecendo a biblioteca Supabase Auth — recebem `usuarioId: string | null`
   como parâmetro das camadas externas. Coerente com o ADR-0002.

## 3. Alternativas consideradas

| Alternativa | Por que rejeitada |
|-------------|-------------------|
| Manter Vercel com password protection nativo (Deployment Protection) | Não cria identidade individual, logo não resolve a auditoria LGPD. Usável como camada extra, não substitui auth. |
| Build next-auth / Auth.js | Mais peças móveis (adapter + provider + DB schema próprio). Desalinha com provedor já em uso (Supabase). |
| Manter sem auth e usar Vercel IP allowlist do DAEE | Vercel Pro suporta IP allowlist, mas depende de IPs estáticos do setor (não confirmados). Fragiliza operação em home office. |
| Email + senha (sem magic link) | Maior superfície de ataque (força bruta, vazamento) e exige fluxo adicional de reset. Magic link é mais seguro e mais simples para público não-técnico. |
| OAuth Microsoft / Google | Superior para M365, mas exige configuração no Entra ID do cliente. Fica registrado como opção futura quando o DAEE liberar. |

## 4. Consequências

### 4.1 Positivas
- **Destrava o deploy Vercel** sem violar a pré-condição da spec §1.2.
- **Trilha LGPD ganha identidade individual** imediatamente: `acesso_ficha.usuario_id`
  e `revisoes_desconformidade.usuario_id` passam a ser preenchidos.
- **Alinhada ao isolamento do ADR-0002:** auth não contamina use cases nem domínio.

### 4.2 Negativas / trade-offs
- Escopo da Fase 1 aumentou em ~8 arquivos + 1 migration (0019).
- Usuários precisam acesso a email institucional para entrar — depende da
  operação do DAEE liberar email por consultor externo quando aplicável (lista
  de exceções mitiga).
- Sessão via cookie httpOnly gerida pelo `@supabase/ssr`; upgrade de versão
  da lib requer leitura do changelog antes de aplicar.

### 4.3 Impacto operacional
- **Mudança no `.env`:** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  passam a ser **obrigatórias em produção** (`env.ts` valida). Opcionais em dev.
- **Novas migrations:**
  - `0019_revisoes_desconformidade_usuario_id.sql` — adiciona a coluna nullable.
- **Redações da spec:** US-008 permanece documentando a estrutura, mas na
  prática é cumprida por este ADR. A retrocompatibilidade com `usuario_id = NULL`
  se mantém para registros criados antes da ativação da auth.

## 5. Como rolar back

Se a Vercel for abandonada e o sistema voltar a rodar só em rede interna:
1. Remover `middleware.ts` ou suavizar o matcher.
2. Desabilitar Supabase Auth no dashboard do projeto.
3. `usuario_id` permanece nullable, dados antigos preservados.
4. Aplicação continua funcionando sem gate.

A parte de infraestrutura é removível; a tabela/coluna `usuario_id` não precisa
ser revertida — convive com `NULL`.

## 6. Status de execução

- `env.ts` estendido ✓
- `src/infrastructure/auth/*` criado ✓
- `src/middleware.ts` criado ✓
- `src/app/login/*` e `src/app/auth/*` criados ✓
- `header` do root layout mostra email logado + botão Sair ✓
- Migration 0019 criada e aplicada no pooler Supabase ✓
- API `/api/desconformidades/revisoes` e rotas de postos populam `usuario_id` ✓
- Lint + typecheck zerados ✓

Próximo commit: `feat(auth): autenticação Supabase magic link (ADR-0004)`.
