-- =============================================================================
-- Migration 0028, Remover obrigatoriedade de MFA do aprovador (ADR-0010).
-- =============================================================================
-- Contexto: a decisão #2 da Fase 2.A (2026-05-08) e o ADR-0008 §2.3
-- estabeleciam MFA TOTP obrigatório para o papel aprovador, com 3 camadas
-- de defesa (trigger SQL, runtime check no use case, AAL2 na rota HTTP).
-- O ADR-0009 (2026-05-14) tentou tornar o MFA opcional via env. O ADR-0010
-- (2026-05-14) revoga a obrigatoriedade por completo: o sistema fica com
-- autenticação por email + senha apenas. Ver docs/adr/0010-remocao-mfa.md.
--
-- Esta migration drop o trigger SQL, a função de validação e a coluna
-- `mfa_obrigatorio` que ficou órfã. A coluna `aprovador` continua a
-- governar acesso à triagem.
--
-- Idempotente: usa DROP ... IF EXISTS.
-- =============================================================================

DROP TRIGGER IF EXISTS usuarios_papeis_validar_mfa ON usuarios_papeis;
DROP FUNCTION IF EXISTS trg_usuarios_papeis_validar_mfa();

ALTER TABLE usuarios_papeis
  DROP COLUMN IF EXISTS mfa_obrigatorio;

COMMENT ON TABLE usuarios_papeis IS
  'RBAC mínimo da Fase 2.A, flag de aprovador por usuário. MFA removido pelo ADR-0010 (2026-05-14).';
