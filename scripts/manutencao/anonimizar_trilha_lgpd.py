"""
Anonimiza ip/user_agent da trilha de auditoria mais antiga que o prazo de
retencao (LGPD-4). Chama a funcao SQL anonimizar_trilha_auditoria (migration
0048), que zera so os metadados de rede e mantem o evento.

Idempotente: rodar de novo so afeta linhas que ainda tenham ip/user_agent acima
do prazo. Pensado para rodar periodicamente (cron mensal).

Rodar:
    ops/indexer/.venv/Scripts/python.exe scripts/manutencao/anonimizar_trilha_lgpd.py
    ops/indexer/.venv/Scripts/python.exe scripts/manutencao/anonimizar_trilha_lgpd.py --dias 180
    ops/indexer/.venv/Scripts/python.exe scripts/manutencao/anonimizar_trilha_lgpd.py --dry-run
"""

import argparse
import re
import sys
from pathlib import Path

import psycopg

RETENCAO_PADRAO_DIAS = 180


def carregar_database_url() -> str:
    env = Path(".env.local").read_text(encoding="utf-8")
    match = re.search(r"^DATABASE_URL\s*=\s*(.+)$", env, re.MULTILINE)
    if not match:
        raise SystemExit("DATABASE_URL ausente em .env.local")
    return match.group(1).strip().strip('"').strip("'")


def main() -> int:
    parser = argparse.ArgumentParser(description="Anonimiza PII de rede da trilha (LGPD-4).")
    parser.add_argument("--dias", type=int, default=RETENCAO_PADRAO_DIAS,
                        help=f"Prazo de retencao em dias (padrao {RETENCAO_PADRAO_DIAS}).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Conta quantas linhas seriam anonimizadas, sem alterar.")
    args = parser.parse_args()

    if args.dias < 1:
        raise SystemExit("--dias deve ser >= 1")

    with psycopg.connect(carregar_database_url()) as conn:
        with conn.cursor() as cur:
            if args.dry_run:
                # Conta candidatas por tabela sem alterar nada.
                tabelas = ["acesso_ficha", "triagem_eventos", "ana_revisao_evento", "postos_evento"]
                total = 0
                for t in tabelas:
                    cur.execute(
                        f"""
                        SELECT COUNT(*) FROM {t}
                         WHERE ocorreu_em < NOW() - make_interval(days => %s)
                           AND (ip IS NOT NULL OR user_agent IS NOT NULL)
                        """,
                        (args.dias,),
                    )
                    n = cur.fetchone()[0]
                    total += n
                    print(f"  {t}: {n} linha(s) seriam anonimizadas")
                print(f"[dry-run] total: {total} linha(s) acima de {args.dias} dias")
                conn.rollback()
                return 0

            cur.execute("SELECT tabela, linhas_anonimizadas FROM anonimizar_trilha_auditoria(%s)", (args.dias,))
            linhas = cur.fetchall()
            conn.commit()
            total = sum(n for _, n in linhas)
            for tabela, n in linhas:
                print(f"  {tabela}: {n} linha(s) anonimizada(s)")
            print(f"OK: {total} linha(s) anonimizada(s) acima de {args.dias} dias")
    return 0


if __name__ == "__main__":
    sys.exit(main())
