"""
Diagnostico ad-hoc: lista usuarios e papeis no banco.
Saida formato tabela pra triagem manual antes de promover aprovador.

Rodar:
    ops/indexer/.venv/Scripts/python.exe scripts/diag_usuarios.py
"""

import re
from pathlib import Path

import psycopg


def carregar_database_url() -> str:
    env = Path(".env.local").read_text(encoding="utf-8")
    match = re.search(r"^DATABASE_URL\s*=\s*(.+)$", env, re.MULTILINE)
    if not match:
        raise SystemExit("DATABASE_URL ausente em .env.local")
    return match.group(1).strip().strip('"').strip("'")


def main() -> None:
    url = carregar_database_url()
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                u.id,
                u.email,
                u.raw_user_meta_data ->> 'nome' AS nome,
                u.created_at,
                COALESCE(p.aprovador, FALSE) AS aprovador
            FROM auth.users u
            LEFT JOIN usuarios_papeis p ON p.usuario_id = u.id
            ORDER BY u.created_at ASC
            """
        )
        linhas = cur.fetchall()

        print(f"Total usuarios: {len(linhas)}")
        print()
        print(f"{'id':36}  {'email':40}  {'nome':30}  apr")
        print("-" * 115)
        for usuario_id, email, nome, _criado, apr in linhas:
            print(
                f"{str(usuario_id):36}  "
                f"{(email or '')[:40]:40}  "
                f"{(nome or '')[:30]:30}  "
                f"{'sim' if apr else '---'}"
            )

        print()
        cur.execute(
            "SELECT COUNT(*), MIN(criado_em), MAX(criado_em) FROM fichas_triagem"
        )
        total, primeiro, ultimo = cur.fetchone()
        print(f"fichas_triagem: {total} registros  primeiro={primeiro}  ultimo={ultimo}")

        cur.execute(
            "SELECT estado, COUNT(*) FROM fichas_triagem GROUP BY estado ORDER BY 1"
        )
        for estado, qtd in cur.fetchall():
            print(f"  estado={estado:14} qtd={qtd}")


if __name__ == "__main__":
    main()
