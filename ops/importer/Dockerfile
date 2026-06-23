# Worker one-shot de importação do CSV oficial → PostgreSQL.
# Contexto de build: ./ops/importer (definido no docker-compose.yml).
# Execução é batch/sob demanda (profile "ops"); não é serviço de longa duração.
#
# O CSV oficial entra por volume (IMPORTER_CSV_PATH) — nunca embutido na imagem.
FROM python:3.12-slim AS base

# Sem bytecode em disco e stdout sem buffer (logs imediatos no docker logs).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Deps explícitas (psycopg[binary] traz o libpq, dispensa apt). Camada cacheável.
RUN pip install --no-cache-dir \
    "psycopg[binary]>=3.2" \
    "python-dotenv>=1.0" \
    "structlog>=24.0"

COPY . ./

# Usuário sem privilégio.
RUN useradd --system --uid 1001 importer && chown -R importer:importer /app
USER importer

# One-shot: lê DATABASE_URL_IMPORTER e IMPORTER_CSV_PATH do ambiente.
# Flags extras (--dry-run etc) podem ser passadas via `command:` no compose.
ENTRYPOINT ["python", "import_csv.py"]
