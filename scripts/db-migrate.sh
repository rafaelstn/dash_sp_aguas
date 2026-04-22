#!/usr/bin/env bash
# Aplica as migrations SQL contra $DATABASE_URL (ou a string passada como argumento).
# Uso: scripts/db-migrate.sh [connection_string]
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." &> /dev/null && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/supabase/migrations"

CONN="${1:-${DATABASE_URL:-}}"
if [ -z "$CONN" ]; then
  if [ -f "$PROJECT_ROOT/.env.local" ]; then
    # shellcheck disable=SC1091
    set -o allexport
    . "$PROJECT_ROOT/.env.local"
    set +o allexport
    CONN="${DATABASE_URL:-}"
  fi
fi

if [ -z "$CONN" ]; then
  echo "erro: defina DATABASE_URL no .env.local ou passe como argumento" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "erro: psql não encontrado no PATH" >&2
  exit 1
fi

echo "Aplicando migrations em $MIGRATIONS_DIR..."
for arquivo in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "  -> $(basename "$arquivo")"
  psql "$CONN" -v ON_ERROR_STOP=1 -f "$arquivo"
done
echo "Migrations aplicadas."
