"""
Importador one-shot do CSV oficial SPÁguas para o PostgreSQL.

Fluxo (ver architecture.md §7):
  1. Calcula hash do arquivo e abre import_log em status 'em_andamento'.
  2. Varre o CSV em memória e detecta prefixos duplicados na FONTE.
  3. Se houver duplicados: grava erros_amostra em import_log, status='erro', aborta.
  4. Caso contrário: aplica UPSERT (ON CONFLICT ON prefixo DO UPDATE) linha a linha.
  5. Fecha import_log em status 'ok' com totais.

Nota (v1.2 — 22/04/2026): a coluna `busca_tsv` de `postos` passou a incluir
o `prefixo_ana` (forma original) e sua forma paddada a 8 dígitos via LPAD
(migration 0014). Isso permite que o técnico encontre um posto mesmo que
digite o ANA com ou sem o zero à esquerda. O importer não precisou mudar:
a coluna é GENERATED ALWAYS STORED e recalcula automaticamente a cada UPSERT.

Uso:
  python import_csv.py [--csv PATH]

Variáveis de ambiente (pode vir de .env.local via python-dotenv):
  DATABASE_URL_IMPORTER   conn string com permissão de escrita em postos e import_log
  IMPORTER_CSV_PATH       caminho do CSV, se --csv não for passado
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any
from uuid import uuid4

import psycopg
import structlog
from dotenv import load_dotenv

log = structlog.get_logger(__name__)

# Mapeamento coluna_csv -> coluna_tabela
MAPA_COLUNAS: dict[str, str] = {
    "PREFIXO": "prefixo",
    "MANTENEDOR": "mantenedor",
    "PREFIXO AN": "prefixo_ana",
    "NOME DA ES": "nome_estacao",
    "DE": "operacao_inicio_ano",
    "ATE": "operacao_fim_ano",
    "LATITUDE": "latitude",
    "LONGITUDE": "longitude",
    "MUNICIPIO": "municipio",
    "MUNICIPI_1": "municipio_alt",
    "BACIA HIDR": "bacia_hidrografica",
    "Nome UGHRI": "ugrhi_nome",
    "N_UGRHI": "ugrhi_numero",
    "Nome SUBUG": "sub_ugrhi_nome",
    "N_SUBUGRHI": "sub_ugrhi_numero",
    "REDE": "rede",
    "PROPRIETAR": "proprietario",
    "TIPO DE PO": "tipo_posto",
    "AREA (Km2)": "area_km2",
    "BTL": "btl",
    "cia_amb": "cia_ambiental",
    "COBACIA": "cobacia",
    "OBS": "observacoes",
    "TEMPO DE T": "tempo_transmissao",
    "STATUS PCD": "status_pcd",
    "ULTIMA TRA": "ultima_transmissao",
    "CONVENCION": "convencional",
    "LOGGER": "logger_eqp",
    "TELEMETRIC": "telemetrico",
    "NIVEL": "nivel",
    "VAZAO": "vazao",
    "FICHA DE INSPECAO": "ficha_inspecao",
    "ULTIMA DATA FI": "ultima_data_fi",
    "FICHA DESCRITIVA": "ficha_descritiva",
    "ULTIMA_ATUALIZACAO_FD": "ultima_atualizacao_fd",
    "AQUIFERO": "aquifero",
    "ALTIMETRIA": "altimetria",
}

CAMPOS_NUMERICOS_INT = {"operacao_inicio_ano", "operacao_fim_ano"}
CAMPOS_NUMERICOS_FLOAT = {"latitude", "longitude", "area_km2", "altimetria"}

ERR_PREFIXO_DUPLICADO = 2
ERR_CSV_INEXISTENTE = 3
ERR_DB = 4


def _hash_arquivo(caminho: Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(65536), b""):
            h.update(bloco)
    return h.hexdigest()


def _normalizar_valor(campo: str, valor: str | None) -> Any:
    """Converte string crua do CSV para o tipo adequado.
    - vazio/whitespace -> None
    - inteiros parseáveis quando campo é int
    - floats parseáveis (aceita vírgula) quando campo é float
    - demais: string aparada
    """
    if valor is None:
        return None
    v = valor.strip()
    if v == "":
        return None
    if campo in CAMPOS_NUMERICOS_INT:
        try:
            return int(float(v.replace(",", ".")))
        except ValueError:
            return None
    if campo in CAMPOS_NUMERICOS_FLOAT:
        try:
            return float(v.replace(",", "."))
        except ValueError:
            return None
    return v


def _ler_csv(caminho: Path) -> list[dict[str, Any]]:
    # Tenta utf-8, cai para latin-1 (common em planilhas governo exportadas do Excel).
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            with caminho.open(newline="", encoding=encoding) as f:
                leitor = csv.DictReader(f, delimiter=",")
                registros = list(leitor)
            return registros
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"Não foi possível decodificar {caminho} em utf-8 nem latin-1")


def _mapear_linha(raw: dict[str, str]) -> dict[str, Any]:
    saida: dict[str, Any] = {}
    for csv_col, tabela_col in MAPA_COLUNAS.items():
        valor = raw.get(csv_col)
        saida[tabela_col] = _normalizar_valor(tabela_col, valor)
    return saida


def _detectar_prefixos_duplicados(linhas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grupos: dict[str, list[int]] = defaultdict(list)
    for idx, linha in enumerate(linhas, start=2):  # linha 1 é header
        prefixo = linha.get("prefixo")
        if prefixo:
            grupos[prefixo].append(idx)
    return [
        {"prefixo": p, "linhas_csv": ls}
        for p, ls in grupos.items()
        if len(ls) > 1
    ]


def _colunas_upsert() -> tuple[str, str, str]:
    colunas = list(MAPA_COLUNAS.values())
    lista = ", ".join(colunas)
    placeholders = ", ".join(f"%({c})s" for c in colunas)
    update = ", ".join(f"{c} = EXCLUDED.{c}" for c in colunas if c != "prefixo")
    return lista, placeholders, update


def executar(caminho_csv: Path, conn_str: str) -> int:
    if not caminho_csv.exists():
        log.error("csv_inexistente", caminho=str(caminho_csv))
        return ERR_CSV_INEXISTENTE

    hash_arquivo = _hash_arquivo(caminho_csv)
    linhas_raw = _ler_csv(caminho_csv)
    log.info("csv_lido", total_linhas=len(linhas_raw), hash=hash_arquivo[:10])

    linhas = [_mapear_linha(r) for r in linhas_raw]
    sem_prefixo = [
        {"linha_csv": i, "motivo": "prefixo ausente"}
        for i, linha in enumerate(linhas, start=2)
        if not linha.get("prefixo")
    ]
    linhas_validas = [l for l in linhas if l.get("prefixo")]

    duplicados = _detectar_prefixos_duplicados(linhas_validas)

    lista, placeholders, update = _colunas_upsert()
    sql_upsert = (
        f"INSERT INTO postos ({lista}) VALUES ({placeholders}) "
        f"ON CONFLICT (prefixo) DO UPDATE SET {update}, updated_at = NOW() "
        f"RETURNING (xmax = 0) AS inserted"
    )

    log_id = str(uuid4())

    with psycopg.connect(conn_str) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO import_log (id, arquivo_origem, hash_arquivo, status) "
                "VALUES (%s, %s, %s, 'em_andamento')",
                (log_id, str(caminho_csv), hash_arquivo),
            )
            conn.commit()

            if duplicados:
                amostra = {
                    "prefixos_duplicados": duplicados[:50],
                    "total_duplicados": len(duplicados),
                    "linhas_sem_prefixo": sem_prefixo[:20],
                }
                cur.execute(
                    "UPDATE import_log SET finalizado_em = NOW(), linhas_lidas = %s, "
                    "linhas_rejeitadas = %s, erros_amostra = %s::jsonb, status = 'erro' "
                    "WHERE id = %s",
                    (
                        len(linhas_raw),
                        len(sem_prefixo) + sum(len(d["linhas_csv"]) for d in duplicados),
                        json.dumps(amostra, ensure_ascii=False),
                        log_id,
                    ),
                )
                conn.commit()
                log.error(
                    "abortando_por_duplicados",
                    total=len(duplicados),
                    amostra=duplicados[:5],
                )
                return ERR_PREFIXO_DUPLICADO

            inseridas = 0
            atualizadas = 0
            rejeitadas_runtime: list[dict[str, Any]] = []

            for i, linha in enumerate(linhas_validas, start=1):
                try:
                    cur.execute(sql_upsert, linha)
                    row = cur.fetchone()
                    if row and row[0]:
                        inseridas += 1
                    else:
                        atualizadas += 1
                except psycopg.Error as e:
                    rejeitadas_runtime.append(
                        {"prefixo": linha.get("prefixo"), "erro": str(e)}
                    )
                    conn.rollback()

            conn.commit()

            cur.execute(
                "UPDATE import_log SET finalizado_em = NOW(), linhas_lidas = %s, "
                "linhas_inseridas = %s, linhas_atualizadas = %s, linhas_rejeitadas = %s, "
                "erros_amostra = %s::jsonb, status = 'ok' WHERE id = %s",
                (
                    len(linhas_raw),
                    inseridas,
                    atualizadas,
                    len(sem_prefixo) + len(rejeitadas_runtime),
                    json.dumps(
                        {
                            "sem_prefixo": sem_prefixo[:20],
                            "rejeitadas_runtime": rejeitadas_runtime[:20],
                        },
                        ensure_ascii=False,
                    ),
                    log_id,
                ),
            )
            conn.commit()

            log.info(
                "importacao_concluida",
                lidas=len(linhas_raw),
                inseridas=inseridas,
                atualizadas=atualizadas,
                rejeitadas=len(sem_prefixo) + len(rejeitadas_runtime),
            )
            return 0


def main() -> int:
    load_dotenv(".env.local")
    load_dotenv(".env")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", default=os.environ.get("IMPORTER_CSV_PATH"))
    args = parser.parse_args()

    caminho = args.csv
    if not caminho:
        print("erro: informe --csv ou defina IMPORTER_CSV_PATH no .env.local", file=sys.stderr)
        return 1

    conn_str = os.environ.get("DATABASE_URL_IMPORTER") or os.environ.get("DATABASE_URL")
    if not conn_str:
        print("erro: defina DATABASE_URL_IMPORTER (ou DATABASE_URL) no .env.local", file=sys.stderr)
        return 1

    return executar(Path(caminho), conn_str)


if __name__ == "__main__":
    raise SystemExit(main())
