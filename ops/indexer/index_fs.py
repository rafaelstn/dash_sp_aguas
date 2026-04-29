"""
Worker de indexação do HD de rede SPÁguas — **sweep completo** (v1.5).

Esta é a modalidade de sweep batch (usada em carga inicial e em Fase 2, sweep
noturno). Para indexação on-demand por posto, ver `indexar_posto.py`.

Toda a engine de classificação (regex, parsers, pastas especiais, carga de
catálogos, mapa CTHDOC) foi extraída para `classificador.py`. Este módulo
responde apenas por:

  - Varredura recursiva da raiz (`_varrer`).
  - Persistência em chunks via UPSERT em `arquivos_indexados` / `arquivos_orfaos`.
  - Escrita do `indexacao_log` (escopo='sweep').
  - Purga de registros órfãos de lotes anteriores (arquivos removidos do HD).

Uso:
  python -m ops.indexer.index_fs [--root PATH] [--dry-run] [--mapping-xlsx PATH]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from uuid import uuid4

import psycopg
import structlog
from dotenv import load_dotenv

# Engine extraído — re-exports abaixo garantem compat com callers legados.
from . import classificador as _clf  # noqa: F401
from .classificador import (
    EXTENSOES_ACEITAS,
    XLSX_CTHDOC_NOME,
    carregar_mapa_cthdoc,
    carregar_prefixos,
    carregar_prefixos_ana,
    carregar_tipos_dado,
    carregar_tipos_documento,
    classificar_arquivo,
    classificar_pasta_especial,
    detectar_tipo_dado,
    localizar_xlsx,
    parse_nome_modelo_a,
)

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Shims de compatibilidade — callers antigos dependem destes nomes privados.
# ---------------------------------------------------------------------------

_parse_nome_modelo_a = parse_nome_modelo_a
_detectar_tipo_dado = detectar_tipo_dado
_classificar_pasta_especial = classificar_pasta_especial
_carregar_tipos_dado = carregar_tipos_dado
_carregar_tipos_documento = carregar_tipos_documento
_carregar_prefixos = carregar_prefixos
_carregar_prefixos_ana = carregar_prefixos_ana
_carregar_mapa_cthdoc = carregar_mapa_cthdoc
_classificar_arquivo = classificar_arquivo
_localizar_xlsx = localizar_xlsx


# ---------------------------------------------------------------------------
# Varredura
# ---------------------------------------------------------------------------

def _varrer(raiz: Path) -> Iterable[Path]:
    for caminho in raiz.rglob("*"):
        if not caminho.is_file():
            continue
        if caminho.suffix.lower() not in EXTENSOES_ACEITAS:
            continue
        yield caminho


# ---------------------------------------------------------------------------
# SQL de persistência
# ---------------------------------------------------------------------------

SQL_UPSERT_INDEXADO = """
INSERT INTO arquivos_indexados
  (prefixo, nome_arquivo, caminho_absoluto, tamanho_bytes,
   data_modificacao, lote_indexacao,
   tipo_dado, cod_tipo_documento, cod_encarregado,
   data_documento, parte_opcional, nome_valido, formato_nome,
   numero_arquivo, origem_mapeamento)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, true, %s, %s, %s)
ON CONFLICT (caminho_absoluto) DO UPDATE SET
  prefixo              = EXCLUDED.prefixo,
  nome_arquivo         = EXCLUDED.nome_arquivo,
  tamanho_bytes        = EXCLUDED.tamanho_bytes,
  data_modificacao     = EXCLUDED.data_modificacao,
  lote_indexacao       = EXCLUDED.lote_indexacao,
  tipo_dado            = EXCLUDED.tipo_dado,
  cod_tipo_documento   = EXCLUDED.cod_tipo_documento,
  cod_encarregado      = EXCLUDED.cod_encarregado,
  data_documento       = EXCLUDED.data_documento,
  parte_opcional       = EXCLUDED.parte_opcional,
  nome_valido          = true,
  formato_nome         = EXCLUDED.formato_nome,
  numero_arquivo       = EXCLUDED.numero_arquivo,
  origem_mapeamento    = EXCLUDED.origem_mapeamento,
  indexado_em          = NOW()
"""

SQL_UPSERT_ORFAO = """
INSERT INTO arquivos_orfaos
  (nome_arquivo, caminho_absoluto, tamanho_bytes, data_modificacao,
   lote_indexacao, categoria, tipo_dado, motivo)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (caminho_absoluto) DO UPDATE SET
  nome_arquivo     = EXCLUDED.nome_arquivo,
  tamanho_bytes    = EXCLUDED.tamanho_bytes,
  data_modificacao = EXCLUDED.data_modificacao,
  lote_indexacao   = EXCLUDED.lote_indexacao,
  categoria        = EXCLUDED.categoria,
  tipo_dado        = EXCLUDED.tipo_dado,
  motivo           = EXCLUDED.motivo,
  indexado_em      = NOW()
"""

MOTIVO_POR_CATEGORIA = {
    "NOME_FORA_DO_PADRAO": "nome_fora_do_padrao",
    "PREFIXO_DESCONHECIDO": "prefixo_nao_identificado",
    "PENDENCIA_CLIENTE": "pendencia_cliente",
    "FICHA_GERAL": "ficha_geral_sem_prefixo",
}


# ---------------------------------------------------------------------------
# Execução (sweep completo)
# ---------------------------------------------------------------------------

def executar(
    raiz: Path,
    conn_str: str,
    *,
    dry_run: bool,
    mapping_xlsx: Path | None,
) -> int:
    if not raiz.exists() or not raiz.is_dir():
        log.error("raiz_invalida", raiz=str(raiz))
        return 3

    lote = str(uuid4())
    log.info(
        "lote_iniciado",
        lote=lote,
        raiz=str(raiz),
        modo="dry_run" if dry_run else "persistencia",
    )

    with psycopg.connect(conn_str) as conn:
        tipos_dado = carregar_tipos_dado(conn)
        rotulos_tipo_doc = carregar_tipos_documento(conn)
        prefixos_conhecidos = carregar_prefixos(conn)
        prefixos_ana = carregar_prefixos_ana(conn)
        log.info(
            "catalogos_carregados",
            tipos_dado=len(tipos_dado),
            tipos_documento=len(rotulos_tipo_doc),
            prefixos=len(prefixos_conhecidos),
            prefixos_ana=len(prefixos_ana),
        )

        mapa_cthdoc: dict[str, dict] | None = None
        xlsx_path = localizar_xlsx(raiz, mapping_xlsx)
        if xlsx_path:
            mapa_cthdoc = carregar_mapa_cthdoc(
                xlsx_path,
                set(tipos_dado.keys()),
                rotulos_tipo_doc,
            )
            log.info(
                "mapa_cthdoc_carregado",
                xlsx=str(xlsx_path),
                entradas=len(mapa_cthdoc),
            )
        else:
            log.warning("mapa_cthdoc_nao_encontrado", xlsx_nome=XLSX_CTHDOC_NOME)

        sumario = {
            "total": 0,
            "indexado_modelo_a": 0,
            "indexado_modelo_b": 0,
            "orfao_prefixo_desconhecido": 0,
            "orfao_nome_fora_padrao": 0,
            "orfao_pendencia_cliente": 0,
            "orfao_ficha_geral": 0,
            "paralisados_detectados": 0,
        }
        amostras: dict[str, list[str]] = {k: [] for k in sumario.keys()}
        erros: list[dict] = []

        CHUNK_COMMIT = 500

        with conn.cursor() as cur:
            if not dry_run:
                cur.execute(
                    "INSERT INTO indexacao_log (lote_indexacao, raiz_varredura, status) "
                    "VALUES (%s, %s, 'em_andamento')",
                    (lote, str(raiz)),
                )
                conn.commit()

            contador_chunk = 0

            for arquivo in _varrer(raiz):
                sumario["total"] += 1
                try:
                    stat = arquivo.stat()
                    mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)

                    resultado = classificar_arquivo(
                        arquivo,
                        raiz,
                        tipos_dado=tipos_dado,
                        prefixos_conhecidos=prefixos_conhecidos,
                        prefixos_ana=prefixos_ana,
                        mapa_cthdoc=mapa_cthdoc,
                    )

                    if resultado["bucket"] == "indexado":
                        chave = (
                            "indexado_modelo_b"
                            if resultado["origem_mapeamento"] == "PLANILHA_XLSX"
                            else "indexado_modelo_a"
                        )
                        sumario[chave] += 1
                        if len(amostras[chave]) < 10:
                            amostras[chave].append(str(arquivo))
                        opcional_txt = resultado.get("parte_opcional") or ""
                        if opcional_txt.startswith("[paralisado]"):
                            sumario["paralisados_detectados"] += 1

                        if not dry_run:
                            cur.execute(
                                SQL_UPSERT_INDEXADO,
                                (
                                    resultado["prefixo"],
                                    arquivo.name,
                                    str(arquivo),
                                    stat.st_size,
                                    mtime,
                                    lote,
                                    resultado["tipo_dado"],
                                    resultado["cod_tipo_documento"],
                                    resultado["cod_encarregado"],
                                    resultado["data_documento"],
                                    resultado["parte_opcional"],
                                    resultado["formato_nome"],
                                    resultado["numero_arquivo"],
                                    resultado["origem_mapeamento"],
                                ),
                            )
                    else:
                        categoria = resultado["categoria"]
                        chave = {
                            "PREFIXO_DESCONHECIDO": "orfao_prefixo_desconhecido",
                            "NOME_FORA_DO_PADRAO": "orfao_nome_fora_padrao",
                            "PENDENCIA_CLIENTE": "orfao_pendencia_cliente",
                            "FICHA_GERAL": "orfao_ficha_geral",
                        }[categoria]
                        sumario[chave] += 1
                        if len(amostras[chave]) < 10:
                            amostras[chave].append(str(arquivo))

                        if not dry_run:
                            cur.execute(
                                SQL_UPSERT_ORFAO,
                                (
                                    arquivo.name,
                                    str(arquivo),
                                    stat.st_size,
                                    mtime,
                                    lote,
                                    categoria,
                                    resultado["tipo_dado"],
                                    MOTIVO_POR_CATEGORIA[categoria],
                                ),
                            )

                    if not dry_run:
                        contador_chunk += 1
                        if contador_chunk >= CHUNK_COMMIT:
                            total_indexados_parcial = (
                                sumario["indexado_modelo_a"]
                                + sumario["indexado_modelo_b"]
                            )
                            total_orfaos_parcial = (
                                sumario["orfao_prefixo_desconhecido"]
                                + sumario["orfao_nome_fora_padrao"]
                                + sumario["orfao_pendencia_cliente"]
                                + sumario["orfao_ficha_geral"]
                            )
                            cur.execute(
                                "UPDATE indexacao_log SET "
                                "arquivos_encontrados = %s, "
                                "arquivos_indexados_qtd = %s, "
                                "arquivos_orfaos_qtd = %s "
                                "WHERE lote_indexacao = %s",
                                (
                                    sumario["total"],
                                    total_indexados_parcial,
                                    total_orfaos_parcial,
                                    lote,
                                ),
                            )
                            conn.commit()
                            contador_chunk = 0
                            log.info(
                                "chunk_commitado",
                                lote=lote,
                                total=sumario["total"],
                                indexados=total_indexados_parcial,
                                orfaos=total_orfaos_parcial,
                            )
                except OSError as e:
                    erros.append({"caminho": str(arquivo), "erro": f"OSError: {e}"})
                except psycopg.Error as e:
                    erros.append({"caminho": str(arquivo), "erro": f"psycopg.Error: {e}"})
                    try:
                        conn.rollback()
                    except psycopg.Error:
                        pass
                    contador_chunk = 0

            if not dry_run:
                conn.commit()

                prefixo_raiz = str(raiz)
                cur.execute(
                    "DELETE FROM arquivos_indexados WHERE lote_indexacao <> %s "
                    "AND caminho_absoluto LIKE %s",
                    (lote, f"{prefixo_raiz}%"),
                )
                removidos_indexados = cur.rowcount
                cur.execute(
                    "DELETE FROM arquivos_orfaos WHERE lote_indexacao <> %s "
                    "AND caminho_absoluto LIKE %s",
                    (lote, f"{prefixo_raiz}%"),
                )
                removidos_orfaos = cur.rowcount

                total_orfaos = (
                    sumario["orfao_prefixo_desconhecido"]
                    + sumario["orfao_nome_fora_padrao"]
                    + sumario["orfao_pendencia_cliente"]
                    + sumario["orfao_ficha_geral"]
                )
                total_indexados = (
                    sumario["indexado_modelo_a"] + sumario["indexado_modelo_b"]
                )

                cur.execute(
                    "UPDATE indexacao_log SET finalizado_em = NOW(), "
                    "arquivos_encontrados = %s, arquivos_indexados_qtd = %s, "
                    "arquivos_orfaos_qtd = %s, arquivos_removidos_qtd = %s, "
                    "erros_amostra = %s::jsonb, status = 'ok' "
                    "WHERE lote_indexacao = %s",
                    (
                        sumario["total"],
                        total_indexados,
                        total_orfaos,
                        removidos_indexados + removidos_orfaos,
                        json.dumps(erros[:20], ensure_ascii=False),
                        lote,
                    ),
                )
                conn.commit()

    relatorio = {
        "lote": lote,
        "raiz": str(raiz),
        "modo": "dry_run" if dry_run else "persistencia",
        "xlsx_mapeamento": str(xlsx_path) if xlsx_path else None,
        "sumario": sumario,
        "amostras_por_bucket": amostras,
        "erros_qtd": len(erros),
    }

    print(json.dumps(relatorio, ensure_ascii=False, indent=2, default=str))

    log.info(
        "lote_concluido",
        lote=lote,
        total=sumario["total"],
        indexado_a=sumario["indexado_modelo_a"],
        indexado_b=sumario["indexado_modelo_b"],
        orfaos=sum(v for k, v in sumario.items() if k.startswith("orfao_")),
        erros=len(erros),
        modo=relatorio["modo"],
    )
    return 0


def main() -> int:
    load_dotenv(".env.local")
    load_dotenv(".env")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=os.environ.get("INDEXER_ROOT_PATH"))
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Varre e classifica sem gravar no banco. Imprime sumário JSON.",
    )
    parser.add_argument(
        "--mapping-xlsx",
        default=None,
        help="Caminho da planilha relacao_doc_arquivos_cthdoc.xlsx (override do auto-detect).",
    )
    args = parser.parse_args()

    raiz = args.root
    if not raiz:
        print(
            "erro: informe --root ou defina INDEXER_ROOT_PATH no .env.local",
            file=sys.stderr,
        )
        return 1

    conn_str = os.environ.get("DATABASE_URL_INDEXER") or os.environ.get("DATABASE_URL")
    if not conn_str:
        print(
            "erro: defina DATABASE_URL_INDEXER (ou DATABASE_URL) no .env.local",
            file=sys.stderr,
        )
        return 1

    mapping = Path(args.mapping_xlsx) if args.mapping_xlsx else None
    return executar(Path(raiz), conn_str, dry_run=args.dry_run, mapping_xlsx=mapping)


if __name__ == "__main__":
    raise SystemExit(main())
