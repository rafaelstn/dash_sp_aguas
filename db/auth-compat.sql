-- =============================================================================
-- Shim de compatibilidade Supabase → PostgreSQL puro (self-hosted / PRODESP)
-- =============================================================================
-- As migrations em supabase/migrations/ assumem objetos que o Supabase provê
-- por padrão: o schema `auth`, a tabela `auth.users`, a função `auth.uid()` e
-- os roles `anon` / `authenticated` / `service_role`. Num PostgreSQL puro esses
-- objetos não existem e as migrations falham (FK para auth.users, RLS com
-- auth.uid(), GRANT para os roles).
--
-- Este arquivo recria o MÍNIMO necessário para o schema da aplicação subir num
-- Postgres puro conteinerizado. NÃO é uma implementação de autenticação — é uma
-- casca. Na entrega PRODESP, este é o ponto único a substituir pela camada de
-- identidade real (GoTrue self-hosted ou auth própria). Ver ADR-0015 e ADR-0006.
--
-- Idempotente: pode ser re-executado sem erro.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Roles esperados pelo Supabase (sem login — apenas alvos de GRANT/RLS).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Schema auth + stub de auth.users.
-- A app conecta como role de serviço e faz queries diretas; auth.users existe
-- aqui só para satisfazer as FKs. O preenchimento real virá da camada de
-- identidade definitiva no PRODESP.
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- auth.uid(): no Supabase lê o claim `sub` do JWT injetado pelo PostgREST.
-- Sem PostgREST, lê a GUC `request.jwt.claim.sub` se setada, senão NULL.
-- As policies RLS que usam auth.uid() são defesa em profundidade (migration
-- 0040); a app não depende delas em runtime (conecta com role privilegiada).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.uid()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $$
    SELECT NULLIF(
      current_setting('request.jwt.claim.sub', true),
      ''
    )::uuid;
  $$;

-- ----------------------------------------------------------------------------
-- auth.role(): no Supabase devolve o role do JWT ('anon' | 'authenticated' |
-- 'service_role'). Usada pelas policies da migration 0042 (postos_fotos). Sem
-- ela, `db/migrate.sh` aborta em 0042 e o deploy conteinerizado nunca completa
-- o schema. Sem PostgREST, lê a GUC `request.jwt.claim.role`; na ausência dela
-- cai para o role efetivo da conexão, o que mantém a policy fail-closed (a app
-- conecta com role privilegiada e não depende de RLS em runtime).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.role()
  RETURNS text
  LANGUAGE sql
  STABLE
  AS $$
    SELECT COALESCE(
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      current_user
    );
  $$;

-- ----------------------------------------------------------------------------
-- auth.jwt(): stub para policies que leem claims arbitrários. Devolve o JSON da
-- GUC `request.jwt.claims` quando existir, senão objeto vazio (nunca NULL, para
-- não quebrar `->>` nas policies).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.jwt()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  AS $$
    SELECT COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
      '{}'::jsonb
    );
  $$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt() TO anon, authenticated, service_role;
