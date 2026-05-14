"""
Move automaticamente a coordenada de cada posto divergente para o ponto
mais proximo DENTRO do municipio declarado (PostGIS ST_ClosestPoint).

Pipeline:
  1. Aplica migration 0035 (idempotente).
  2. Para cada posto com divergencia_municipio = 'divergente', chama a
     function mover_coord_para_municipio_declarado(id). Audit em
     postos_evento eh automatico.
  3. Trigger postos_invalidar_analise_geo invalida analise_geo_em, entao
     ao final rodamos recalcular_divergencia_posto(id) para cada posto
     ajustado, atualizando a classificacao para 'ok' (ja que a coord
     agora cai dentro do municipio).
  4. Resumo final.

Idempotente: postos ja com divergencia 'ok' nao sao tocados.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/arrumar_coordenadas_divergentes.py [--dry-run]
"""

from __future__ import annotations

import argparse
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
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="lista quem seria movido, sem persistir")
    args = ap.parse_args()

    print("=== Arrumar coordenadas divergentes ===")
    print(f"  dry-run: {args.dry_run}")
    print()

    url = carregar_database_url()

    with psycopg.connect(url, prepare_threshold=None) as conn, conn.cursor() as cur:
        # Aplica migration 0035 (idempotente)
        print("Aplicando migration 0035 (function mover_coord)...")
        cur.execute(Path("supabase/migrations/0035_func_mover_coord_para_municipio.sql").read_text(encoding="utf-8"))
        conn.commit()
        print("  OK")
        print()

        # Lista divergentes
        cur.execute(
            """
            SELECT id, prefixo, municipio, distancia_municipio_m::float
              FROM postos
             WHERE divergencia_municipio = 'divergente'
               AND deleted_at IS NULL
             ORDER BY distancia_municipio_m DESC
            """
        )
        divergentes = cur.fetchall()
        total = len(divergentes)
        print(f"Postos divergentes a mover: {total}")
        if total > 0:
            print(f"  pior caso: {divergentes[0][1]} a {divergentes[0][3]/1000:.0f}km de {divergentes[0][2]!r}")
            print(f"  melhor:    {divergentes[-1][1]} a {divergentes[-1][3]/1000:.1f}km de {divergentes[-1][2]!r}")
        print()

        if args.dry_run:
            print("Dry-run: nao persistindo. Saindo.")
            return 0

        if total == 0:
            print("Nada a arrumar.")
            return 0

        print("Movendo coordenadas...")
        inicio = time.time()
        movidos = 0
        ignorados = 0
        for i, (posto_id, prefixo, _, _) in enumerate(divergentes, 1):
            cur.execute(
                "SELECT mover_coord_para_municipio_declarado(%s, NULL, %s)",
                (posto_id, "auto_mover_coord_em_lote_2026-05-14"),
            )
            moveu = cur.fetchone()[0]
            if moveu:
                movidos += 1
            else:
                ignorados += 1

            if i % 50 == 0:
                conn.commit()
                elapsed = time.time() - inicio
                rate = i / elapsed if elapsed > 0 else 0
                eta = (total - i) / rate if rate > 0 else 0
                print(f"  {i}/{total} (mov={movidos}, ign={ignorados}, {rate:.1f}/s, ETA {eta:.0f}s)",
                      end="\r", flush=True)
        conn.commit()
        print(f"  {total}/{total} processados em {time.time()-inicio:.1f}s." + " " * 30)
        print(f"  movidos: {movidos}")
        print(f"  ignorados (sem municipio na IBGE / ja dentro): {ignorados}")
        print()

        # Recalcula divergencia para todos os movidos
        print("Recalculando divergencia geografica dos movidos...")
        cur.execute(
            """
            SELECT id FROM postos
             WHERE analise_geo_em IS NULL AND deleted_at IS NULL
             ORDER BY prefixo
            """
        )
        pendentes_recalc = [r[0] for r in cur.fetchall()]
        print(f"  {len(pendentes_recalc)} postos pendentes de recalc.")

        inicio = time.time()
        for i, posto_id in enumerate(pendentes_recalc, 1):
            cur.execute("SELECT recalcular_divergencia_posto(%s)", (posto_id,))
            if i % 100 == 0:
                conn.commit()
                elapsed = time.time() - inicio
                rate = i / elapsed if elapsed > 0 else 0
                eta = (len(pendentes_recalc) - i) / rate if rate > 0 else 0
                print(f"  recalc {i}/{len(pendentes_recalc)} ({rate:.1f}/s, ETA {eta:.0f}s)",
                      end="\r", flush=True)
        conn.commit()
        print(f"  recalc {len(pendentes_recalc)}/{len(pendentes_recalc)} concluido em {time.time()-inicio:.1f}s." + " " * 20)
        print()

        # Resumo final
        cur.execute(
            """
            SELECT divergencia_municipio, COUNT(*),
                   COUNT(*) FILTER (WHERE operacao_fim_ano IS NULL
                     OR operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) AS ativos
              FROM postos
             WHERE deleted_at IS NULL
             GROUP BY 1 ORDER BY 1
            """
        )
        print("=== Distribuicao final ===")
        print(f"  {'classificacao':25} {'total':>6} {'ativos':>8}")
        print("  " + "-" * 45)
        for cls, t, a in cur.fetchall():
            print(f"  {cls or '(NULL)':25} {t:>6} {a:>8}")
        print()

        cur.execute(
            """
            SELECT COUNT(*) FROM postos_evento
             WHERE origem_evento = 'auto_mover_coord_em_lote_2026-05-14'
            """
        )
        print(f"Eventos no audit trail: {cur.fetchone()[0]}")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAbortado.")
        sys.exit(130)
