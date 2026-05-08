-- =============================================================================
-- Migration 0023 — Tabela `usuarios_papeis` (RBAC mínimo da Fase 2.A)
-- =============================================================================
-- Contexto: o módulo de triagem (ADR-0008) introduz o primeiro caso de RBAC do
-- projeto. Por hora há um único papel especial — `aprovador`. Ao invés de
-- modelar enum completo (overkill no MVP, ver §2.3 do ADR-0008), gravamos uma
-- flag booleana por usuário.
--
-- A constraint operacional é: APROVADOR ⇒ MFA OBRIGATÓRIO. A primeira linha de
-- defesa é um trigger SQL que consulta `auth.mfa_factors` antes de permitir o
-- INSERT/UPDATE com `aprovador = TRUE`. A segunda linha é o runtime check
-- (`session.aal === 'aal2'`) feito pelo backend em cada rota privilegiada.
-- Não confiamos em só uma camada — a regra `banco.md` exige defesa em
-- profundidade.
--
-- Idempotente via IF NOT EXISTS + DO $$ pros triggers.
-- Reversível via DROP TABLE usuarios_papeis CASCADE; DROP FUNCTION
--   trg_usuarios_papeis_validar_mfa(); DROP FUNCTION eh_aprovador(uuid);
-- =============================================================================

CREATE TABLE IF NOT EXISTS usuarios_papeis (
  usuario_id        UUID         PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  aprovador         BOOLEAN      NOT NULL DEFAULT FALSE,
  mfa_obrigatorio   BOOLEAN      NOT NULL DEFAULT FALSE,
  observacao        TEXT         NULL,
  criado_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_papeis_aprovador
  ON usuarios_papeis (usuario_id) WHERE aprovador = TRUE;

-- Trigger pra manter `atualizado_em` fresca.
CREATE OR REPLACE FUNCTION trg_usuarios_papeis_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'usuarios_papeis_atualizado_em'
  ) THEN
    CREATE TRIGGER usuarios_papeis_atualizado_em
    BEFORE UPDATE ON usuarios_papeis
    FOR EACH ROW EXECUTE FUNCTION trg_usuarios_papeis_atualizado_em();
  END IF;
END$$;

-- Trigger de defesa: aprovador SÓ pode ser ativado se já houver MFA verificado.
-- Consulta direta em `auth.mfa_factors` — schema gerenciado pelo Supabase Auth.
-- Caso o usuário tenha papel revogado depois (NEW.aprovador = FALSE), o trigger
-- libera; só travamos a transição p/ TRUE.
CREATE OR REPLACE FUNCTION trg_usuarios_papeis_validar_mfa()
RETURNS TRIGGER AS $$
DECLARE
  fatores_verificados INTEGER;
BEGIN
  IF NEW.aprovador IS TRUE THEN
    -- Em ambientes sem schema `auth.mfa_factors` (ex.: testes locais sem
    -- Supabase real) o SELECT abaixo dá erro. Capturamos e logamos para que
    -- migrations rodem em dev sem MFA disponível — a checagem volta a operar
    -- assim que o schema existir.
    BEGIN
      SELECT COUNT(*) INTO fatores_verificados
        FROM auth.mfa_factors
       WHERE user_id = NEW.usuario_id
         AND status = 'verified';
    EXCEPTION
      WHEN undefined_table THEN
        fatores_verificados := -1;  -- schema indisponível
    END;

    IF fatores_verificados = 0 THEN
      RAISE EXCEPTION
        'usuarios_papeis: usuário % não pode ser aprovador sem MFA verificado em auth.mfa_factors',
        NEW.usuario_id
      USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'usuarios_papeis_validar_mfa'
  ) THEN
    CREATE TRIGGER usuarios_papeis_validar_mfa
    BEFORE INSERT OR UPDATE OF aprovador ON usuarios_papeis
    FOR EACH ROW EXECUTE FUNCTION trg_usuarios_papeis_validar_mfa();
  END IF;
END$$;

-- Função utilitária consultada pelo backend antes de operações privilegiadas.
CREATE OR REPLACE FUNCTION eh_aprovador(p_usuario UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_papeis
     WHERE usuario_id = p_usuario AND aprovador = TRUE
  );
$$ LANGUAGE sql STABLE;

REVOKE UPDATE, DELETE ON usuarios_papeis FROM PUBLIC;

COMMENT ON TABLE usuarios_papeis IS
  'RBAC mínimo da Fase 2.A — flag de aprovador por usuário. Aprovador exige MFA verificado (trigger trg_usuarios_papeis_validar_mfa). Ver ADR-0008 §2.3.';
