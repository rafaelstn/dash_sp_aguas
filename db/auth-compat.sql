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
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  raw_user_meta_data  jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- raw_user_meta_data: a coluna existe para a consulta de identidade NÃO
-- ESTOURAR. Medido em 05/10/2026: `usuarios-identidade-repository.pg.ts` lê
-- `u.raw_user_meta_data->>'nome'` (é de lá que sai o nome do operador na trilha
-- e na planilha do Estoque), o GoTrue do Supabase tem essa coluna e este shim
-- não tinha, então no Postgres puro a consulta levantava 42703
-- undefined_column, o `resolverOperadores` caía no ramo degradado e as duas
-- telas mostravam o id cru ou o e-mail. O ramo degradado está correto; o que
-- estava errado era o schema embaixo dele.
--
-- O CONTEÚDO real vem da camada de identidade definitiva (GoTrue self-hosted ou
-- auth própria, ADR-0015 e ADR-0006). Até ela existir o objeto fica em `{}`, o
-- nome resolve VAZIO e o código cai para o e-mail por desenho, e não por falha.
--
-- O ALTER abaixo alcança o banco que já subiu com a versão anterior deste
-- arquivo, onde a tabela existe sem a coluna e o CREATE TABLE IF NOT EXISTS não
-- faz nada. Este arquivo nunca roda contra o Supabase gerenciado (lá o GoTrue é
-- dono de auth.users e já tem a coluna); é o shim do self-hosted, e o GRANT no
-- fim do arquivo já assume essa propriedade.
--
-- NÃO MEDIDO contra banco de pé: a bancada de 06/10/2026 não tem Docker nem
-- psql (decisão do Rafael de 01/10/2026). Quem mede é o job `integracao` do CI,
-- em tests/integration/auth-compat-identidade-postgres.test.ts, que pergunta a
-- coluna ao information_schema e faz a MESMA consulta do repositório de
-- identidade contra a tabela real.
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN auth.users.raw_user_meta_data IS
  'Metadados do usuário no formato do GoTrue (Supabase). Existe neste shim para a consulta de identidade não estourar com 42703; o conteúdo real vem da camada de identidade definitiva. Enquanto for {}, o nome resolve vazio e o código cai para o e-mail por desenho.';

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
