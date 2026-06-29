-- =============================================================================
-- Migration 0050 — RBAC com papel nomeado (super_admin / admin / user)
-- =============================================================================
-- Contexto: o RBAC anterior (migration 0023) tinha só a flag booleana
-- `aprovador`. O sistema agora precisa de tres papeis explicitos:
--   user        -> assistente (app de campo + consulta)
--   admin       -> equipe (= o antigo "aprovador": aprova triagem, edita dado
--                  oficial, gerencia usuarios comuns)
--   super_admin -> dono da operacao (gerencia Admins e papeis)
--
-- Migracao de dados (idempotente):
--   1. aprovador = TRUE  => papel 'admin'
--   2. e-mail do dono     => papel 'super_admin'
--   3. demais             => 'user' (default da coluna)
-- A flag `aprovador` e MANTIDA por compatibilidade, mas `papel` passa a ser a
-- fonte unica de verdade; `eh_aprovador()` foi reescrita para derivar de papel.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CHECK condicional + UPDATEs idempotentes.
-- Reversivel: ALTER TABLE ... DROP COLUMN IF EXISTS papel; e restaurar
--   eh_aprovador() da migration 0023.
-- =============================================================================

-- 1. Coluna papel (default 'user'; CHECK restringe aos tres valores).
ALTER TABLE IF EXISTS usuarios_papeis
  ADD COLUMN IF NOT EXISTS papel TEXT NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_papeis_papel_check'
  ) THEN
    ALTER TABLE usuarios_papeis
      ADD CONSTRAINT usuarios_papeis_papel_check
      CHECK (papel IN ('super_admin', 'admin', 'user'));
  END IF;
END$$;

COMMENT ON COLUMN usuarios_papeis.papel IS
  'Papel de acesso (RBAC): super_admin | admin | user. Fonte unica de verdade; aprovador legado e derivado (admin/super = aprovador).';

-- 2. Migracao de dados: aprovador TRUE vira admin.
UPDATE usuarios_papeis SET papel = 'admin'
 WHERE aprovador = TRUE AND papel = 'user';

-- 3. BOOTSTRAP DO PRIMEIRO SUPER_ADMIN: feito FORA desta migration, por
--    processo de implantacao, para nao versionar e-mail pessoal/de fornecedor
--    em repositorio de governo (rastreabilidade/classificacao de dados,
--    Decreto 10.046). Em cada ambiente, promova o titular institucional com um
--    comando pontual usando um e-mail dentro da allowlist do ambiente:
--      UPDATE usuarios_papeis p SET papel='super_admin', aprovador=TRUE
--        FROM auth.users u
--       WHERE u.id=p.usuario_id AND u.email='<super-admin-institucional>';
--    (ou INSERT ... ON CONFLICT se a linha ainda nao existir). Ver SECURITY.md.

-- 4. eh_aprovador() passa a derivar de papel (admin ou super_admin).
CREATE OR REPLACE FUNCTION eh_aprovador(p_usuario UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_papeis
     WHERE usuario_id = p_usuario
       AND papel IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql STABLE;

-- 5. Funcoes utilitarias por papel (consumidas pelos guards do backend).
CREATE OR REPLACE FUNCTION eh_admin(p_usuario UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_papeis
     WHERE usuario_id = p_usuario
       AND papel IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION eh_super_admin(p_usuario UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_papeis
     WHERE usuario_id = p_usuario
       AND papel = 'super_admin'
  );
$$ LANGUAGE sql STABLE;

CREATE INDEX IF NOT EXISTS idx_usuarios_papeis_papel
  ON usuarios_papeis (papel);
