"""Aplica resposta SPÁguas para as estações ANA sem match em postos.

Para cada uma das estações com `posto_id IS NULL` e `divergencia_municipio = 'divergente'`:

  Caso 1: tem `municipio_sugerido_codigo` (PostGIS achou município que
          contém o ponto declarado pela ANA)
          → resposta_municipio = municipio_sugerido
          → resposta_lat/lng  = centroide do polígono IBGE
          → resposta_fonte    = 'postgis_ibge'
          → justificativa: "Coord ANA aparentemente truncada para grau
            inteiro. Município corrigido para o que contém a coord ANA
            segundo análise PostGIS+IBGE; coord ajustada para o centroide
            do município identificado."

  Caso 2: SEM sugestão IBGE (ponto fora de SP)
          → não preenche lat/lng/municipio
          → resposta_fonte = 'sem_correcao'
          → justificativa: "Coordenada fora do território de São Paulo.
            Provável erro de digitação no inventário ANA. Estação não
            cadastrada no inventário SPÁguas."

Também adiciona um caso geral para estações sem match com observação
"ESTAÇÃO SEM O CÓDIGO ADICIONAL" (a ANA quer que confirmemos):
          → resposta_fonte = 'sem_correcao'
          → justificativa: "Estação não cadastrada no inventário SPÁguas
            (sem código adicional / DAEE associado)."

Status final: 'revisada' (zera da fila de pendentes).
Audit em ana_revisao_evento.

Idempotente: só aplica em estações ainda não respondidas.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/preencher_resposta_orfas.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local")
DB_URL = os.environ["DATABASE_URL"]

JUSTIF_BUCKET_B = (
    "Coordenada ANA aparentemente truncada para grau inteiro. Municipio "
    "corrigido para o que contem a coord ANA segundo analise PostGIS+IBGE; "
    "coord ajustada para o centroide do municipio identificado. Estacao nao "
    "cadastrada no inventario SPAguas."
)
JUSTIF_FORA_SP = (
    "Coordenada fora do territorio de Sao Paulo. Provavel erro de digitacao "
    "no inventario ANA. Estacao nao cadastrada no inventario SPAguas."
)
JUSTIF_SEM_COD_ADICIONAL = (
    "Estacao nao cadastrada no inventario SPAguas (sem codigo adicional / "
    "DAEE associado)."
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print(f"=== Preencher resposta SPAguas para estacoes orfas ===")
    print(f"  dry-run: {args.dry_run}")
    print()

    with psycopg.connect(DB_URL, prepare_threshold=None) as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM ana_revisao_lote ORDER BY criado_em DESC LIMIT 1")
        (lote_id,) = cur.fetchone()

        # ------------------------------------------------------------------
        # CASO 1: divergente, sem match, COM sugestao IBGE
        # → coord centroide do municipio sugerido + justificativa Bucket B
        # ------------------------------------------------------------------
        cur.execute(
            """
            SELECT
              e.id,
              e.codigo_ana,
              e.municipio_sugerido_codigo,
              e.municipio_sugerido_nome,
              ST_Y(ST_PointOnSurface(m.geom))::numeric AS lat,
              ST_X(ST_PointOnSurface(m.geom))::numeric AS lng
              FROM ana_revisao_estacao e
              JOIN ibge_municipios_sp m ON m.codigo_ibge = e.municipio_sugerido_codigo
             WHERE e.lote_id = %s
               AND e.divergencia_municipio = 'divergente'
               AND e.status IN ('pendente', 'em_revisao')
               AND e.posto_id IS NULL
               AND e.municipio_sugerido_codigo IS NOT NULL
               AND e.resposta_fonte IS NULL
            """,
            (lote_id,),
        )
        caso1 = cur.fetchall()
        print(f"Caso 1 (com sugestao IBGE): {len(caso1)} estacoes")
        if args.dry_run and caso1:
            print("  amostra:")
            for r in caso1[:3]:
                print(f"    {r[1]} -> mun {r[3]} ({r[2]}) coord centroide ({r[4]:.5f},{r[5]:.5f})")

        if not args.dry_run:
            for est_id, codigo_ana, mun_cod, mun_nome, lat, lng in caso1:
                cur.execute(
                    """
                    UPDATE ana_revisao_estacao
                       SET resposta_municipio_codigo = %s,
                           resposta_municipio_nome   = %s,
                           resposta_latitude         = %s,
                           resposta_longitude        = %s,
                           resposta_justificativa    = %s,
                           resposta_fonte            = 'postgis_ibge',
                           status                    = 'revisada',
                           revisado_em               = NOW(),
                           atualizado_em             = NOW()
                     WHERE id = %s
                    """,
                    (mun_cod, mun_nome, lat, lng, JUSTIF_BUCKET_B, est_id),
                )
                cur.execute(
                    """
                    INSERT INTO ana_revisao_evento
                      (estacao_id, evento, ator_id, valores_depois, observacao)
                    VALUES (%s, 'corrigida_auto', NULL, %s::jsonb, %s)
                    """,
                    (
                        est_id,
                        json.dumps({
                            "origem": "preencher_resposta_orfas",
                            "resposta_municipio_codigo": mun_cod,
                            "resposta_municipio_nome": mun_nome,
                            "resposta_latitude": str(lat),
                            "resposta_longitude": str(lng),
                            "resposta_fonte": "postgis_ibge",
                        }),
                        JUSTIF_BUCKET_B,
                    ),
                )

        # ------------------------------------------------------------------
        # CASO 2: divergente, sem match, SEM sugestao IBGE (fora de SP)
        # → so justificativa textual
        # ------------------------------------------------------------------
        cur.execute(
            """
            SELECT id, codigo_ana
              FROM ana_revisao_estacao
             WHERE lote_id = %s
               AND divergencia_municipio = 'divergente'
               AND status IN ('pendente', 'em_revisao')
               AND posto_id IS NULL
               AND municipio_sugerido_codigo IS NULL
               AND resposta_fonte IS NULL
            """,
            (lote_id,),
        )
        caso2 = cur.fetchall()
        print(f"Caso 2 (fora de SP, sem sugestao IBGE): {len(caso2)} estacoes")

        if not args.dry_run:
            for est_id, _codigo_ana in caso2:
                cur.execute(
                    """
                    UPDATE ana_revisao_estacao
                       SET resposta_justificativa = %s,
                           resposta_fonte         = 'sem_correcao',
                           status                 = 'revisada',
                           revisado_em            = NOW(),
                           atualizado_em          = NOW()
                     WHERE id = %s
                    """,
                    (JUSTIF_FORA_SP, est_id),
                )
                cur.execute(
                    """
                    INSERT INTO ana_revisao_evento
                      (estacao_id, evento, ator_id, valores_depois, observacao)
                    VALUES (%s, 'corrigida_auto', NULL, %s::jsonb, %s)
                    """,
                    (
                        est_id,
                        json.dumps({
                            "origem": "preencher_resposta_orfas",
                            "resposta_fonte": "sem_correcao",
                        }),
                        JUSTIF_FORA_SP,
                    ),
                )

        # ------------------------------------------------------------------
        # CASO 3: sem match em postos, observacao "SEM CODIGO ADICIONAL"
        # → justificativa explicita
        # ------------------------------------------------------------------
        cur.execute(
            """
            SELECT id, codigo_ana
              FROM ana_revisao_estacao
             WHERE lote_id = %s
               AND status IN ('pendente', 'em_revisao')
               AND posto_id IS NULL
               AND resposta_fonte IS NULL
               AND (
                 observacao_1 ILIKE '%%SEM O CODIGO ADICIONAL%%'
                 OR observacao_1 ILIKE '%%SEM O CÓDIGO ADICIONAL%%'
                 OR observacao_2 ILIKE '%%SEM O CODIGO ADICIONAL%%'
                 OR observacao_2 ILIKE '%%SEM O CÓDIGO ADICIONAL%%'
                 OR observacao_3 ILIKE '%%SEM O CODIGO ADICIONAL%%'
                 OR observacao_3 ILIKE '%%SEM O CÓDIGO ADICIONAL%%'
               )
            """,
            (lote_id,),
        )
        caso3 = cur.fetchall()
        print(f"Caso 3 (sem codigo adicional, sem match): {len(caso3)} estacoes")

        if not args.dry_run:
            for est_id, _ in caso3:
                cur.execute(
                    """
                    UPDATE ana_revisao_estacao
                       SET resposta_justificativa = %s,
                           resposta_fonte         = 'sem_correcao',
                           status                 = 'revisada',
                           revisado_em            = NOW(),
                           atualizado_em          = NOW()
                     WHERE id = %s
                    """,
                    (JUSTIF_SEM_COD_ADICIONAL, est_id),
                )
                cur.execute(
                    """
                    INSERT INTO ana_revisao_evento
                      (estacao_id, evento, ator_id, valores_depois, observacao)
                    VALUES (%s, 'corrigida_auto', NULL, %s::jsonb, %s)
                    """,
                    (
                        est_id,
                        json.dumps({
                            "origem": "preencher_resposta_orfas",
                            "resposta_fonte": "sem_correcao",
                        }),
                        JUSTIF_SEM_COD_ADICIONAL,
                    ),
                )

        if not args.dry_run:
            conn.commit()
        print()
        print(f"Total processadas: {len(caso1) + len(caso2) + len(caso3)}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
