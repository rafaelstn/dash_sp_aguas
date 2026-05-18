"""
Diagnostico do vazamento reportado: Rafael viu na home 'Vistos recentemente'
um posto que a Adayana visualizou.

Verifica:
  1) Se ha registro em acesso_ficha com usuario_id=NULL (caso pre-auth).
  2) Distribuicao por usuario nos ultimos 30 dias.
  3) Se ha registros recentes do Rafael cujo prefixo coincide com algum
     que SO a Adayana visualizou (sinal de gravacao com id errado).

Rodar:
    ops/indexer/.venv/Scripts/python.exe scripts/diag_acesso_ficha_cross_user.py
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
            SELECT u.id, u.email
              FROM auth.users u
             WHERE u.email IN ('cebiinformatica@gmail.com',
                               'adayana.melo@spaguas.sp.gov.br')
            """
        )
        ids = dict((email, str(uid)) for uid, email in cur.fetchall())
        print("usuarios alvo:")
        for email, uid in ids.items():
            print(f"  {email:40}  {uid}")
        print()

        cur.execute(
            """
            SELECT
              COUNT(*) FILTER (WHERE usuario_id IS NULL) AS nulos,
              COUNT(*) FILTER (WHERE usuario_id IS NOT NULL) AS preenchidos,
              COUNT(*) AS total
            FROM acesso_ficha
            """
        )
        nulos, preench, total = cur.fetchone()
        print(f"acesso_ficha total       : {total}")
        print(f"  com usuario_id         : {preench}")
        print(f"  com usuario_id NULL    : {nulos}")
        print()

        cur.execute(
            """
            SELECT usuario_id, COUNT(*) AS qtd, MIN(ocorreu_em), MAX(ocorreu_em)
              FROM acesso_ficha
             WHERE ocorreu_em > NOW() - INTERVAL '30 days'
               AND acao = 'visualizou_ficha'
             GROUP BY usuario_id
             ORDER BY qtd DESC
             LIMIT 20
            """
        )
        print("ultimos 30 dias por usuario:")
        print(f"{'usuario_id':40}  qtd  primeiro                    ultimo")
        for uid, qtd, prim, ult in cur.fetchall():
            print(f"  {str(uid or 'NULL'):40}  {qtd:4}  {prim}  {ult}")
        print()

        rafael = ids.get("cebiinformatica@gmail.com")
        adayana = ids.get("adayana.melo@spaguas.sp.gov.br")
        if rafael and adayana:
            cur.execute(
                """
                WITH acessos_rafael AS (
                  SELECT prefixo, MAX(ocorreu_em) AS ult
                    FROM acesso_ficha
                   WHERE usuario_id = %s
                     AND acao = 'visualizou_ficha'
                   GROUP BY prefixo
                ),
                acessos_adayana AS (
                  SELECT prefixo, MAX(ocorreu_em) AS ult
                    FROM acesso_ficha
                   WHERE usuario_id = %s
                     AND acao = 'visualizou_ficha'
                   GROUP BY prefixo
                )
                SELECT prefixo, ult FROM acessos_rafael
                ORDER BY ult DESC LIMIT 15
                """,
                (rafael, adayana),
            )
            print("ultimos 15 acessos do Rafael (cebiinformatica) na tabela:")
            for prefixo, ult in cur.fetchall():
                print(f"  {prefixo:14}  {ult}")
            print()

            cur.execute(
                """
                SELECT prefixo, MAX(ocorreu_em) AS ult
                  FROM acesso_ficha
                 WHERE usuario_id = %s
                   AND acao = 'visualizou_ficha'
                 GROUP BY prefixo
                 ORDER BY ult DESC LIMIT 15
                """,
                (adayana,),
            )
            print("ultimos 15 acessos da Adayana na tabela:")
            for prefixo, ult in cur.fetchall():
                print(f"  {prefixo:14}  {ult}")


if __name__ == "__main__":
    main()
