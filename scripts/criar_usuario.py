"""
Cria um usuario via Supabase Admin API e, opcionalmente, promove a aprovador.

Login fica em email + senha apenas (ADR-0010, MFA removido). Controle de acesso
por flag `aprovador` em `usuarios_papeis`, que e o papel maximo do sistema.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/criar_usuario.py <email> <senha> [--aprovador] [--nome "Nome Completo"]

Requer em .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.
"""

import argparse
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

import psycopg


def carregar_env() -> dict[str, str]:
    env_texto = Path(".env.local").read_text(encoding="utf-8")
    chaves = (
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "DATABASE_URL",
    )
    valores: dict[str, str] = {}
    for chave in chaves:
        match = re.search(rf"^{chave}\s*=\s*(.+)$", env_texto, re.MULTILINE)
        if not match:
            raise SystemExit(f"{chave} ausente em .env.local")
        valores[chave] = match.group(1).strip().strip('"').strip("'")
    return valores


def criar_usuario_admin(url_base: str, service_key: str, email: str, senha: str, nome: str | None) -> str:
    payload: dict[str, object] = {
        "email": email,
        "password": senha,
        "email_confirm": True,
    }
    if nome:
        payload["user_metadata"] = {"nome": nome}

    req = urllib.request.Request(
        url=f"{url_base.rstrip('/')}/auth/v1/admin/users",
        method="POST",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload).encode("utf-8"),
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            corpo = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detalhe = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"falha ao criar usuario ({err.code}): {detalhe}") from err

    usuario_id = corpo.get("id")
    if not usuario_id:
        raise SystemExit(f"resposta inesperada da Admin API: {corpo}")
    return usuario_id


def promover_aprovador(database_url: str, usuario_id: str, email: str) -> None:
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO usuarios_papeis (usuario_id, aprovador, observacao)
            VALUES (%s, TRUE, %s)
            ON CONFLICT (usuario_id) DO UPDATE
              SET aprovador = TRUE
            """,
            (usuario_id, f"criado via criar_usuario.py ({email})"),
        )
        conn.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Cria usuario no Supabase Auth")
    parser.add_argument("email")
    parser.add_argument("senha")
    parser.add_argument("--aprovador", action="store_true", help="promove a aprovador (acesso total)")
    parser.add_argument("--nome", default=None, help="nome completo gravado em user_metadata.nome")
    args = parser.parse_args()

    email = args.email.strip().lower()
    env = carregar_env()

    usuario_id = criar_usuario_admin(
        url_base=env["NEXT_PUBLIC_SUPABASE_URL"],
        service_key=env["SUPABASE_SERVICE_ROLE_KEY"],
        email=email,
        senha=args.senha,
        nome=args.nome,
    )
    print(f"OK: usuario criado {email} ({usuario_id})")

    if args.aprovador:
        promover_aprovador(env["DATABASE_URL"], usuario_id, email)
        print("OK: papel aprovador gravado")


if __name__ == "__main__":
    main()
