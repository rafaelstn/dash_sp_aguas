#!/usr/bin/env sh
# =============================================================================
# Aplica o schema completo num PostgreSQL conteinerizado, em ordem:
#   1) db/auth-compat.sql  — shim de compatibilidade Supabase (schema auth etc.)
#   2) supabase/migrations/*.sql  — migrations numeradas, em ordem alfabética
#
# Usado pelo serviço `migrate` dos DOIS composes, e essa distinção importa: o
# docker-compose.yml (avaliação) define DATABASE_URL, e o docker-compose.prod.yml
# (servidor do órgão) lê /etc/spaguas-dmo/db.env, que traz só POSTGRES_DB,
# POSTGRES_USER e POSTGRES_PASSWORD. Até 23/09/2026 esta linha citava apenas o
# compose de avaliação, e quem lesse só o cabeçalho concluiria que produção passa
# por DATABASE_URL. Idempotente: as migrations são majoritariamente
# IF NOT EXISTS / CREATE OR REPLACE, então re-rodar é seguro.
#
# Conexão: usa $DATABASE_URL se definido; senão vai pelas PG*, e nesse caminho
# RECUSA sem POSTGRES_PASSWORD em vez de adivinhar credencial.
# =============================================================================
set -eu

# A SENHA NÃO ENTRA NA LINHA DE COMANDO DO psql. Sintoma medido em 23/09/2026:
# este script montava a URI com a senha embutida e a passava como argumento, uma
# vez para o shim e uma vez por migration, então a credencial do banco do órgão
# ficava legível em `ps` e em `docker top`, para qualquer processo do host, o
# tempo todo em que o container rodasse. O caminho das PG* é o de PRODUÇÃO: o
# serviço `migrate` de docker-compose.prod.yml lê /etc/spaguas-dmo/db.env, cujo
# modelo (ops/producao/banco.exemplo) declara POSTGRES_DB, POSTGRES_USER e
# POSTGRES_PASSWORD, e nenhuma DATABASE_URL.
#
# A forma nova (-h/-p/-U/-d mais PGPASSWORD) é a mesma já exercitada contra o
# banco do órgão na conferência (i) do runbook de entrega, em 16/09/2026.
# PGPASSWORD não acrescenta exposição: a senha já está no ambiente do container,
# vinda do env_file, e ambiente só é legível pelo mesmo uid e pelo root, ao
# contrário de argv, que é legível por qualquer um.
#
# O controle que separa argv de comportamento: com DATABASE_URL definida, que é
# o caminho do compose de avaliação, o argv entregue ao psql continua byte a
# byte o de antes.
#
# O QUE NÃO FOI MEDIDO: nenhuma migration foi aplicada contra um PostgreSQL de
# pé nesta alteração (limite de disco na bancada em 23/09/2026). Foi medido, na
# imagem construída, que o psql 16.4 aceita a forma nova (falha de conexão,
# código 2, e não de parse, código 1, que é como o controle negativo falha) e
# que a ordem dos arquivos, o ON_ERROR_STOP e o argv dos dois caminhos são os
# esperados, por régua com um psql de mentira que registra argumento e ambiente.
if [ -n "${DATABASE_URL:-}" ]; then
  set -- "$DATABASE_URL"
else
  # Recusar em vez de adivinhar: o `:-spaguas` que existia aqui era credencial
  # fraca embutida no script, que só acertaria por acidente e, quando errasse,
  # erraria no servidor do órgão.
  : "${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD, ou DATABASE_URL, para o migrate}"
  PGPASSWORD="$POSTGRES_PASSWORD"
  export PGPASSWORD
  set -- -h "${PGHOST:-db}" -p 5432 -U "${POSTGRES_USER:-spaguas}" -d "${POSTGRES_DB:-spaguas}"
fi

echo "[migrate] aplicando shim de compatibilidade Supabase..."
psql "$@" -v ON_ERROR_STOP=1 -f /db/auth-compat.sql

echo "[migrate] aplicando migrations..."
for arquivo in $(ls /migrations/*.sql | sort); do
  echo "[migrate]   -> $(basename "$arquivo")"
  psql "$@" -v ON_ERROR_STOP=1 -f "$arquivo"
done

echo "[migrate] concluído."
