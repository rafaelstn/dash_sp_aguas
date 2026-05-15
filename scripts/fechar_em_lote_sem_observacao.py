"""Fecha em lote estações ANA sem observação (a ANA não apontou problema).

Critério: status pendente/em_revisao + observacao_1, _2 e _3 todos NULL.

Para essas, a resposta é "confirmação sem alteração": o inventário ANA
bate com o nosso (ou com a snapshot quando não temos match), e a ANA
não pediu correção. Status vira 'revisada', justificativa padrão e
fonte=sem_correcao.

Idempotente. Audit em ana_revisao_evento.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/fechar_em_lote_sem_observacao.py [--dry-run]
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

JUSTIF = (
    "Inventario ANA conferido. A ANA nao apontou observacao para esta "
    "estacao no ciclo PROGESTAO 3 (2026). Dados confirmados."
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print(f"=== Fechar em lote: estacoes sem observacao ANA ===")
    print(f"  dry-run: {args.dry_run}")
    print()

    with psycopg.connect(DB_URL, prepare_threshold=None) as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM ana_revisao_lote ORDER BY criado_em DESC LIMIT 1")
        (lote_id,) = cur.fetchone()

        cur.execute(
            """
            SELECT id FROM ana_revisao_estacao
             WHERE lote_id = %s
               AND status IN ('pendente', 'em_revisao')
               AND observacao_1 IS NULL
               AND observacao_2 IS NULL
               AND observacao_3 IS NULL
               AND resposta_fonte IS NULL
            """,
            (lote_id,),
        )
        ids = [r[0] for r in cur.fetchall()]
        print(f"Alvos: {len(ids)} estacoes")

        if args.dry_run or not ids:
            return 0

        cur.execute(
            """
            UPDATE ana_revisao_estacao
               SET status                 = 'revisada',
                   resposta_justificativa = %s,
                   resposta_fonte         = 'sem_correcao',
                   revisado_em            = NOW(),
                   atualizado_em          = NOW()
             WHERE id = ANY(%s::uuid[])
            """,
            (JUSTIF, ids),
        )
        print(f"  Atualizadas: {cur.rowcount}")

        cur.executemany(
            """
            INSERT INTO ana_revisao_evento
              (estacao_id, evento, ator_id, valores_depois, observacao)
            VALUES (%s, 'corrigida_auto', NULL, %s::jsonb, %s)
            """,
            [
                (
                    eid,
                    json.dumps({
                        "origem": "fechar_em_lote_sem_observacao",
                        "resposta_fonte": "sem_correcao",
                    }),
                    JUSTIF,
                )
                for eid in ids
            ],
        )

        conn.commit()
        print(f"  Eventos audit: {len(ids)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
