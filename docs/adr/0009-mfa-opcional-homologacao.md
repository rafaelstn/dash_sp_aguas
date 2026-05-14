# ADR-0009 — MFA opcional em homologação (revisão da decisão #2 da Fase 2.A)

| Campo | Valor |
|-------|-------|
| Status | Aceito |
| Data | 2026-05-14 |
| Decisor | Rafael Damasceno (proprietário) |
| Escopo | Apenas homologação (URL pública `dash-sp-aguas.vercel.app` enquanto cliente final não estiver usando) |
| Revoga temporariamente | Decisão #2 da Fase 2.A (MFA TOTP Supabase nativo obrigatório para aprovador) |
| Reverte ao quê | Estado anterior a este ADR; ver §5 |

---

## 1. Contexto

A decisão #2 da Fase 2.A (2026-05-08) estabeleceu MFA TOTP obrigatório para aprovador, com 3 camadas de defesa:

1. Trigger SQL `trg_usuarios_papeis_validar_mfa` (migration 0023) bloqueia INSERT/UPDATE em `usuarios_papeis` com `aprovador=TRUE` sem MFA verificado em `auth.mfa_factors`.
2. Cada use case (aprovar, rejeitar, devolver, iniciar-revisao) chama `papeis.temMFAVerificado` antes de operar.
3. Cada rota HTTP crítica chama `exigirSessaoAal2`, validando que a sessão atual passou o challenge MFA (não basta ter fator cadastrado).

Em 2026-05-14, durante setup de teste end-to-end do fluxo APP → Sistema → banco oficial, Rafael solicitou desligar a obrigatoriedade enquanto a Vercel ainda não está em uso real por cliente:

> "Deixa isso quando for entrar em produção caso necessário. Deixa o login e senha como já está."

Justificativa: o ambiente de homologação ainda não tem usuários reais, MFA atrasa cada ciclo de teste (precisa escanear QR + digitar 6 dígitos a cada nova sessão), e o usuário-teste é o próprio proprietário do projeto.

## 2. Decisão

Introduzir variável de ambiente `MFA_OPCIONAL_HOMOLOGACAO=true` que, quando presente e igual a `true`, desliga as 3 camadas:

- Camada 1 (trigger SQL): o script `scripts/promover_aprovador.py` desabilita o trigger durante a transação e reabilita após (não modifica o trigger no esquema).
- Camada 2 (use cases): `papeis.temMFAVerificado` deixa de ser chamado quando `mfaObrigatorio() === false`.
- Camada 3 (rotas): `exigirSessaoAal2` retorna sem fazer nada quando `mfaObrigatorio() === false`, com log estruturado `seg.mfa.bypass_homologacao` para auditoria.

Default permanece **seguro**: ausência da env var ou valor diferente de `true` mantém o comportamento original (MFA obrigatório).

## 3. Consequências

### Positivas

- Teste end-to-end imediato sem custo de configurar TOTP a cada nova sessão.
- Default seguro: se a env var não existir em produção, sistema bloqueia operações sem MFA como antes.
- Reversibilidade trivial: deletar a env var na Vercel + redeploy.
- Trail de auditoria: log estruturado `seg.mfa.bypass_homologacao` é emitido cada vez que a camada 3 é bypassada, roteado pelo SIEM (alerta dedicado a configurar).

### Negativas / riscos aceitos

- Aprovador autenticado com senha vazada (sem proteção MFA) pode aprovar fichas. Risco aceito enquanto ambiente é de homologação interno.
- A Vercel é pública (`*.vercel.app` indexada). Allowlist server-side (`AUTH_ALLOWED_EMAIL_DOMAINS`) continua filtrando cadastros, mas o wildcard `*` do modo demo está ativo. Sem MFA, comprometimento de qualquer email cadastrado é fatal para a triagem.
- Trigger SQL permanece **definido** no esquema. O bypass ocorre apenas durante a operação do script (DISABLE local + ENABLE), preservando defesa em profundidade para acessos diretos ao banco que não passem pelo script.

## 4. Alternativas consideradas

1. **Remover trigger + helpers permanentemente.** Rejeitada: perde defesa em profundidade da Fase 2.A; difícil reverter; ADR-0008 ficaria desatualizado.
2. **Ramo separado `homologacao`.** Rejeitada: complexidade de manter duas branches; Vercel já tem só um ambiente por enquanto.
3. **Manter MFA obrigatório e configurar agora.** Rejeitada por solicitação do Rafael (custo de TOTP repetido no teste).

## 5. Como reverter (antes do go-live)

1. Painel Vercel → Settings → Environment Variables → remover `MFA_OPCIONAL_HOMOLOGACAO`.
2. Confirmar que `.env.local` de qualquer máquina dev também não tem a var setada.
3. Redeploy automático (push vazio em `main` ou re-trigger via painel).
4. Validar via smoke test: tentar aprovar ficha com sessão AAL1 deve retornar 403 com `erro: 'mfa_nao_validado_na_sessao'`.
5. Validar no banco: rodar `promover_aprovador.py` em usuário sem MFA deve falhar com `RaiseException` do trigger.
6. Atualizar memoria local `~/.claude/projects/.../memory/decisoes_fase_2a.md`: decisão #2 volta a vigorar.

## 6. Trigger documental de revisão obrigatória

Este ADR deve ser revisado quando QUALQUER uma das condições for atendida:

- Cliente real (DAEE / SPÁguas) começar a usar o sistema na Vercel.
- Domínio institucional `*.sp.gov.br` assumir o lugar do `*.vercel.app`.
- Migração de homologação para produção formal (mudança do cliente).

Em qualquer dessas, executar §5 antes da liberação.
