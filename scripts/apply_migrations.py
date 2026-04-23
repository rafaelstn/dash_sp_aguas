"""Aplica as migrations SQL em ordem no DATABASE_URL (usado pelo start.ps1).

Uso (a partir da raiz do projeto, com venv do indexer ativado):
  python scripts/apply_migrations.py [--only 0019]
  python scripts/apply_migrations.py --since 0016

Lê DATABASE_URL do .env.local. Idempotente: cada migration já usa IF NOT EXISTS
e blocos DO $$ pra suportar reexecução. Se uma migration pesada falhar por
timeout do pooler Supabase sobre base já populada, use --only pra aplicar
só a nova.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
ENV_PATH = ROOT / ".env.local"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only",
        default=None,
        help="Aplica apenas a migration cujo nome começa com este prefixo (ex.: '0019').",
    )
    parser.add_argument(
        "--since",
        default=None,
        help="Aplica migrations cujo número seja >= este prefixo (ex.: '0016').",
    )
    args = parser.parse_args()

    load_dotenv(ENV_PATH)
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("erro: DATABASE_URL ausente no .env.local", file=sys.stderr)
        return 1

    todas = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not todas:
        print(f"erro: nenhuma migration em {MIGRATIONS_DIR}", file=sys.stderr)
        return 1

    if args.only:
        arquivos = [a for a in todas if a.name.startswith(args.only)]
    elif args.since:
        arquivos = [a for a in todas if a.name >= args.since]
    else:
        arquivos = todas

    if not arquivos:
        print("nada a aplicar (filtro não encontrou nenhuma migration)")
        return 0

    print(f"aplicando {len(arquivos)} migration(s)...", flush=True)

    with psycopg.connect(url, autocommit=True) as conn:
        for arq in arquivos:
            sql = arq.read_text(encoding="utf-8")
            print(f"  -> {arq.name}", flush=True)
            try:
                with conn.cursor() as cur:
                    cur.execute(sql)
            except psycopg.Error as e:
                print(f"\nFALHA em {arq.name}: {e}", file=sys.stderr)
                return 2

    print("\nOK — todas aplicadas", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
