"""
Promove correcoes da tabela ana_revisao_estacao para a tabela postos.

Contexto (decisao Rafael 2026-05-14):
  postos eh a FONTE UNICA da verdade. ANA eh auditor externo que apontou
  erros que estao na propria postos. Correcoes propostas em
  ana_revisao_estacao.correcoes JSONB precisam ir DIRETO para postos.

Pipeline:
  Para cada estacao ANA com correcoes preenchidas (latitude, longitude,
  municipio_nome, ana_*_fim) e posto_id IS NOT NULL:
    1. Le posto atual (snapshot pro audit)
    2. UPDATE postos aplicando as correcoes (apenas campos presentes)
    3. INSERT postos_evento com origem 'promovido_de_ana_revisao' e
       referencia_externa_id = ana_revisao_estacao.id
    4. UPDATE ana_revisao_estacao SET status = 'promovida_a_posto'

Para estacoes sem posto_id (274 sem match): criadas como posto novo
com origem 'ana_promocao_automatica'. Marcio pode editar depois.

Idempotente:
  - Reaplicar nao duplica eventos (filtra por status='promovida_a_posto').
  - --dry-run mostra preview sem persistir.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import psycopg


# Mapeamento campo JSONB correcoes -> coluna postos
MAP_CORRECAO_PARA_POSTO = {
    "latitude": "latitude",
    "longitude": "longitude",
    "municipio_nome": "municipio",
    "rio_nome": None,  # postos.rio? checa abaixo se existir
    "subbacia_nome": "sub_ugrhi_nome",
    "escala_fim": "ana_escala_fim",
    "descarga_liquida_fim": "ana_descarga_liquida_fim",
    "sedimentos_fim": "ana_sedimentos_fim",
    "qualidade_fim": "ana_qualidade_fim",
    "pluviometro_fim": "ana_pluviometro_fim",
    "telemetria_fim": "ana_telemetria_fim",
    "pluviometro_fim_sugerido": "ana_pluviometro_fim",
    "codigo_adicional": "prefixo_ana",  # CUIDADO: prefixo_ana eh o codigo ANA na verdade
}

# Campos das correcoes que SAO datas (precisa ::date no UPDATE)
CAMPOS_DATA = {
    "ana_escala_fim", "ana_descarga_liquida_fim", "ana_sedimentos_fim",
    "ana_qualidade_fim", "ana_pluviometro_fim", "ana_telemetria_fim",
}


class JsonEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, (datetime, date)):
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


def extrair_correcoes_aplicaveis(correcoes: dict) -> dict:
    """Filtra correcoes JSONB pra somente as que mapeam pra postos.
    Ignora chaves de metadado (fonte_correcao, aplicado_em, etc) e
    sugestoes_baixa_confianca."""
    out = {}
    for chave, valor in correcoes.items():
        if chave in ("fonte_correcao", "aplicado_em",
                      "municipio_sugerido_baixa_confianca",
                      "municipio_sugerido_dist_km",
                      "distancia_municipio_proximo_km",
                      "municipio_codigo_ibge"):
            continue
        coluna = MAP_CORRECAO_PARA_POSTO.get(chave)
        if coluna is None:
            continue
        if valor is None or valor == "":
            continue
        out[coluna] = valor
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--criar-postos-novos", action="store_true",
                    help="Cria posto novo para estacoes ANA sem match. Default: nao cria.")
    args = ap.parse_args()

    print("=== Promover correcoes ANA -> postos ===")
    print(f"  dry-run: {args.dry_run}")
    print(f"  criar postos novos: {args.criar_postos_novos}")
    print()

    url = carregar_database_url()

    with psycopg.connect(url, prepare_threshold=None) as conn, conn.cursor() as cur:
        # ====================================================================
        # Bloco 1: promover correcoes em estacoes COM match em postos
        # ====================================================================
        cur.execute(
            """
            SELECT e.id, e.codigo_ana, e.nome, e.correcoes,
                   e.posto_id, p.prefixo
              FROM ana_revisao_estacao e
              JOIN postos p ON p.id = e.posto_id
             WHERE e.correcoes <> '{}'::jsonb
               AND e.status IN ('em_revisao', 'revisada')
               AND e.status <> 'promovida_a_posto'
               AND p.deleted_at IS NULL
            """
        )
        candidatas = cur.fetchall()
        print(f"Candidatas (com match em postos): {len(candidatas)}")

        promovidas = 0
        ignoradas = 0
        for row in candidatas:
            est_id, cod_ana, est_nome, correcoes, posto_id, prefixo = row
            aplicaveis = extrair_correcoes_aplicaveis(correcoes or {})
            if not aplicaveis:
                ignoradas += 1
                continue

            if args.dry_run:
                promovidas += 1
                continue

            # Snapshot do posto antes
            cur.execute(
                f"""
                SELECT {', '.join(aplicaveis.keys())}
                  FROM postos WHERE id = %s
                """,
                (posto_id,),
            )
            antes_row = cur.fetchone()
            valores_antes = dict(zip(aplicaveis.keys(), antes_row))

            # Monta UPDATE dinamico
            set_parts = []
            params = []
            for col, val in aplicaveis.items():
                if col in CAMPOS_DATA:
                    set_parts.append(f"{col} = %s::date")
                else:
                    set_parts.append(f"{col} = %s")
                params.append(val)
            params.append(posto_id)

            cur.execute(
                f"""
                UPDATE postos
                   SET {', '.join(set_parts)},
                       updated_at = NOW(),
                       origem = COALESCE(origem, 'ana_promocao_automatica')
                 WHERE id = %s
                """,
                params,
            )

            # Audit
            cur.execute(
                """
                INSERT INTO postos_evento
                  (posto_id, evento, ator_id, valores_antes, valores_depois,
                   origem_evento, referencia_externa_id, observacao)
                VALUES (
                  %s, 'promovido_de_ana_revisao', NULL,
                  %s::jsonb, %s::jsonb,
                  'ana_promocao_automatica', %s::uuid,
                  %s
                )
                """,
                (
                    posto_id,
                    dumps(valores_antes),
                    dumps(aplicaveis),
                    est_id,
                    f"Promovido de ana_revisao_estacao {cod_ana} ({est_nome}). "
                    f"Posto {prefixo}.",
                ),
            )

            # Marca estacao como promovida
            cur.execute(
                """
                UPDATE ana_revisao_estacao
                   SET status = 'promovida_a_posto',
                       revisado_em = NOW()
                 WHERE id = %s
                """,
                (est_id,),
            )

            promovidas += 1

        print(f"  promovidas: {promovidas}")
        print(f"  ignoradas (correcoes sem mapeamento util): {ignoradas}")
        print()

        # ====================================================================
        # Bloco 2: criar postos novos para sem-match (opcional)
        # ====================================================================
        if args.criar_postos_novos:
            print("Bloco 2: criando postos novos para estacoes ANA sem match")
            print("-" * 60)
            cur.execute(
                """
                SELECT id, codigo_ana, codigo_adicional, nome, latitude, longitude,
                       municipio_nome, bacia_nome, subbacia_nome, rio_nome,
                       estacao_tipo, altitude
                  FROM ana_revisao_estacao
                 WHERE posto_id IS NULL
                   AND status IN ('em_revisao', 'pendente')
                """
            )
            sem_match = cur.fetchall()
            print(f"  candidatas (sem match): {len(sem_match)}")

            criados = 0
            if not args.dry_run:
                for row in sem_match:
                    (est_id, cod_ana, cod_adic, nome, lat, lng, mun, bacia,
                     subbacia, rio, tipo, alt) = row

                    # Prefixo: usa codigo adicional se houver, senao ANA_<codigo>
                    prefixo = cod_adic or f"ANA-{cod_ana}"

                    # Checa se prefixo ja existe (evita conflito)
                    cur.execute(
                        "SELECT 1 FROM postos WHERE prefixo = %s LIMIT 1",
                        (prefixo,),
                    )
                    if cur.fetchone():
                        continue

                    cur.execute(
                        """
                        INSERT INTO postos
                          (prefixo, prefixo_ana, nome_estacao,
                           latitude, longitude, municipio,
                           bacia_hidrografica, sub_ugrhi_nome, tipo_posto,
                           altimetria, origem)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'ana_promocao_automatica')
                        RETURNING id
                        """,
                        (prefixo, cod_ana, nome, lat, lng, mun,
                         bacia, subbacia, tipo, alt),
                    )
                    novo_id = cur.fetchone()[0]

                    # Liga estacao ANA ao novo posto
                    cur.execute(
                        """
                        UPDATE ana_revisao_estacao
                           SET posto_id = %s,
                               match_tipo = 'manual',
                               status = 'promovida_a_posto',
                               revisado_em = NOW()
                         WHERE id = %s
                        """,
                        (novo_id, est_id),
                    )

                    cur.execute(
                        """
                        INSERT INTO postos_evento
                          (posto_id, evento, ator_id, valores_depois,
                           origem_evento, referencia_externa_id, observacao)
                        VALUES (
                          %s, 'criado', NULL, %s::jsonb,
                          'ana_promocao_automatica', %s::uuid,
                          %s
                        )
                        """,
                        (novo_id, dumps({"prefixo": prefixo, "codigo_ana": cod_ana}),
                         est_id, f"Posto criado a partir de inventario ANA {cod_ana}"),
                    )
                    criados += 1
            print(f"  postos criados: {criados}")
            print()

        if not args.dry_run:
            conn.commit()

        # Resumo
        cur.execute(
            """SELECT status, COUNT(*) FROM ana_revisao_estacao
               WHERE correcoes <> '{}'::jsonb
               GROUP BY 1 ORDER BY 1"""
        )
        print("=== ana_revisao_estacao (status para estacoes com correcao) ===")
        for s, c in cur.fetchall():
            print(f"  {s}: {c}")
        print()
        cur.execute("SELECT COUNT(*) FROM postos_evento WHERE evento = 'promovido_de_ana_revisao'")
        print(f"eventos postos_evento (promovido_de_ana_revisao): {cur.fetchone()[0]}")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAbortado.")
        sys.exit(130)
