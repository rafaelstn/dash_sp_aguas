"""
Promove um usuario a aprovador em usuarios_papeis.

ATENCAO: o trigger trg_usuarios_papeis_validar_mfa (migration 0023)
bloqueia o INSERT/UPDATE se nao houver MFA verificado em auth.mfa_factors.
Esse comportamento eh proposital (defesa em profundidade, governo.md).

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

        cur.execute(
            """
            SELECT COUNT(*) FROM auth.mfa_factors
             WHERE user_id = %s AND status = 'verified'
            """,
            (usuario_id,),
        )
        mfa = cur.fetchone()[0]
        print(f"usuario: {email} ({usuario_id})")
        print(f"MFA verificados: {mfa}")

        try:
            cur.execute(
                """
                INSERT INTO usuarios_papeis (usuario_id, aprovador, mfa_obrigatorio, observacao)
                VALUES (%s, TRUE, TRUE, 'promovido via script (Sprint 2.A teste)')
                ON CONFLICT (usuario_id) DO UPDATE
                  SET aprovador = TRUE, mfa_obrigatorio = TRUE
                """,
                (usuario_id,),
            )
            conn.commit()
            print("OK: papel aprovador gravado (commit)")
        except psycopg.errors.RaiseException as e:
            conn.rollback()
            print(f"BLOQUEADO PELO TRIGGER: {e}")
            print()
            print("Acao necessaria: o usuario precisa configurar MFA TOTP em")
            print("  https://dash-sp-aguas.vercel.app/perfil/mfa")
            print("antes que o script consiga promove-lo a aprovador.")
            sys.exit(2)


if __name__ == "__main__":
    main()
