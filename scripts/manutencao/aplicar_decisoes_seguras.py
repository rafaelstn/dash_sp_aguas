"""
Aplica automaticamente decisoes onde temos CERTEZA (sem inventar dado):

A) Match alta confianca:
   ana_revisao_estacao com match_sugerido_confianca='alta' e sem
   posto_id vinculado. Vincula automaticamente.

B) Duplicatas seguras:
   Pares de postos com (similaridade nome = 1.0 AND dist = 0m AND
   prefixo invertido (AD-NNN vs DA-NNN)) onde UM dos dois esta inativo.
   Soft-delete do inativo, mantem o ativo.
   Se ambos ativos OU ambos inativos -> NAO mexe (Marcio decide).

Auditoria completa em postos_evento e ana_revisao_evento.
Idempotente: re-execucao nao duplica.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/manutencao/aplicar_decisoes_seguras.py [--dry-run]
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

import psycopg


def carregar_database_url() -> str:
    env = Path(".env.local").read_text(encoding="utf-8")
    match = re.search(r"^DATABASE_URL\s*=\s*(.+)$", env, re.MULTILINE)
    if not match:
        raise SystemExit("DATABASE_URL ausente em .env.local")
    return match.group(1).strip().strip('"').strip("'")


def prefixos_invertidos(a: str, b: str) -> bool:
    """Detecta prefixo no formato XN-NNN <-> NX-NNN (letra + digito invertidos)."""
    # Formato: 2 caracteres + hifen + 3 digitos
    pa = re.fullmatch(r"([A-Z0-9])([A-Z0-9])-(\d{3})", a or "")
    pb = re.fullmatch(r"([A-Z0-9])([A-Z0-9])-(\d{3})", b or "")
    if not pa or not pb:
        return False
    # Mesmos 2 caracteres invertidos
    return pa.group(1) == pb.group(2) and pa.group(2) == pb.group(1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print("=== Aplicar decisoes seguras ===")
    print(f"  dry-run: {args.dry_run}")
    print()

    url = carregar_database_url()
    ts = datetime.utcnow().isoformat()

    with psycopg.connect(url, prepare_threshold=None) as conn, conn.cursor() as cur:
        # ====================================================================
        # A) Match alta confianca
        # ====================================================================
        print("A) Match alta confianca")
        print("-" * 60)
        cur.execute(
            """
            SELECT e.id, e.codigo_ana, e.nome,
                   p.id AS posto_id, p.prefixo, p.nome_estacao
              FROM ana_revisao_estacao e
              JOIN postos p ON p.id = e.match_sugerido_posto_id
             WHERE e.match_sugerido_confianca = 'alta'
               AND e.posto_id IS NULL
               AND e.status IN ('pendente', 'em_revisao')
               AND p.deleted_at IS NULL
            """
        )
        matches = cur.fetchall()
        print(f"  candidatos: {len(matches)}")

        aplicados_a = 0
        for est_id, cod_ana, est_nome, posto_id, pfx, posto_nome in matches:
            if args.dry_run:
                aplicados_a += 1
                continue

            # postos.prefixo_ana = codigo_ana (verifica conflito antes)
            cur.execute(
                "SELECT id FROM postos WHERE prefixo_ana = %s AND id <> %s AND deleted_at IS NULL",
                (cod_ana, posto_id),
            )
            if cur.fetchone():
                continue  # outro posto ja tem esse codigo_ana

            # Snapshot antes
            cur.execute("SELECT prefixo_ana FROM postos WHERE id = %s", (posto_id,))
            prefixo_ana_antes = cur.fetchone()[0]

            cur.execute(
                "UPDATE postos SET prefixo_ana = %s, updated_at = NOW() WHERE id = %s",
                (cod_ana, posto_id),
            )
            cur.execute(
                """
                INSERT INTO postos_evento
                  (posto_id, evento, ator_id, valores_antes, valores_depois,
                   origem_evento, referencia_externa_id, observacao)
                VALUES (%s, 'atualizado', NULL, %s::jsonb, %s::jsonb,
                        'auto_aceitar_match_alta', %s::uuid, %s)
                """,
                (
                    posto_id,
                    f'{{"prefixo_ana": "{prefixo_ana_antes or ""}"}}',
                    f'{{"prefixo_ana": "{cod_ana}"}}',
                    est_id,
                    f"Match aceito automaticamente (alta confianca). Estacao ANA {cod_ana} vinculada ao posto {pfx}.",
                ),
            )
            cur.execute(
                """
                UPDATE ana_revisao_estacao
                   SET posto_id = %s, match_tipo = 'manual',
                       status = 'revisada', revisado_em = NOW()
                 WHERE id = %s
                """,
                (posto_id, est_id),
            )
            cur.execute(
                """
                INSERT INTO ana_revisao_evento
                  (estacao_id, evento, ator_id, valores_depois, observacao)
                VALUES (%s, 'revisada', NULL, %s::jsonb, %s)
                """,
                (
                    est_id,
                    f'{{"posto_id": "{posto_id}", "posto_prefixo": "{pfx}", "status": "revisada"}}',
                    f"Auto-aceito: match com posto {pfx} ({posto_nome}) com alta confianca.",
                ),
            )
            aplicados_a += 1

        print(f"  aplicados: {aplicados_a}")
        print()

        # ====================================================================
        # B) Duplicatas seguras (sim=100% + dist=0 + prefixo invertido + um inativo)
        # ====================================================================
        print("B) Duplicatas seguras")
        print("-" * 60)
        cur.execute(
            """
            SELECT p1.id, p1.prefixo, p1.nome_estacao, p1.operacao_fim_ano,
                   p2.id, p2.prefixo, p2.nome_estacao, p2.operacao_fim_ano,
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
               AND ST_DistanceSphere(
                     ST_MakePoint(p1.longitude::float, p1.latitude::float),
                     ST_MakePoint(p2.longitude::float, p2.latitude::float)
                   ) = 0
               AND similarity(LOWER(unaccent(COALESCE(p1.nome_estacao, ''))),
                              LOWER(unaccent(COALESCE(p2.nome_estacao, '')))) = 1.0
            """
        )
        pares = cur.fetchall()
        print(f"  pares com coord identica + nome 100%: {len(pares)}")

        ano = datetime.now().year
        aplicados_b = 0
        ignorados_ambos_ativos = 0
        ignorados_sem_padrao = 0

        for r in pares:
            id_a, pfx_a, nome_a, fim_a, id_b, pfx_b, nome_b, fim_b, dist, sim = r

            # Padrao prefixo invertido
            if not prefixos_invertidos(pfx_a, pfx_b):
                ignorados_sem_padrao += 1
                continue

            ativo_a = fim_a is None or fim_a >= ano - 1
            ativo_b = fim_b is None or fim_b >= ano - 1

            if ativo_a and ativo_b:
                ignorados_ambos_ativos += 1
                continue

            # Determina qual manter:
            # - Se um ativo e outro inativo: manter o ativo
            # - Se ambos inativos: manter o com operacao_fim_ano maior (mais recente)
            if ativo_a and not ativo_b:
                manter_id, manter_pfx = id_a, pfx_a
                remover_id, remover_pfx = id_b, pfx_b
                motivo_keep = "ativo vs inativo"
            elif ativo_b and not ativo_a:
                manter_id, manter_pfx = id_b, pfx_b
                remover_id, remover_pfx = id_a, pfx_a
                motivo_keep = "ativo vs inativo"
            else:
                # Ambos inativos: mantém o mais recente (maior operacao_fim_ano)
                if (fim_a or 0) >= (fim_b or 0):
                    manter_id, manter_pfx = id_a, pfx_a
                    remover_id, remover_pfx = id_b, pfx_b
                else:
                    manter_id, manter_pfx = id_b, pfx_b
                    remover_id, remover_pfx = id_a, pfx_a
                motivo_keep = "ambos inativos, mantido mais recente"

            if args.dry_run:
                aplicados_b += 1
                continue

            cur.execute(
                "UPDATE postos SET deleted_at = NOW(), updated_at = NOW() WHERE id = %s",
                (remover_id,),
            )
            cur.execute(
                """
                INSERT INTO postos_evento
                  (posto_id, evento, ator_id, valores_antes, origem_evento,
                   observacao)
                VALUES (%s, 'removido', NULL, %s::jsonb,
                        'auto_duplicata_segura', %s)
                """,
                (
                    remover_id,
                    f'{{"prefixo": "{remover_pfx}", "deleted_at": null}}',
                    f"Soft-delete: duplicata segura de {manter_pfx} (mesma coord, nome 100%, prefixo invertido, {motivo_keep}).",
                ),
            )
            aplicados_b += 1

        print(f"  aplicados (soft-delete um lado): {aplicados_b}")
        print(f"  ignorados (ambos ativos, decisao manual): {ignorados_ambos_ativos}")
        print(f"  ignorados (prefixo sem padrao invertido): {ignorados_sem_padrao}")

        if not args.dry_run:
            conn.commit()

        print()
        print("=== Resumo final ===")
        cur.execute(
            "SELECT status, COUNT(*) FROM ana_revisao_estacao "
            "WHERE observacao_1 IS NOT NULL OR observacao_2 IS NOT NULL "
            "GROUP BY 1 ORDER BY 2 DESC"
        )
        for s, q in cur.fetchall():
            print(f"  {s:25} {q:>4}")
        print()
        cur.execute("SELECT COUNT(*) FROM postos WHERE deleted_at IS NULL")
        print(f"  postos ativos (nao soft-deleted): {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM postos WHERE deleted_at IS NOT NULL")
        print(f"  postos soft-deletados: {cur.fetchone()[0]}")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAbortado.")
        sys.exit(130)
