#!/usr/bin/env bash
# Validação rápida de .env.local, checagem de conexão com PG e start do next dev.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." &> /dev/null && pwd)"

if [ ! -f "$PROJECT_ROOT/.env.local" ]; then
  echo "erro: .env.local inexistente. Copie de .env.example e preencha." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -o allexport
. "$PROJECT_ROOT/.env.local"
set +o allexport

if [ -z "${DATABASE_URL:-}" ]; then
  echo "erro: DATABASE_URL não definida em .env.local" >&2
  exit 1
fi

if command -v psql >/dev/null 2>&1; then
  echo "Checando conexão com PostgreSQL..."
  if ! psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
    echo "aviso: falha ao conectar em DATABASE_URL. O next dev vai subir mesmo assim." >&2
  else
    echo "Conexão com PG OK."
  fi
else
  echo "psql não instalado localmente; pulando checagem de conexão."
fi

cd "$PROJECT_ROOT"
exec npm run dev
