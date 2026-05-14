# ADR-0010, Remoção do MFA do fluxo de aprovador

| Campo | Valor |
|-------|-------|
| Status | Aceito |
| Data | 2026-05-14 |
| Decisor | Rafael Damasceno (proprietário) |
| Escopo | Sistema inteiro: APP, dashboard web, banco, scripts, docs |
| Supersede | Decisão #2 da Fase 2.A (2026-05-08), ADR-0008 §2.3 (parcial), ADR-0009 (totalmente) |

---

## 1. Contexto

A decisão #2 da Fase 2.A estabeleceu MFA TOTP obrigatório para aprovador com 3 camadas de defesa (trigger SQL, runtime check no use case, AAL2 na rota). O ADR-0008 §2.3 detalhou a regra. O ADR-0009 (2026-05-14, mesma data deste) tentou tornar MFA opcional em homologação via env var `MFA_OPCIONAL_HOMOLOGACAO`.

Após implementar o ADR-0009, Rafael avaliou que a complexidade introduzida (flag, 3 camadas com bypass, ADR de exceção, log dedicado) não corresponde ao escopo real do sistema. A pedido dele:

> "tira esse MFA eu não pedi isso"

## 2. Decisão

Remover MFA por completo do sistema. Login fica em **email + senha** (Supabase Auth nativo). Controle de acesso da triagem continua governado pela flag `aprovador` em `usuarios_papeis`.

Mudanças concretas:

- **Banco**: migration 0028 dropa trigger `usuarios_papeis_validar_mfa`, função `trg_usuarios_papeis_validar_mfa()` e coluna `mfa_obrigatorio`.
- **Domínio**: classe `AprovadorSemMFA` removida de `domain/errors.ts`. Método `temMFAVerificado` removido do port `PapeisRepository` e das implementações pg + mock.
- **Use cases** (`aprovar`, `rejeitar`, `devolver`, `iniciar-revisao`): bloco `if (!temMFA) throw AprovadorSemMFA` removido. Só `ehAprovador` permanece.
- **Rotas API**: chamada `exigirSessaoAal2` removida das 4 rotas; helper deletado de `_helpers.ts`; slugs `mfa_obrigatorio` e `mfa_nao_validado_na_sessao` removidos de `respostaDeErro` e de `lib/triagem-api.ts#mensagemErroTriagem`.
- **UI**: rota `/perfil/mfa` deletada, componente `WizardMFA` deletado, aviso "Segundo fator pendente" da página de detalhe removido, alerta global de MFA no dashboard layout removido, bloco com link "Configurar segundo fator" do `DialogConfirmarDecisao` removido.
- **Config**: helper `mfa-config.ts` e env var `MFA_OPCIONAL_HOMOLOGACAO` removidos.
- **Scripts**: `promover_aprovador.py` e `diag_usuarios.py` simplificados (sem coluna `mfa_obrigatorio`, sem desabilitar trigger).
- **Testes**: casos `rejeita aprovador sem MFA` removidos dos 4 testes de use case + 3 cenários do pen-test V3 (MFA bypass) removidos. Factory `papeisFake` perdeu o parâmetro `semMfa`.

## 3. Consequências

### Positivas

- Redução significativa de complexidade: 3 camadas de defesa + 1 ADR de exceção + 1 helper viraram código simples.
- Tempo de login do aprovador volta a ser o mesmo do técnico, sem QR code, sem app autenticador, sem códigos de recuperação.
- Onboarding trivial: criar usuário, promover via script, logar.

### Negativas / riscos aceitos

- Aprovador autenticado com senha comprometida pode aprovar fichas sem barreira adicional. Mitigação parcial: allowlist server-side (`AUTH_ALLOWED_EMAIL_DOMAINS`) restringe cadastro a domínios institucionais (quando configurada), rate limit por usuário (`POLITICAS.decisaoTriagem`) limita aprovações em lote.
- Sai do alinhamento estrito com `governo.md` (regra "Auth: MFA para operações críticas" do `banco.md`, herdada por governo). Aceito por decisão do proprietário, sistema é interno do setor SPÁguas com universo pequeno de usuários (≤ 10) e ambiente em rede controlada.

## 4. Alternativas consideradas

1. **Manter MFA obrigatório (decisão #2 original).** Rejeitada pelo Rafael: fricção de UX desproporcional ao risco real do sistema.
2. **Manter MFA opcional via env (ADR-0009).** Rejeitada pelo Rafael na mesma sessão: complexidade do bypass não justifica manter a infra.
3. **Substituir MFA por challenge mais leve (ex.: re-pergunta de senha antes de aprovar).** Não considerada agora, fica como opção futura caso o cliente real (DAEE / SPÁguas em produção) peça reforço.

## 5. Trigger documental de revisão obrigatória

Este ADR deve ser revisado quando QUALQUER uma das condições for atendida:

- Cliente real (DAEE / SPÁguas) começar a usar o sistema em produção formal.
- Auditoria do governo apontar a ausência de MFA como não conformidade.
- Tamanho do quadro de aprovadores ultrapassar 10 pessoas (universo deixa de ser pequeno o suficiente para confiar só em senha + allowlist).

Em qualquer dessas, reabrir ADR e considerar reintrodução de MFA TOTP.
