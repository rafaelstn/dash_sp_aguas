#!/usr/bin/env sh
# =============================================================================
# Aplica o schema completo num PostgreSQL conteinerizado, em ordem:
#   1) db/auth-compat.sql  — shim de compatibilidade Supabase (schema auth etc.)
#   2) supabase/migrations/*.sql  — migrations numeradas, em ordem alfabética
#
# Usado pelo serviço `migrate` do docker-compose.yml. Idempotente: as migrations
# são majoritariamente IF NOT EXISTS / CREATE OR REPLACE, então re-rodar é seguro.
#
# Conexão: usa $DATABASE_URL se definido; senão monta a partir das PG* padrão.
# =============================================================================
set -eu

CONN="${DATABASE_URL:-postgresql://${POSTGRES_USER:-spaguas}:${POSTGRES_PASSWORD:-spaguas}@${PGHOST:-db}:5432/${POSTGRES_DB:-spaguas}}"

echo "[migrate] aplicando shim de compatibilidade Supabase..."
psql "$CONN" -v ON_ERROR_STOP=1 -f /db/auth-compat.sql

echo "[migrate] aplicando migrations..."
for arquivo in $(ls /migrations/*.sql | sort); do
  echo "[migrate]   -> $(basename "$arquivo")"
  psql "$CONN" -v ON_ERROR_STOP=1 -f "$arquivo"
done

echo "[migrate] concluído."
