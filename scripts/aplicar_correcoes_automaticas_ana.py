"""
Aplica correcoes automaticas no inventario ANA, usando o banco SPAguas
como fonte autoritativa (decisao Rafael 2026-05-14).

Para cada estacao classificada como 'divergente' (coord a >=10km da
fronteira do municipio declarado), tenta corrigir em ordem:

  Bucket A: estacao tem match com postos E coord do banco SP difere
            da coord ANA em >=10km
            -> aplica correcoes.latitude/longitude = postos.lat/lng
            -> fonte_correcao = 'banco_spaguas'

  Bucket B: estacao SEM match em postos, mas PostGIS sugere municipio
            que contem a coord
            -> aplica correcoes.municipio_nome = municipio_sugerido_nome
            -> fonte_correcao = 'postgis_ibge'

  Bucket C: sem match e sem sugestao (coord fora de SP)
            -> NAO mexe, deixa pendente para revisao humana

Idempotente:
  - nao sobrescreve correcoes ja aplicadas (verifica chaves no JSONB)
  - so age em estacoes com divergencia_municipio = 'divergente'
  - so age se status atual permite (pendente ou em_revisao)
  - cada chamada gera novo evento no audit trail

Status final: 'em_revisao' (NAO 'revisada').
  Marcio precisa confirmar caso a caso antes de exportar.

Audit trail:
  - evento = 'corrigida_auto'
  - ator_id = NULL (automacao, identifica que nao foi humano)
  - valores_antes/depois com snapshot completo
  - observacao com explicacao + bucket

Uso:
  ops/indexer/.venv/Scripts/python.exe scripts/aplicar_correcoes_automaticas_ana.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import psycopg


class JsonEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


def dumps(obj) -> str:
    return json.dumps(obj, cls=JsonEncoder)


def carregar_database_url() -> str:
    env = Path(".env.local").read_text(encoding="utf-8")
    match = re.search(r"^DATABASE_URL\s*=\s*(.+)$", env, re.MULTILINE)
    if not match:
        raise SystemExit("DATABASE_URL ausente em .env.local")
    return match.group(1).strip().strip('"').strip("'")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="mostra o que seria aplicado, sem persistir",
    )
    ap.add_argument(
        "--threshold-coord-km",
        type=float,
        default=10.0,
        help="bucket A: distancia minima entre coord ANA e coord SP para considerar correcao (default 10km)",
    )
    args = ap.parse_args()

    threshold_m = int(args.threshold_coord_km * 1000)
    print("=== Aplicacao automatica de correcoes ANA ===")
    print(f"  threshold coord SP vs ANA: >= {args.threshold_coord_km} km")
    print(f"  dry-run: {args.dry_run}")
    print()

    url = carregar_database_url()
    timestamp = datetime.utcnow().isoformat()

    with psycopg.connect(url, prepare_threshold=None) as conn, conn.cursor() as cur:
        # =====================================================================
        # BUCKET A: coord substituida pela do banco SPAguas
        # =====================================================================
        print("BUCKET A (coord do banco SP substitui coord ANA)")
        print("-" * 60)

        # Identifica candidatas A (snapshot antes do update, pro audit)
        cur.execute(
            f"""
            SELECT e.id, e.codigo_ana, e.nome, e.municipio_nome,
                   e.latitude AS lat_ana, e.longitude AS lng_ana,
                   p.latitude::text AS lat_sp, p.longitude::text AS lng_sp,
                   p.prefixo,
                   ST_DistanceSphere(
                     ST_MakePoint(e.longitude::float, e.latitude::float),
                     ST_MakePoint(p.longitude::float, p.latitude::float)
                   ) AS dist_m,
                   e.correcoes, e.status, e.justificativa
              FROM ana_revisao_estacao e
              JOIN postos p ON p.id = e.posto_id
             WHERE e.divergencia_municipio = 'divergente'
               AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
               AND ST_DistanceSphere(
                     ST_MakePoint(e.longitude::float, e.latitude::float),
                     ST_MakePoint(p.longitude::float, p.latitude::float)
                   ) >= {threshold_m}
               AND e.status IN ('pendente', 'em_revisao')
               AND NOT (e.correcoes ? 'latitude')
            """
        )
        candidatas_a = cur.fetchall()
        print(f"  candidatas: {len(candidatas_a)}")

        if not args.dry_run and candidatas_a:
            for row in candidatas_a:
                (
                    estacao_id, cod_ana, nome, mun_nome,
                    lat_ana, lng_ana, lat_sp, lng_sp, prefixo,
                    dist_m, correcoes_antes, status_antes, just_antes,
                ) = row

                novas_correcoes = dict(correcoes_antes or {})
                novas_correcoes["latitude"] = lat_sp
                novas_correcoes["longitude"] = lng_sp
                novas_correcoes["fonte_correcao"] = "banco_spaguas"
                novas_correcoes["aplicado_em"] = timestamp

                nova_justificativa = (
                    f"Automacao 2026-05-14: coordenada substituida pela "
                    f"do banco SPAguas (posto {prefixo}). Coord ANA "
                    f"({lat_ana}, {lng_ana}) estava a {dist_m/1000:.1f}km "
                    f"da coord SP ({lat_sp}, {lng_sp})."
                )

                cur.execute(
                    """
                    UPDATE ana_revisao_estacao
                       SET correcoes = %s::jsonb,
                           justificativa = %s,
                           status = 'em_revisao',
                           revisado_em = NOW()
                     WHERE id = %s
                    """,
                    (dumps(novas_correcoes), nova_justificativa, estacao_id),
                )

                cur.execute(
                    """
                    INSERT INTO ana_revisao_evento
                      (estacao_id, evento, ator_id, valores_antes, valores_depois, observacao)
                    VALUES (%s, 'corrigida_auto', NULL, %s::jsonb, %s::jsonb, %s)
                    """,
                    (
                        estacao_id,
                        dumps({
                            "status": status_antes,
                            "correcoes": correcoes_antes,
                            "justificativa": just_antes,
                            "coord_ana": [lat_ana, lng_ana],
                        }),
                        dumps({
                            "status": "em_revisao",
                            "correcoes": novas_correcoes,
                            "justificativa": nova_justificativa,
                            "coord_aplicada": [lat_sp, lng_sp],
                            "distancia_substituida_m": dist_m,
                        }),
                        f"Bucket A: coord SP substitui coord ANA (delta {dist_m/1000:.1f}km, posto {prefixo})",
                    ),
                )

        print(f"  aplicadas: {0 if args.dry_run else len(candidatas_a)}")
        print()

        # =====================================================================
        # BUCKET B: municipio substituido pelo sugerido (PostGIS)
        # =====================================================================
        print("BUCKET B (municipio sugerido pelo PostGIS, sem match em postos)")
        print("-" * 60)

        cur.execute(
            """
            SELECT e.id, e.codigo_ana, e.municipio_nome,
                   e.municipio_sugerido_nome, e.municipio_sugerido_codigo,
                   ROUND(e.distancia_municipio_declarado_m/1000::numeric, 1) AS dist_km,
                   e.correcoes, e.status, e.justificativa
              FROM ana_revisao_estacao e
             WHERE e.divergencia_municipio = 'divergente'
               AND e.municipio_sugerido_nome IS NOT NULL
               AND e.status IN ('pendente', 'em_revisao')
               AND NOT (e.correcoes ? 'municipio_nome')
               AND NOT (e.correcoes ? 'latitude')
            """
        )
        candidatas_b = cur.fetchall()
        print(f"  candidatas: {len(candidatas_b)}")

        if not args.dry_run and candidatas_b:
            for row in candidatas_b:
                (
                    estacao_id, cod_ana, mun_decl,
                    mun_sug, mun_sug_cod, dist_km,
                    correcoes_antes, status_antes, just_antes,
                ) = row

                novas_correcoes = dict(correcoes_antes or {})
                novas_correcoes["municipio_nome"] = mun_sug
                novas_correcoes["municipio_codigo_ibge"] = mun_sug_cod
                novas_correcoes["fonte_correcao"] = "postgis_ibge"
                novas_correcoes["aplicado_em"] = timestamp

                nova_justificativa = (
                    f"Automacao 2026-05-14: municipio corrigido pelo PostGIS. "
                    f"Coordenada da ANA esta a {dist_km}km da fronteira de "
                    f"'{mun_decl}', mas dentro do poligono IBGE de "
                    f"'{mun_sug}' (cod {mun_sug_cod})."
                )

                cur.execute(
                    """
                    UPDATE ana_revisao_estacao
                       SET correcoes = %s::jsonb,
                           justificativa = %s,
                           status = 'em_revisao',
                           revisado_em = NOW()
                     WHERE id = %s
                    """,
                    (dumps(novas_correcoes), nova_justificativa, estacao_id),
                )

                cur.execute(
                    """
                    INSERT INTO ana_revisao_evento
                      (estacao_id, evento, ator_id, valores_antes, valores_depois, observacao)
                    VALUES (%s, 'corrigida_auto', NULL, %s::jsonb, %s::jsonb, %s)
                    """,
                    (
                        estacao_id,
                        dumps({
                            "status": status_antes,
                            "correcoes": correcoes_antes,
                            "justificativa": just_antes,
                            "municipio_declarado": mun_decl,
                        }),
                        dumps({
                            "status": "em_revisao",
                            "correcoes": novas_correcoes,
                            "justificativa": nova_justificativa,
                            "municipio_aplicado": mun_sug,
                            "distancia_fronteira_km": float(dist_km) if dist_km is not None else None,
                        }),
                        f"Bucket B: municipio '{mun_decl}' -> '{mun_sug}' (PostGIS IBGE)",
                    ),
                )

        print(f"  aplicadas: {0 if args.dry_run else len(candidatas_b)}")
        print()

        # =====================================================================
        # BUCKET D: municipio mais proximo (coord fora de qualquer poligono SP)
        # =====================================================================
        # Para os casos onde a coord ANA cai fora de todos os 645 municipios SP
        # (coord placeholder, sinal trocado, ou estacao em divisa interestadual),
        # PostGIS calcula o municipio MAIS PROXIMO. Aplicamos com nivel de
        # confianca anotado no audit:
        #
        #   <10km   -> alta confianca (estacao na fronteira do municipio)
        #   10-30km -> media confianca (provavel cadastro impreciso)
        #   >30km   -> baixa confianca (placeholder; manter declarado como
        #              verdadeiro para Marcio decidir)
        print("BUCKET D (municipio mais proximo, coord fora de poligono SP)")
        print("-" * 60)

        cur.execute(
            """
            WITH pendentes AS (
              SELECT e.id, e.codigo_ana, e.municipio_nome,
                     e.latitude AS lat_ana, e.longitude AS lng_ana,
                     e.correcoes, e.status, e.justificativa
                FROM ana_revisao_estacao e
               WHERE e.divergencia_municipio = 'divergente'
                 AND e.status = 'pendente'
                 AND NOT (e.correcoes ? 'latitude')
                 AND NOT (e.correcoes ? 'municipio_nome')
                 AND e.geom IS NOT NULL
            )
            SELECT p.id, p.codigo_ana, p.municipio_nome,
                   p.lat_ana, p.lng_ana,
                   m.nome AS mun_proximo, m.codigo_ibge,
                   ROUND(
                     ST_Distance(m.geom::geography,
                                 ST_SetSRID(ST_MakePoint(p.lng_ana::float, p.lat_ana::float), 4674)::geography
                     )::numeric / 1000, 2
                   ) AS dist_km,
                   p.correcoes, p.status, p.justificativa
              FROM pendentes p
              CROSS JOIN LATERAL (
                SELECT nome, codigo_ibge, geom
                  FROM ibge_municipios_sp
                 ORDER BY geom <-> ST_SetSRID(ST_MakePoint(p.lng_ana::float, p.lat_ana::float), 4674)
                 LIMIT 1
              ) m
            """
        )
        candidatas_d = cur.fetchall()
        print(f"  candidatas: {len(candidatas_d)}")

        if not args.dry_run and candidatas_d:
            for row in candidatas_d:
                (
                    estacao_id, cod_ana, mun_decl,
                    lat_ana, lng_ana,
                    mun_prox, mun_prox_cod, dist_km,
                    correcoes_antes, status_antes, just_antes,
                ) = row

                dist_f = float(dist_km) if dist_km is not None else 999.0
                if dist_f < 10:
                    confianca = "alta"
                elif dist_f < 30:
                    confianca = "media"
                else:
                    confianca = "baixa"

                novas_correcoes = dict(correcoes_antes or {})

                # Confianca baixa: NAO substitui municipio (mantem o declarado),
                # apenas grava a sugestao em campo separado para Marcio ver.
                if confianca == "baixa":
                    novas_correcoes["municipio_sugerido_baixa_confianca"] = mun_prox
                    novas_correcoes["municipio_sugerido_dist_km"] = dist_f
                    novas_correcoes["fonte_correcao"] = "postgis_municipio_proximo_baixa"
                    nova_justificativa = (
                        f"Automacao 2026-05-14 (confianca BAIXA): coord ANA "
                        f"({lat_ana}, {lng_ana}) esta a {dist_f}km do municipio mais "
                        f"proximo ({mun_prox}). Coord parece ser placeholder. "
                        f"Mantido municipio declarado '{mun_decl}' por seguranca. "
                        f"Marcio deve confirmar se mantem declarado ou aceita sugestao."
                    )
                else:
                    novas_correcoes["municipio_nome"] = mun_prox
                    novas_correcoes["municipio_codigo_ibge"] = mun_prox_cod
                    novas_correcoes["fonte_correcao"] = f"postgis_municipio_proximo_{confianca}"
                    novas_correcoes["distancia_municipio_proximo_km"] = dist_f
                    nova_justificativa = (
                        f"Automacao 2026-05-14 (confianca {confianca.upper()}): "
                        f"coord ANA cai fora de qualquer municipio SP. "
                        f"Municipio mais proximo no PostGIS IBGE eh '{mun_prox}' "
                        f"a {dist_f}km. Substituido '{mun_decl}' por '{mun_prox}'."
                    )

                novas_correcoes["aplicado_em"] = timestamp

                cur.execute(
                    """
                    UPDATE ana_revisao_estacao
                       SET correcoes = %s::jsonb,
                           justificativa = %s,
                           status = 'em_revisao',
                           revisado_em = NOW()
                     WHERE id = %s
                    """,
                    (dumps(novas_correcoes), nova_justificativa, estacao_id),
                )

                cur.execute(
                    """
                    INSERT INTO ana_revisao_evento
                      (estacao_id, evento, ator_id, valores_antes, valores_depois, observacao)
                    VALUES (%s, 'corrigida_auto', NULL, %s::jsonb, %s::jsonb, %s)
                    """,
                    (
                        estacao_id,
                        dumps({
                            "status": status_antes,
                            "correcoes": correcoes_antes,
                            "justificativa": just_antes,
                            "coord_ana": [lat_ana, lng_ana],
                        }),
                        dumps({
                            "status": "em_revisao",
                            "correcoes": novas_correcoes,
                            "justificativa": nova_justificativa,
                            "confianca": confianca,
                            "municipio_sugerido": mun_prox,
                            "distancia_km": dist_f,
                        }),
                        f"Bucket D ({confianca}): municipio mais proximo '{mun_prox}' a {dist_f}km",
                    ),
                )

        print(f"  aplicadas: {0 if args.dry_run else len(candidatas_d)}")
        print()

        # =====================================================================
        # BUCKET C (informativo apenas, nao mexe)
        # =====================================================================
        cur.execute(
            """
            SELECT COUNT(*)
              FROM ana_revisao_estacao
             WHERE divergencia_municipio = 'divergente'
               AND posto_id IS NULL
               AND municipio_sugerido_nome IS NULL
            """
        )
        bucket_c = cur.fetchone()[0]
        print(f"BUCKET C (pendente, sem fonte automatica): {bucket_c}")
        print("  (coord fora de qualquer municipio SP; requer revisao humana)")
        print()

        if not args.dry_run:
            conn.commit()

        # ======= Resumo final =======
        print("=== Resumo do banco apos aplicacao ===")
        cur.execute(
            """
            SELECT status, COUNT(*)
              FROM ana_revisao_estacao
             WHERE divergencia_municipio = 'divergente'
             GROUP BY status
             ORDER BY 1
            """
        )
        for s, c in cur.fetchall():
            print(f"  status={s:14} {c}")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAbortado.")
        sys.exit(130)
