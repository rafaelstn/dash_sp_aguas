"""Diagnóstico read-only: por que as 56 estações divergentes geo abertas
ainda têm divergência? O que falta?"""
from __future__ import annotations

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local")
DB_URL = os.environ["DATABASE_URL"]


def main() -> int:
    with psycopg.connect(DB_URL) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT id FROM ana_revisao_lote ORDER BY criado_em DESC LIMIT 1
        """)
        (lote_id,) = cur.fetchone()

        print("Categorização das 56 estações com divergência geo abertas:")
        print()

        cur.execute("""
            SELECT
              COUNT(*) FILTER (WHERE posto_id IS NULL)::int             AS sem_match,
              COUNT(*) FILTER (WHERE posto_id IS NOT NULL)::int         AS com_match,
              COUNT(*) FILTER (WHERE municipio_sugerido_codigo IS NOT NULL)::int AS com_sugestao_ibge,
              COUNT(*) FILTER (WHERE municipio_sugerido_codigo IS NULL)::int AS sem_sugestao_ibge,
              COUNT(*) FILTER (WHERE operando = true)::int              AS operando_sim,
              COUNT(*) FILTER (WHERE operando = false)::int             AS operando_nao
              FROM ana_revisao_estacao
             WHERE lote_id = %s
               AND divergencia_municipio = 'divergente'
               AND status IN ('pendente', 'em_revisao')
        """, (lote_id,))
        sm, cm, ci, si, op_s, op_n = cur.fetchone()
        print(f"  sem match em postos:        {sm}  (logo: sem coord 'correta' interna)")
        print(f"  com match em postos:        {cm}")
        print(f"  com sugestão IBGE de municipio: {ci}  (PostGIS achou município que contém o ponto)")
        print(f"  SEM sugestão IBGE:          {si}  (ponto está FORA de SP)")
        print(f"  operando=Sim (prioridade):  {op_s}")
        print(f"  operando=Não (baixa):       {op_n}")
        print()

        print("Amostra (10 primeiras), agrupando por situação:")
        print()
        print("--- Com match em postos (Bucket A já era para resolver) ---")
        cur.execute("""
            SELECT e.codigo_ana, e.nome, e.municipio_nome,
                   p.prefixo, p.latitude::text, p.longitude::text,
                   e.latitude::text, e.longitude::text,
                   e.divergencia_municipio, e.municipio_sugerido_nome
              FROM ana_revisao_estacao e
              JOIN postos p ON p.id = e.posto_id
             WHERE e.lote_id = %s
               AND e.divergencia_municipio = 'divergente'
               AND e.status IN ('pendente', 'em_revisao')
             LIMIT 5
        """, (lote_id,))
        for r in cur.fetchall():
            print(f"  {r[0]} {r[1][:30]:30} mun ANA={r[2][:20] if r[2] else '?':20}")
            print(f"      posto {r[3]} coord postos=({r[4]},{r[5]}) coord ANA=({r[6]},{r[7]})")
            print(f"      sug IBGE: {r[9]}")
        print()

        print("--- Sem match em postos, com sugestão IBGE ---")
        cur.execute("""
            SELECT codigo_ana, nome, municipio_nome,
                   latitude::text, longitude::text,
                   municipio_sugerido_nome, operando
              FROM ana_revisao_estacao
             WHERE lote_id = %s
               AND divergencia_municipio = 'divergente'
               AND status IN ('pendente', 'em_revisao')
               AND posto_id IS NULL
               AND municipio_sugerido_codigo IS NOT NULL
             LIMIT 5
        """, (lote_id,))
        for r in cur.fetchall():
            print(f"  {r[0]} {r[1][:30] if r[1] else '?':30} ANA diz '{r[2]}' coord=({r[3]},{r[4]})")
            print(f"      IBGE diz: ponto está em '{r[5]}' (operando={r[6]})")
        print()

        print("--- Sem match e sem sugestão IBGE (ponto FORA de SP) ---")
        cur.execute("""
            SELECT codigo_ana, nome, municipio_nome,
                   latitude::text, longitude::text, operando, observacao_1
              FROM ana_revisao_estacao
             WHERE lote_id = %s
               AND divergencia_municipio = 'divergente'
               AND status IN ('pendente', 'em_revisao')
               AND posto_id IS NULL
               AND municipio_sugerido_codigo IS NULL
             LIMIT 5
        """, (lote_id,))
        for r in cur.fetchall():
            obs = (r[6] or '')[:50]
            print(f"  {r[0]} {(r[1] or '?')[:30]:30} ANA diz '{r[2]}' coord=({r[3]},{r[4]}) op={r[5]}")
            print(f"      obs: {obs}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
