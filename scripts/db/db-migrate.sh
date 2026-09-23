#!/usr/bin/env bash
# Aplica as migrations SQL em ordem contra um banco de DESENVOLVIMENTO.
# Uso:
#   scripts/db/db-migrate.sh [connection_string]
# Sem argumento usa $DATABASE_URL (do ambiente ou do .env.local). Também aceita
# PGHOST/PGUSER/PGDATABASE mais POSTGRES_PASSWORD, sem connection string.
#
# A SENHA NÃO ENTRA NA LINHA DE COMANDO DO psql. Sintoma medido em 23/09/2026:
# este script passava a string de conexão inteira como argumento, uma vez por
# migration, então a senha ficava legível em `ps` para qualquer processo da
# máquina enquanto ele rodava. Quem separa a senha da string é
# scripts/db/conexao-psql.sh, o mesmo componente que scripts/dev.sh usa, para a
# classe não voltar script por script.
#
# O controle que separa argv de comportamento: a ordem dos arquivos, o
# ON_ERROR_STOP e a quantidade de chamadas continuam os mesmos; o que muda é que
# a senha viaja em PGPASSWORD e o argv leva a URI sem ela.
#
# O QUE NÃO FOI MEDIDO: nenhuma migration foi aplicada contra um PostgreSQL de pé
# nesta alteração (limite de disco na bancada em 23/09/2026). O que foi medido
# está em ops/testing/regua-psql, com um psql de mentira que registra argumento e
# ambiente.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." &> /dev/null && pwd)"
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

if ! command -v psql >/dev/null 2>&1; then
  echo "erro: psql não encontrado no PATH" >&2
  exit 1
fi

# shellcheck source=scripts/db/conexao-psql.sh
. "$SCRIPT_DIR/conexao-psql.sh"
preparar_conexao_psql "$CONN"

echo "Aplicando migrations em $MIGRATIONS_DIR..."
for arquivo in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "  -> $(basename "$arquivo")"
  psql "${PSQL_CONEXAO[@]}" -v ON_ERROR_STOP=1 -f "$arquivo"
done
echo "Migrations aplicadas."
