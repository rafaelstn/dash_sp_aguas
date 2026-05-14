"""
Promove um usuario a aprovador em usuarios_papeis.

Comportamento padrao: o trigger trg_usuarios_papeis_validar_mfa
(migration 0023) bloqueia INSERT/UPDATE de aprovador=TRUE sem MFA
verificado em auth.mfa_factors. Isso eh defesa em profundidade da
regra governo.md.

Bypass de homologacao (ADR-0009): se a env MFA_OPCIONAL_HOMOLOGACAO=true
estiver setada localmente, o script desabilita o trigger durante a
transacao e reabilita ao final. O trigger permanece definido no
esquema; apenas a operacao do script o ignora.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/promover_aprovador.py <email>
"""

import os
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


def mfa_opcional() -> bool:
    env = Path(".env.local").read_text(encoding="utf-8")
    if re.search(r"^MFA_OPCIONAL_HOMOLOGACAO\s*=\s*true\s*$", env, re.MULTILINE):
        return True
    return os.environ.get("MFA_OPCIONAL_HOMOLOGACAO", "").strip().lower() == "true"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("uso: promover_aprovador.py <email>")
    email = sys.argv[1].strip().lower()

    url = carregar_database_url()
    bypass = mfa_opcional()

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
        print(f"MFA_OPCIONAL_HOMOLOGACAO: {bypass}")

        if bypass and mfa == 0:
            print("AVISO: ADR-0009 ativo. Desabilitando trigger temporariamente.")
            cur.execute(
                "ALTER TABLE usuarios_papeis DISABLE TRIGGER usuarios_papeis_validar_mfa"
            )

        try:
            cur.execute(
                """
                INSERT INTO usuarios_papeis (usuario_id, aprovador, mfa_obrigatorio, observacao)
                VALUES (%s, TRUE, %s, %s)
                ON CONFLICT (usuario_id) DO UPDATE
                  SET aprovador = TRUE, mfa_obrigatorio = EXCLUDED.mfa_obrigatorio
                """,
                (
                    usuario_id,
                    not bypass,
                    "promovido via script (homologacao - ADR-0009)" if bypass
                    else "promovido via script (MFA obrigatorio)",
                ),
            )
        finally:
            if bypass and mfa == 0:
                cur.execute(
                    "ALTER TABLE usuarios_papeis ENABLE TRIGGER usuarios_papeis_validar_mfa"
                )

        conn.commit()
        print("OK: papel aprovador gravado")


if __name__ == "__main__":
    main()
