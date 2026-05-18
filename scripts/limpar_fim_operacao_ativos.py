"""
Limpa operacao_fim_ano de postos com status_pcd = 'ATIVO'.
Inconsistencia detectada: posto marcado ATIVO nao deveria ter ano de fim.

Idempotente: rodar de novo so afeta linhas que voltarem a violar a regra.
Em transacao: faz UPDATE e commita; rollback automatico se algo falhar.
Backup: salva CSV com snapshot dos registros afetados antes do UPDATE.

Rodar:
    ops/indexer/.venv/Scripts/python.exe scripts/limpar_fim_operacao_ativos.py
    ops/indexer/.venv/Scripts/python.exe scripts/limpar_fim_operacao_ativos.py --dry-run
"""

import csv
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg


CRITERIO_WHERE = """
    UPPER(TRIM(status_pcd)) = 'ATIVO'
    AND operacao_fim_ano IS NOT NULL
""".strip()


def carregar_database_url() -> str:
    env = Path(".env.local").read_text(encoding="utf-8")
    match = re.search(r"^DATABASE_URL\s*=\s*(.+)$", env, re.MULTILINE)
    if not match:
        raise SystemExit("DATABASE_URL ausente em .env.local")
    return match.group(1).strip().strip('"').strip("'")


def gerar_backup(cur, destino: Path) -> int:
    cur.execute(
        f"""
        SELECT id, prefixo, nome_estacao, status_pcd,
               operacao_inicio_ano, operacao_fim_ano, updated_at
          FROM postos
         WHERE {CRITERIO_WHERE}
         ORDER BY prefixo
        """
    )
    linhas = cur.fetchall()
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(
            [
                "id",
                "prefixo",
                "nome_estacao",
                "status_pcd",
                "operacao_inicio_ano",
                "operacao_fim_ano",
                "updated_at",
            ]
        )
        for row in linhas:
            writer.writerow(row)
    return len(linhas)


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    url = carregar_database_url()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = Path("data") / f"backup_limpar_fim_operacao_{stamp}.csv"

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        afetados_antes = gerar_backup(cur, backup_path)
        print(f"snapshot salvo  : {backup_path}  ({afetados_antes} linhas)")

        if afetados_antes == 0:
            print("nada a alterar; estado ja consistente.")
            return

        if dry_run:
            print("--dry-run informado; nao aplicando UPDATE.")
            return

        cur.execute(
            f"""
            UPDATE postos
               SET operacao_fim_ano = NULL
             WHERE {CRITERIO_WHERE}
            """
        )
        afetados = cur.rowcount
        conn.commit()
        print(f"UPDATE aplicado : {afetados} linhas")

        cur.execute(
            f"SELECT COUNT(*) FROM postos WHERE {CRITERIO_WHERE}"
        )
        remanescentes = cur.fetchone()[0]
        print(f"remanescentes   : {remanescentes}  (esperado 0)")


if __name__ == "__main__":
    main()
