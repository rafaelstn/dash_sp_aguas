"""
Recalcula a classificacao geografica de divergencia em todos os postos
com analise pendente (analise_geo_em IS NULL).

Executa posto-a-posto via funcao SQL recalcular_divergencia_posto(id)
para contornar statement_timeout do Supabase. Idempotente: posto ja
analisado nao re-roda.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/recalcular_divergencia_postos.py
"""

from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import psycopg


def carregar_database_url() -> str:
    env = Path(".env.local").read_text(encoding="utf-8")
    match = re.search(r"^DATABASE_URL\s*=\s*(.+)$", env, re.MULTILINE)
    if not match:
        raise SystemExit("DATABASE_URL ausente em .env.local")
    return match.group(1).strip().strip('"').strip("'")


def main() -> int:
    print("=== Recalcular divergencia geografica em postos ===")
    print()

    url = carregar_database_url()

    with psycopg.connect(url, prepare_threshold=None) as conn, conn.cursor() as cur:
        # Popula geom em massa primeiro
        cur.execute(
            """
            UPDATE postos
               SET geom = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4674)
             WHERE latitude IS NOT NULL AND longitude IS NOT NULL
               AND geom IS NULL
               AND deleted_at IS NULL
            """
        )
        print(f"Geom populado em {cur.rowcount} postos.")

        # Lista pendentes
        cur.execute(
            """
            SELECT id FROM postos
             WHERE analise_geo_em IS NULL AND deleted_at IS NULL
             ORDER BY prefixo
            """
        )
        pendentes = [row[0] for row in cur.fetchall()]
        total = len(pendentes)
        print(f"Pendentes: {total} postos.")
        print()

        if total == 0:
            print("Nada a fazer.")
        else:
            inicio = time.time()
            for i, posto_id in enumerate(pendentes, 1):
                cur.execute("SELECT recalcular_divergencia_posto(%s)", (posto_id,))
                if i % 100 == 0:
                    elapsed = time.time() - inicio
                    rate = i / elapsed if elapsed > 0 else 0
                    eta = (total - i) / rate if rate > 0 else 0
                    print(
                        f"  {i}/{total} ({rate:.1f}/s, ETA {eta:.0f}s)",
                        end="\r",
                        flush=True,
                    )
                if i % 200 == 0:
                    conn.commit()
            conn.commit()
            print(f"  {total}/{total} concluido em {time.time() - inicio:.1f}s." + " " * 20)
            print()

        # Distribuicao
        cur.execute(
            """
            SELECT divergencia_municipio, COUNT(*),
                   COUNT(*) FILTER (WHERE operacao_fim_ano IS NULL
                     OR operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1)
                   AS ativos
              FROM postos
             WHERE deleted_at IS NULL
             GROUP BY 1 ORDER BY 1
            """
        )
        print("=== Distribuicao por divergencia_municipio ===")
        print(f"  {'classificacao':25} {'total':>6} {'ativos':>8}")
        print("  " + "-" * 45)
        for cls, t, a in cur.fetchall():
            print(f"  {cls or '(NULL)':25} {t:>6} {a:>8}")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAbortado.")
        sys.exit(130)
