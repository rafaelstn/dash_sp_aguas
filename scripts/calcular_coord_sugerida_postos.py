"""
Calcula coordenada sugerida para todos os postos com divergencia geo.

Para cada posto onde a coord cai fora do municipio declarado, PostGIS
ST_ClosestPoint(m.geom, p.geom) calcula o ponto mais proximo da
coord atual que ainda esta dentro do municipio. Atualiza
postos.lat_sugerida_ibge / lng_sugerida_ibge.

Idempotente: filtra sugerida_calculada_em IS NULL.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/calcular_coord_sugerida_postos.py
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
    print("=== Calcular coord sugerida para postos divergentes ===")
    print()

    url = carregar_database_url()

    with psycopg.connect(url, prepare_threshold=None) as conn, conn.cursor() as cur:
        # Recalcula tudo, ignorando sugerida_calculada_em (forcado)
        cur.execute(
            """
            SELECT id FROM postos
             WHERE divergencia_municipio = 'divergente'
               AND deleted_at IS NULL
             ORDER BY prefixo
            """
        )
        pendentes = [row[0] for row in cur.fetchall()]
        total = len(pendentes)
        print(f"Postos divergentes a processar: {total}")
        print()

        inicio = time.time()
        for i, posto_id in enumerate(pendentes, 1):
            cur.execute("SELECT calcular_coord_sugerida_posto(%s)", (posto_id,))
            if i % 50 == 0:
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
        print(f"  {total}/{total} em {time.time() - inicio:.1f}s." + " " * 20)
        print()

        # Resumo
        cur.execute(
            """
            SELECT
              COUNT(*)                                                          AS divergentes,
              COUNT(*) FILTER (WHERE lat_sugerida_ibge IS NOT NULL)              AS com_sugestao,
              COUNT(*) FILTER (WHERE lat_sugerida_ibge IS NULL)                  AS sem_sugestao,
              ROUND(AVG(distancia_sugerida_m) FILTER (WHERE distancia_sugerida_m > 0)::numeric / 1000, 1) AS dist_media_km,
              ROUND(MAX(distancia_sugerida_m)::numeric / 1000, 1)                AS dist_max_km,
              ROUND(MIN(distancia_sugerida_m) FILTER (WHERE distancia_sugerida_m > 0)::numeric / 1000, 1) AS dist_min_km
            FROM postos
            WHERE divergencia_municipio = 'divergente' AND deleted_at IS NULL
            """
        )
        r = cur.fetchone()
        print("=== Resumo ===")
        print(f"  Postos divergentes:       {r[0]}")
        print(f"  Com sugestao calculada:   {r[1]}")
        print(f"  Sem sugestao (sem match): {r[2]}")
        print(f"  Distancia media:          {r[3]} km")
        print(f"  Distancia max:            {r[4]} km")
        print(f"  Distancia min:            {r[5]} km")
        print()

        # Amostra de 5
        cur.execute(
            """
            SELECT prefixo, nome_estacao, municipio,
                   ROUND(latitude::numeric, 4) AS lat_atual,
                   ROUND(longitude::numeric, 4) AS lng_atual,
                   ROUND(lat_sugerida_ibge::numeric, 4) AS lat_sug,
                   ROUND(lng_sugerida_ibge::numeric, 4) AS lng_sug,
                   ROUND(distancia_sugerida_m::numeric / 1000, 1) AS deslocamento_km
            FROM postos
            WHERE divergencia_municipio = 'divergente'
              AND lat_sugerida_ibge IS NOT NULL
              AND deleted_at IS NULL
            ORDER BY distancia_sugerida_m DESC
            LIMIT 5
            """
        )
        print("=== Amostras (maior deslocamento) ===")
        print(f"  {'prefixo':10} {'municipio':25} {'atual':>22} {'sugerida':>22} {'desloc':>8}")
        print("  " + "-" * 95)
        for pfx, nome, mun, lat_a, lng_a, lat_s, lng_s, desloc in cur.fetchall():
            print(
                f"  {pfx:10} {(mun or '')[:25]:25} "
                f"({lat_a:>7}, {lng_a:>8}) -> ({lat_s:>7}, {lng_s:>8}) {desloc:>5}km"
            )

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAbortado.")
        sys.exit(130)
