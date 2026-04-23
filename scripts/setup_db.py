"""Orquestra setup idempotente do banco (chamado pelo start.ps1).

Verifica:
  1. Conectividade com DATABASE_URL.
  2. Schema criado (tabela `postos` existe). Se não: aplica todas as migrations.
  3. Dados carregados (postos > 0). Se não: executa o importer do CSV oficial.

Reexecuções sobre base já completa: detecta e pula, imprime resumo. Exit 0.
Falhas parciais: imprime erro e retorna exit 2.

Uso (a partir da raiz do projeto):
  python scripts/setup_db.py
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
MIGRATIONS_SCRIPT = ROOT / "scripts" / "apply_migrations.py"
IMPORTER_SCRIPT = ROOT / "ops" / "importer" / "import_csv.py"


def log(msg: str) -> None:
    print(msg, flush=True)


def tabela_postos_existe(conn: psycopg.Connection) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'postos'
            """
        )
        return cur.fetchone() is not None


def contar_postos(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM postos")
        return int(cur.fetchone()[0])


def rodar(script: Path, *args: str) -> int:
    """Executa um script Python filho usando o mesmo interpretador atual."""
    cmd = [sys.executable, str(script), *args]
    log(f"  $ {' '.join(cmd)}")
    resultado = subprocess.run(cmd, cwd=ROOT)
    return resultado.returncode


def main() -> int:
    load_dotenv(ENV_PATH)
    url = os.environ.get("DATABASE_URL")
    if not url:
        log("[setup] DATABASE_URL ausente — pulando setup de banco (modo demo).")
        return 0

    try:
        with psycopg.connect(url, connect_timeout=10) as conn:
            if not tabela_postos_existe(conn):
                log("[setup] Schema não encontrado. Aplicando 19 migrations...")
                rc = rodar(MIGRATIONS_SCRIPT)
                if rc != 0:
                    log("[setup] Falha ao aplicar migrations.")
                    return 2
                log("[setup] Migrations aplicadas.")
            else:
                log("[setup] Schema já existe. Pulando migrations.")

        with psycopg.connect(url, connect_timeout=10) as conn:
            total = contar_postos(conn)
            if total == 0:
                log("[setup] Tabela postos vazia. Executando importer do CSV...")
                rc = rodar(IMPORTER_SCRIPT)
                if rc == 2:
                    log(
                        "[setup] Importer abortou por prefixo duplicado. "
                        "Corrija o CSV (ver import_log) e rode novamente."
                    )
                    return 2
                if rc != 0:
                    log(f"[setup] Importer falhou (exit {rc}).")
                    return 2
                with psycopg.connect(url, connect_timeout=10) as c2:
                    total = contar_postos(c2)
                log(f"[setup] Importer carregou {total} postos.")
            else:
                log(f"[setup] Postos já carregados ({total}). Pulando importer.")

        log("[setup] Banco pronto.")
        return 0
    except psycopg.Error as e:
        log(f"[setup] Falha conectando/consultando o banco: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
