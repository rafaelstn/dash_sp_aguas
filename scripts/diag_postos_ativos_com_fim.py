"""
Diagnostico ad-hoc: lista postos com status_pcd ATIVO que possuem operacao_fim_ano preenchido.
Inconsistencia: se PCD esta ativo nao deveria haver ano de fim de operacao.

Rodar:
    ops/indexer/.venv/Scripts/python.exe scripts/diag_postos_ativos_com_fim.py
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
                COUNT(*) FILTER (WHERE status_pcd IS NOT NULL),
                COUNT(*) FILTER (WHERE UPPER(TRIM(status_pcd)) = 'ATIVO'),
                COUNT(*) FILTER (
                    WHERE UPPER(TRIM(status_pcd)) = 'ATIVO'
                      AND operacao_fim_ano IS NOT NULL
                )
            FROM postos
            """
        )
        com_status, ativos, ativos_com_fim = cur.fetchone()
        print(f"postos com status_pcd preenchido : {com_status}")
        print(f"postos status_pcd = ATIVO        : {ativos}")
        print(f"  destes com operacao_fim_ano    : {ativos_com_fim}")
        print()

        cur.execute(
            """
            SELECT status_pcd, COUNT(*)
            FROM postos
            WHERE status_pcd IS NOT NULL
            GROUP BY status_pcd
            ORDER BY 2 DESC
            """
        )
        print("Distribuicao de status_pcd:")
        for status, qtd in cur.fetchall():
            print(f"  {status!r:30}  {qtd}")
        print()

        cur.execute(
            """
            SELECT prefixo, nome_estacao, status_pcd,
                   operacao_inicio_ano, operacao_fim_ano
            FROM postos
            WHERE UPPER(TRIM(status_pcd)) = 'ATIVO'
              AND operacao_fim_ano IS NOT NULL
            ORDER BY prefixo
            LIMIT 20
            """
        )
        linhas = cur.fetchall()
        if linhas:
            print("Amostra (max 20) de ATIVO com operacao_fim_ano preenchido:")
            print(f"{'prefixo':12}  {'nome_estacao':40}  status  inicio  fim")
            print("-" * 90)
            for prefixo, nome, status, inicio, fim in linhas:
                print(
                    f"{(prefixo or ''):12}  "
                    f"{(nome or '')[:40]:40}  "
                    f"{(status or ''):6}  "
                    f"{str(inicio or '-'):6}  "
                    f"{str(fim or '-'):4}"
                )


if __name__ == "__main__":
    main()
