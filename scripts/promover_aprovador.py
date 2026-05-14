"""
Promove um usuario a aprovador em usuarios_papeis.

Apos a migration 0028 (ADR-0010), nao ha mais trigger de validacao de MFA
nem coluna `mfa_obrigatorio`. Login fica em email + senha apenas, controle
de acesso por flag `aprovador` na tabela `usuarios_papeis`.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/promover_aprovador.py <email>
"""

import re
import sys
from pathlib import Path

import psycopg


def carregar_database_url() -> str:
    env = Path(".env.local").read_text(encoding="utf-8")
    match = re.search(r"^DATABASE_URL\s*=\s*(.+)$", env, re.MULTILINE)
    if not match:
        raise SystemExit("DATABASE_URL ausente em .env.local")
    return match.group(1).strip().strip('"').strip("'")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("uso: promover_aprovador.py <email>")
    email = sys.argv[1].strip().lower()

    url = carregar_database_url()

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM auth.users WHERE LOWER(email) = %s",
            (email,),
        )
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"usuario nao encontrado: {email}")
        usuario_id = row[0]

        print(f"usuario: {email} ({usuario_id})")

        cur.execute(
            """
            INSERT INTO usuarios_papeis (usuario_id, aprovador, observacao)
            VALUES (%s, TRUE, 'promovido via script')
            ON CONFLICT (usuario_id) DO UPDATE
              SET aprovador = TRUE
            """,
            (usuario_id,),
        )
        conn.commit()
        print("OK: papel aprovador gravado")


if __name__ == "__main__":
    main()
