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
  # A senha não entra no argv do psql. Sintoma medido em 23/09/2026: esta
  # checagem passava a DATABASE_URL inteira como argumento, então a senha ficava
  # legível em `ps` durante a conexão. Quem separa é scripts/db/conexao-psql.sh,
  # o mesmo componente de scripts/db/db-migrate.sh.
  #
  # A recusa do componente não derruba o `next dev`: aqui ela vale o mesmo aviso
  # de antes, porque esta checagem sempre foi informativa.
  # shellcheck source=scripts/db/conexao-psql.sh
  . "$SCRIPT_DIR/db/conexao-psql.sh"
  if ! preparar_conexao_psql "$DATABASE_URL"; then
    echo "aviso: checagem de conexão pulada; o next dev vai subir mesmo assim." >&2
  elif ! psql "${PSQL_CONEXAO[@]}" -c "SELECT 1;" >/dev/null 2>&1; then
    echo "aviso: falha ao conectar em DATABASE_URL. O next dev vai subir mesmo assim." >&2
  else
    echo "Conexão com PG OK."
  fi
else
  echo "psql não instalado localmente; pulando checagem de conexão."
fi

cd "$PROJECT_ROOT"
exec npm run dev
