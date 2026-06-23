# Worker de indexação do HD de rede (sweep batch) → PostgreSQL.
# Contexto de build: ./ops/indexer (definido no docker-compose.yml).
#
# index_fs.py usa imports relativos (from .classificador), então roda como
# módulo: `python -m ops.indexer.index_fs`. Por isso os fontes são copiados
# para ./ops/indexer/ e o WORKDIR é /app (namespace package ops.indexer).
#
# A raiz varrida (INDEXER_ROOT_PATH) entra por volume read-only — no PRODESP
# será o mount do compartilhamento de rede; em dev, um diretório local.
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Deps do indexer (psycopg, dotenv, structlog + unidecode/openpyxl da engine
# de classificação). Camada cacheável separada do código.
RUN pip install --no-cache-dir \
    "psycopg[binary]>=3.2" \
    "python-dotenv>=1.0" \
    "structlog>=24.0" \
    "unidecode>=1.3" \
    "openpyxl>=3.1"

COPY . ./ops/indexer/

RUN useradd --system --uid 1001 indexer && chown -R indexer:indexer /app
USER indexer

# Default: sweep completo lendo INDEXER_ROOT_PATH do ambiente.
# Use `command: ["--dry-run"]` no compose para simular sem escrever.
ENTRYPOINT ["python", "-m", "ops.indexer.index_fs"]
