"""Corrige em lote postos com prefixo_ana de 7 dígitos (falta zero à esquerda).

Regra (alinhada com supabase/migrations/0012_v_postos_desconformes.sql):
  prefixo_ana ~ '^[0-9]{7}$'  ->  faltando_zero_esquerda
  Correção: LPAD(prefixo_ana, 8, '0')

Pre-checks:
  - Sem conflito: nenhum posto ativo deve ter o valor zero-padded já em uso.
  - Apenas postos com deleted_at IS NULL.

Audit em postos_evento com origem_evento='corrigir_prefixo_ana_zero'.

Idempotente: re-execução não acha mais nada para corrigir.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/corrigir_prefixo_ana_zero_esquerda.py [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local")
DB_URL = os.environ["DATABASE_URL"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print("=== Corrigir prefixo_ana com zero a esquerda ===")
    print(f"  dry-run: {args.dry_run}")
    print()

    with psycopg.connect(DB_URL, prepare_threshold=None) as conn, conn.cursor() as cur:
        cur.execute(
            r"""
            SELECT a.id, a.prefixo, a.prefixo_ana, LPAD(a.prefixo_ana, 8, '0') AS novo
              FROM postos a
             WHERE a.prefixo_ana ~ '^[0-9]{7}$'
               AND a.deleted_at IS NULL
             ORDER BY a.prefixo
            """
        )
        alvos = cur.fetchall()
        print(f"Postos a corrigir: {len(alvos)}")
        if alvos[:3]:
            print("  amostra:")
            for p in alvos[:3]:
                print(f"    {p[1]}: {p[2]} -> {p[3]}")
        print()

        cur.execute(
            r"""
            SELECT a.prefixo, LPAD(a.prefixo_ana, 8, '0') AS novo, b.prefixo AS conflito_em
              FROM postos a
              JOIN postos b
                ON b.prefixo_ana = LPAD(a.prefixo_ana, 8, '0')
               AND b.id <> a.id
               AND b.deleted_at IS NULL
             WHERE a.prefixo_ana ~ '^[0-9]{7}$'
               AND a.deleted_at IS NULL
            """
        )
        conflitos = cur.fetchall()
        if conflitos:
            print(f"AVISO: {len(conflitos)} conflitos detectados (zero-padded ja em uso):")
            for c in conflitos:
                print(f"  {c[0]} novo={c[1]} ja_em_uso_por={c[2]}")
            print("Abortando.")
            return 2

        if args.dry_run:
            print(f"Dry-run: nao persistindo {len(alvos)} updates.")
            return 0

        for posto_id, prefixo, antigo, novo in alvos:
            cur.execute(
                """
                UPDATE postos
                   SET prefixo_ana = %s,
                       updated_at  = NOW()
                 WHERE id = %s
                """,
                (novo, posto_id),
            )
            cur.execute(
                """
                INSERT INTO postos_evento
                  (posto_id, evento, ator_id, valores_antes, valores_depois,
                   origem_evento, observacao)
                VALUES (%s, 'atualizado', NULL, %s::jsonb, %s::jsonb,
                        'corrigir_prefixo_ana_zero', %s)
                """,
                (
                    posto_id,
                    json.dumps({"prefixo_ana": antigo}),
                    json.dumps({"prefixo_ana": novo}),
                    "Preenchido zero a esquerda no prefixo ANA para atingir o padrao oficial de 8 digitos.",
                ),
            )

        conn.commit()
        print(f"Atualizados: {len(alvos)} postos.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
