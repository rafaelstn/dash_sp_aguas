"""Diagnóstico read-only do estado do Inventário ANA (Meta I.6 PROGESTÃO).

Mostra:
  - Lote atual + prazo
  - Contagem por status
  - Contagem por divergência geográfica
  - Quantas estações têm correção pendente em correcoes JSONB
  - Quantas com sugestão de match não aceita ainda
  - Quantas linhas vão sair pintadas de amarelo no export
"""
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
        print("=" * 70)
        print("DIAGNÓSTICO INVENTÁRIO ANA, Meta I.6 PROGESTÃO")
        print("=" * 70)

        cur.execute(
            """
            SELECT id, nome, prazo_resposta, criado_em
              FROM ana_revisao_lote
             ORDER BY criado_em DESC
             LIMIT 1
            """
        )
        lote = cur.fetchone()
        if not lote:
            print("Nenhum lote importado.")
            return 1
        lote_id, lote_nome, prazo, criado_em = lote
        print(f"Lote atual: {lote_nome}")
        print(f"Prazo ANA:  {prazo}")
        print(f"Criado em:  {criado_em}")
        print()

        cur.execute(
            """
            SELECT status, COUNT(*)::int
              FROM ana_revisao_estacao
             WHERE lote_id = %s
             GROUP BY status
             ORDER BY 2 DESC
            """,
            (lote_id,),
        )
        print("Distribuição por status:")
        total = 0
        rows = cur.fetchall()
        for status, n in rows:
            total += n
            print(f"  {status:<22} {n:>6}")
        print(f"  {'TOTAL':<22} {total:>6}")
        print()

        cur.execute(
            """
            SELECT divergencia_municipio, COUNT(*)::int
              FROM ana_revisao_estacao
             WHERE lote_id = %s
             GROUP BY divergencia_municipio
             ORDER BY 2 DESC
            """,
            (lote_id,),
        )
        print("Divergência geográfica (todas as estações):")
        for div, n in cur.fetchall():
            print(f"  {str(div):<22} {n:>6}")
        print()

        cur.execute(
            """
            SELECT
              COUNT(*) FILTER (WHERE status IN ('pendente','em_revisao'))::int AS abertas,
              COUNT(*) FILTER (WHERE operando = true AND status IN ('pendente','em_revisao'))::int AS operando_abertas,
              COUNT(*) FILTER (WHERE posto_id IS NULL AND status IN ('pendente','em_revisao'))::int AS sem_match_abertas,
              COUNT(*) FILTER (WHERE divergencia_municipio = 'divergente' AND status IN ('pendente','em_revisao'))::int AS div_geo_abertas
              FROM ana_revisao_estacao
             WHERE lote_id = %s
            """,
            (lote_id,),
        )
        abertas, op_ab, sm_ab, dg_ab = cur.fetchone()
        print("Filas abertas (pendente + em_revisao):")
        print(f"  total abertas:           {abertas}")
        print(f"  com operando=Sim:        {op_ab}   <- prioridade ANA")
        print(f"  sem match com postos:    {sm_ab}")
        print(f"  divergência geo >=10km:  {dg_ab}")
        print()

        cur.execute(
            """
            SELECT COUNT(*)::int
              FROM ana_revisao_estacao e
              LEFT JOIN postos p ON p.id = e.posto_id AND p.deleted_at IS NULL
             WHERE e.lote_id = %s
               AND (
                 (p.nome_estacao IS NOT NULL AND p.nome_estacao IS DISTINCT FROM e.nome)
                 OR (p.latitude::text IS DISTINCT FROM e.latitude::text)
                 OR (p.longitude::text IS DISTINCT FROM e.longitude::text)
                 OR (p.municipio IS DISTINCT FROM e.municipio_nome)
               )
            """,
            (lote_id,),
        )
        (linhas_amarelas,) = cur.fetchone()
        print(f"Linhas que sairão com células AMARELAS no XLSX: {linhas_amarelas}")
        print()

        cur.execute(
            """
            SELECT
              COUNT(*) FILTER (WHERE status IN ('pendente','em_revisao')
                              AND (observacao_1 IS NOT NULL OR observacao_2 IS NOT NULL))::int AS pend_com_obs,
              COUNT(*) FILTER (WHERE status IN ('pendente','em_revisao')
                              AND observacao_1 IS NULL AND observacao_2 IS NULL)::int          AS pend_sem_obs,
              COUNT(*) FILTER (WHERE resposta_fonte IS NOT NULL)::int                          AS com_resposta
              FROM ana_revisao_estacao
             WHERE lote_id = %s
            """,
            (lote_id,),
        )
        pend_com_obs, pend_sem_obs, com_resposta = cur.fetchone()
        print("Detalhamento de pendências:")
        print(f"  abertas COM observação ANA:  {pend_com_obs}  <- realmente precisam revisão")
        print(f"  abertas SEM observação ANA:  {pend_sem_obs}  <- podem fechar como confirmadas")
        print(f"  com resposta SPÁguas gravada:{com_resposta}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
