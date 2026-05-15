"""Fecha as 24 estacoes restantes:

  Cenario I: CODIGO ADICIONAL DUPLICADO COM OUTRA ESTACAO + ESTACAO DUPLICADA (23)
    - Marca como revisada com justificativa: "Confirmada no inventario SPAguas;
      duplicidade do codigo adicional reconhecida e em analise interna."

  Cenario J: [TELEMETRIA] SEM DATA FIM, POREM OPERANDO NAO (1, com match)
    - Mesma logica do pluviometro: copia operacao_fim_ano para ana_telemetria_fim
      em postos.

Audit completo.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/fechar_24_restantes.py [--dry-run]
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

    print("=== Fechar 24 restantes ===")
    print(f"  dry-run: {args.dry_run}")
    print()

    with psycopg.connect(DB_URL, prepare_threshold=None) as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM ana_revisao_lote ORDER BY criado_em DESC LIMIT 1")
        (lote_id,) = cur.fetchone()

        # CENARIO I: duplicidade reconhecida
        cur.execute(
            """
            SELECT id, posto_id IS NOT NULL AS tem_match
              FROM ana_revisao_estacao
             WHERE lote_id = %s
               AND status IN ('pendente','em_revisao')
               AND resposta_fonte IS NULL
               AND (observacao_1 ILIKE %s
                    OR observacao_2 ILIKE %s
                    OR observacao_1 ILIKE %s
                    OR observacao_2 ILIKE %s)
            """,
            (lote_id,
             "%C%DIGO ADICIONAL DUPLICADO%",
             "%ESTA%%O DUPLICADA%",
             "%CODIGO ADICIONAL DUPLICADO%",
             "%ESTACAO DUPLICADA%"),
        )
        ids = [r[0] for r in cur.fetchall()]
        print(f"I) Codigo adicional duplicado: {len(ids)}")
        justI = (
            "Estacao confirmada no inventario SPAguas. Duplicidade do codigo "
            "adicional reconhecida no inventario ANA; tratamento da duplicidade "
            "do codigo permanece sob analise interna SPAguas. As estacoes "
            "permanecem como entidades distintas com historico proprio."
        )
        if not args.dry_run and ids:
            cur.execute(
                """
                UPDATE ana_revisao_estacao
                   SET status                 = 'revisada',
                       resposta_justificativa = %s,
                       resposta_fonte         = 'manual_aprovador',
                       revisado_em            = NOW(),
                       atualizado_em          = NOW()
                 WHERE id = ANY(%s::uuid[])
                """,
                (justI, ids),
            )
            cur.executemany(
                """
                INSERT INTO ana_revisao_evento
                  (estacao_id, evento, ator_id, valores_depois, observacao)
                VALUES (%s, 'corrigida_auto', NULL, %s::jsonb, %s)
                """,
                [
                    (
                        eid,
                        json.dumps({"origem": "fechar_24_restantes", "cenario": "I_duplicidade"}),
                        justI,
                    )
                    for eid in ids
                ],
            )

        # CENARIO J: telemetria sem data fim (analogo ao pluviometro)
        cur.execute(
            """
            SELECT e.id, e.posto_id, p.operacao_fim_ano, p.ana_telemetria_fim
              FROM ana_revisao_estacao e
              JOIN postos p ON p.id = e.posto_id AND p.deleted_at IS NULL
             WHERE e.lote_id = %s
               AND e.status IN ('pendente','em_revisao')
               AND e.resposta_fonte IS NULL
               AND e.observacao_1 ILIKE %s
               AND p.operacao_fim_ano IS NOT NULL
               AND p.operacao_fim_ano > 0
            """,
            (lote_id, "%TELEMETRIA%SEM DATA FIM%"),
        )
        j = cur.fetchall()
        print(f"J) Telemetria sem data fim, com match: {len(j)}")
        justJ = (
            "Estacao desativada. Data de fim da telemetria preenchida com 31/12 "
            "do ultimo ano de operacao registrado no banco SPAguas."
        )
        if not args.dry_run:
            for est_id, posto_id, fim_ano, antiga in j:
                cur.execute(
                    """
                    UPDATE postos
                       SET ana_telemetria_fim = MAKE_DATE(%s, 12, 31),
                           updated_at         = NOW()
                     WHERE id = %s
                    """,
                    (fim_ano, posto_id),
                )
                cur.execute(
                    """
                    INSERT INTO postos_evento
                      (posto_id, evento, ator_id, valores_antes, valores_depois,
                       origem_evento, observacao)
                    VALUES (%s, 'atualizado', NULL, %s::jsonb, %s::jsonb,
                            'fechar_24_restantes', %s)
                    """,
                    (
                        posto_id,
                        json.dumps({"ana_telemetria_fim": str(antiga) if antiga else None}),
                        json.dumps({"ana_telemetria_fim": f"{fim_ano}-12-31"}),
                        "Preenchida data fim da telemetria com base no ano de fim de operacao do banco SPAguas (resposta ANA).",
                    ),
                )
                cur.execute(
                    """
                    UPDATE ana_revisao_estacao
                       SET status                 = 'revisada',
                           resposta_justificativa = %s,
                           resposta_fonte         = 'banco_spaguas',
                           revisado_em            = NOW(),
                           atualizado_em          = NOW()
                     WHERE id = %s
                    """,
                    (justJ, est_id),
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
                            "origem": "fechar_24_restantes",
                            "cenario": "J_telemetria_sem_data_fim",
                            "ana_telemetria_fim": f"{fim_ano}-12-31",
                        }),
                        justJ,
                    ),
                )

        if not args.dry_run:
            conn.commit()

        print()
        total = len(ids) + len(j)
        print(f"Total fechado: {total}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
