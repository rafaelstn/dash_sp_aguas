"""
Dois cenarios ANA atacados num so script:

1) Sem codigo adicional (101 estacoes):
   Para cada estacao ANA sem codigo_adicional, tenta achar o posto SP
   correspondente por similaridade de nome (pg_trgm) + proximidade
   geografica + mesmo municipio. Popula match_sugerido_* na propria
   ana_revisao_estacao.

2) Duplicatas em postos:
   - Mesmo prefixo (deveria ser UNIQUE, audita): SQL groupby
   - Coord < 100m E nome similar: PostGIS cluster + trigram
   Resultado: tabela 'postos_duplicatas_candidatos' (materializada
   simples em memoria, depois inserida em uma view temporaria).

Idempotente. Zero invencao de dado: so popula campos de sugestao;
Marcio aceita ou rejeita na UI.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/detectar_match_e_duplicatas.py
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
    url = carregar_database_url()

    with psycopg.connect(url, prepare_threshold=None) as conn, conn.cursor() as cur:
        # ====================================================================
        # 1) MATCH SUGERIDO para estacoes ANA sem codigo adicional
        # ====================================================================
        print("=== 1) Match sugerido (estacoes ANA sem codigo_adicional) ===")
        print()

        cur.execute(
            """
            SELECT e.id, e.codigo_ana, e.nome, e.municipio_nome,
                   e.latitude, e.longitude
              FROM ana_revisao_estacao e
             WHERE (e.codigo_adicional IS NULL OR e.codigo_adicional = '')
               AND e.match_sugerido_calculado_em IS NULL
               AND e.status IN ('pendente', 'em_revisao')
            ORDER BY e.codigo_ana
            """
        )
        alvos = cur.fetchall()
        print(f"  alvos: {len(alvos)} estacoes ANA")

        inicio = time.time()
        com_alta = com_media = com_baixa = sem_candidato = 0
        for i, (est_id, cod_ana, nome, mun, lat, lng) in enumerate(alvos, 1):
            # Busca candidatos: trigram em nome + mesmo municipio + coord proxima
            # Score: similarity(nome) * 0.5 + (mesmo_municipio ? 0.3 : 0) +
            #        (coord_dentro_5km ? 0.2 : 0)
            cur.execute(
                """
                WITH cand AS (
                  SELECT
                    p.id, p.prefixo, p.nome_estacao,
                    similarity(LOWER(unaccent(COALESCE(p.nome_estacao, ''))),
                               LOWER(unaccent(%s))) AS sim_nome,
                    (LOWER(unaccent(COALESCE(p.municipio, '')))
                     = LOWER(unaccent(COALESCE(%s, '')))) AS mun_bate,
                    CASE
                      WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL
                       AND %s IS NOT NULL AND %s IS NOT NULL
                      THEN ST_DistanceSphere(
                        ST_MakePoint(p.longitude::float, p.latitude::float),
                        ST_MakePoint(%s::float, %s::float)
                      )
                    END AS dist_m
                  FROM postos p
                  WHERE p.deleted_at IS NULL
                    AND (
                      similarity(LOWER(unaccent(COALESCE(p.nome_estacao, ''))),
                                 LOWER(unaccent(%s))) > 0.3
                      OR LOWER(unaccent(COALESCE(p.municipio, '')))
                       = LOWER(unaccent(COALESCE(%s, '')))
                    )
                )
                SELECT id, prefixo, nome_estacao, sim_nome, mun_bate, dist_m,
                       (sim_nome * 0.5
                        + CASE WHEN mun_bate THEN 0.3 ELSE 0 END
                        + CASE WHEN dist_m IS NOT NULL AND dist_m < 5000
                               THEN 0.2 - (dist_m::float / 25000) ELSE 0 END) AS score
                FROM cand
                ORDER BY score DESC NULLS LAST
                LIMIT 1
                """,
                (nome or "", mun or "", lng, lat, lng, lat, nome or "", mun or ""),
            )
            r = cur.fetchone()
            if r and r[6] is not None and r[6] > 0.2:
                posto_id, prefixo, nome_p, sim_nome, mun_bate, dist_m, score = r
                if score >= 0.7:
                    conf = "alta"
                    com_alta += 1
                elif score >= 0.4:
                    conf = "media"
                    com_media += 1
                else:
                    conf = "baixa"
                    com_baixa += 1
                cur.execute(
                    """
                    UPDATE ana_revisao_estacao
                       SET match_sugerido_posto_id = %s,
                           match_sugerido_confianca = %s,
                           match_sugerido_score = %s,
                           match_sugerido_calculado_em = NOW()
                     WHERE id = %s
                    """,
                    (posto_id, conf, score, est_id),
                )
            else:
                sem_candidato += 1
                cur.execute(
                    """
                    UPDATE ana_revisao_estacao
                       SET match_sugerido_calculado_em = NOW()
                     WHERE id = %s
                    """,
                    (est_id,),
                )
            if i % 20 == 0:
                conn.commit()
                print(f"  {i}/{len(alvos)} ({(i/(time.time()-inicio)):.1f}/s)", end="\r", flush=True)
        conn.commit()
        print(f"  {len(alvos)}/{len(alvos)} em {time.time()-inicio:.1f}s" + " " * 20)
        print(f"  alta: {com_alta}, media: {com_media}, baixa: {com_baixa}, sem candidato: {sem_candidato}")
        print()

        # ====================================================================
        # 2) DETECTAR DUPLICATAS EM POSTOS
        # ====================================================================
        print("=== 2) Duplicatas candidatas em postos ===")
        print()

        # 2a) Mesmo prefixo (deveria ser unique)
        cur.execute(
            """
            SELECT prefixo, COUNT(*) AS qtd, array_agg(id) AS ids
              FROM postos
             WHERE deleted_at IS NULL
             GROUP BY prefixo
            HAVING COUNT(*) > 1
            """
        )
        prefixos_dup = cur.fetchall()
        print(f"  prefixos duplicados (mesmo nome): {len(prefixos_dup)}")

        # 2b) Coord proxima (<100m) + nome similar (>0.5)
        cur.execute(
            """
            SELECT p1.id, p1.prefixo, p1.nome_estacao,
                   p2.id, p2.prefixo, p2.nome_estacao,
                   ST_DistanceSphere(
                     ST_MakePoint(p1.longitude::float, p1.latitude::float),
                     ST_MakePoint(p2.longitude::float, p2.latitude::float)
                   ) AS dist_m,
                   similarity(LOWER(unaccent(COALESCE(p1.nome_estacao, ''))),
                              LOWER(unaccent(COALESCE(p2.nome_estacao, '')))) AS sim
              FROM postos p1
              JOIN postos p2 ON p2.id > p1.id
             WHERE p1.deleted_at IS NULL AND p2.deleted_at IS NULL
               AND p1.latitude IS NOT NULL AND p1.longitude IS NOT NULL
               AND p2.latitude IS NOT NULL AND p2.longitude IS NOT NULL
               AND ST_DistanceSphere(
                     ST_MakePoint(p1.longitude::float, p1.latitude::float),
                     ST_MakePoint(p2.longitude::float, p2.latitude::float)
                   ) < 100
               AND similarity(LOWER(unaccent(COALESCE(p1.nome_estacao, ''))),
                              LOWER(unaccent(COALESCE(p2.nome_estacao, '')))) > 0.5
             ORDER BY sim DESC, dist_m
            """
        )
        dups_coord = cur.fetchall()
        print(f"  pares coord <100m AND nome similar: {len(dups_coord)}")
        print()
        if dups_coord[:5]:
            print("  Amostras:")
            for r in dups_coord[:5]:
                print(f"    {r[1]} ({r[2]!r}) <-> {r[4]} ({r[5]!r}) dist={r[6]:.0f}m sim={r[7]:.2f}")

        print()
        print("=== Resultado ===")
        cur.execute(
            "SELECT match_sugerido_confianca, COUNT(*) FROM ana_revisao_estacao "
            "WHERE match_sugerido_posto_id IS NOT NULL GROUP BY 1 ORDER BY 1"
        )
        print("Estacoes ANA com match sugerido:")
        for conf, qtd in cur.fetchall():
            print(f"  {conf}: {qtd}")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAbortado.")
        sys.exit(130)
