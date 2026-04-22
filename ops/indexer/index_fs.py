"""
Worker de indexação do HD de rede SPÁguas (v1.3 — 3 formatos de nome aceitos).

Estratégia (ver architecture.md §8.2 v1.3):
  1. Determina `tipo_dado` pela pasta raiz da varredura (5 categorias oficiais:
     Fluviometria, Fluviometria/ANA, Fluviometria/QualiAgua, Piezometria,
     Pluviometria, QualiAgua).
  2. Normaliza whitespace múltiplo no nome do arquivo (2+ espaços -> 1).
  3. Tenta bater o nome, em ordem de especificidade, contra 3 regexes:
       a. COMPLETO  — padrão oficial novo (apenas 7,88% da base histórica):
          {Prefixo} {CodDoc:2d} {CodEnc:2d} [opcional] {AAAA MM DD}.pdf
       b. PARCIAL   — prefixo + codigo de documento + data (caso mais comum
          em documentos antigos; ex.: "1D-002 01 1960 08 26.pdf"):
          {Prefixo} {CodDoc:2d} {AAAA MM DD}.pdf
       c. LEGADO    — prefixo + data (documentos históricos sem metadados):
          {Prefixo} {AAAA MM DD}.pdf
     Arquivos PARCIAL e LEGADO são CONFORMES; só vão para `arquivos_orfaos`
     com categoria NOME_FORA_DO_PADRAO se nenhum dos 3 formatos bater.
  4. Valida o prefixo capturado contra a regex do `tipo_dado` (tabela `tipos_dado`).
  5. Faz lookup do prefixo em `postos`:
     - Para `FluviometriaANA`: compara `LPAD(prefixo_ana, 8, '0')`.
     - Demais: igualdade exata contra `postos.prefixo`.
  6. 3 buckets:
     a. Nome parseado + prefixo encontrado -> arquivos_indexados (com
        `formato_nome` indicando COMPLETO|PARCIAL|LEGADO).
     b. Nome parseado + prefixo desconhecido -> arquivos_orfaos (PREFIXO_DESCONHECIDO).
     c. Nome fora dos 3 padrões -> arquivos_orfaos (NOME_FORA_DO_PADRAO).

Casos de parsing (documentação — sem infra pytest no projeto):
  "1D-008 03 45 2020 03 15.pdf"                   -> COMPLETO, opcional=None
  "1D-008 03 45 relatorio mensal 2020 03 15.pdf"  -> COMPLETO, opcional="relatorio mensal"
  "1D-002 01 1960 08 26.pdf"                      -> PARCIAL
  "1D-002 1960 08 26.pdf"                         -> LEGADO
  "1D-002.pdf"                                    -> sem match, vai pra orfão

Uso:
  python index_fs.py [--root PATH]

Variáveis de ambiente:
  DATABASE_URL_INDEXER  conn string com permissão de escrita nas tabelas alvo
  INDEXER_ROOT_PATH     raiz se --root não for passado

O --root deve apontar para a raiz que contém as pastas de TipoDado como filhas
imediatas (ex.: \\\\servidor\\share\\SPAguas\\), ou diretamente para uma pasta
de TipoDado (ex.: \\\\servidor\\share\\SPAguas\\Pluviometria\\).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable
from uuid import uuid4

import psycopg
import structlog
from dotenv import load_dotenv

log = structlog.get_logger(__name__)

EXTENSOES_ACEITAS = {".pdf"}

# Whitespace múltiplo para normalização (2+ espaços/tabs -> 1 espaço).
RX_WHITESPACE = re.compile(r"\s{2,}")

# Formato 1 — COMPLETO (padrão oficial novo).
# {Prefixo} {CodDoc:2d} {CodEnc:2d} [opcional] {AAAA MM DD}.pdf
RX_COMPLETO = re.compile(
    r"^(?P<prefixo>\S+)\s+(?P<cod_doc>\d{2})\s+(?P<cod_enc>\d{2})"
    r"(?:\s+(?P<opcional>.+?))?\s+(?P<data>\d{4}\s+\d{2}\s+\d{2})\.pdf$",
    flags=re.IGNORECASE,
)

# Formato 2 — PARCIAL (prefixo + cod_doc + data, sem cod_enc nem opcional).
# {Prefixo} {CodDoc:2d} {AAAA MM DD}.pdf
RX_PARCIAL = re.compile(
    r"^(?P<prefixo>\S+)\s+(?P<cod_doc>\d{2})\s+(?P<data>\d{4}\s+\d{2}\s+\d{2})\.pdf$",
    flags=re.IGNORECASE,
)

# Formato 3 — LEGADO (apenas prefixo + data; documentos históricos).
# {Prefixo} {AAAA MM DD}.pdf
RX_LEGADO = re.compile(
    r"^(?P<prefixo>\S+)\s+(?P<data>\d{4}\s+\d{2}\s+\d{2})\.pdf$",
    flags=re.IGNORECASE,
)


def _normalizar_nome(nome: str) -> str:
    """Colapsa whitespace múltiplo em espaço único (preserva extensão)."""
    return RX_WHITESPACE.sub(" ", nome).strip()


def _parse_nome(nome: str) -> tuple[str, dict] | None:
    """Tenta bater o nome contra COMPLETO -> PARCIAL -> LEGADO.

    Retorna (formato, grupos) ou None se nenhum formato bater.
    Grupos ausentes em formatos mais curtos retornam None na dict.
    """
    m = RX_COMPLETO.match(nome)
    if m is not None:
        return "COMPLETO", {
            "prefixo": m.group("prefixo"),
            "cod_doc": m.group("cod_doc"),
            "cod_enc": m.group("cod_enc"),
            "opcional": m.group("opcional"),
            "data": m.group("data"),
        }

    m = RX_PARCIAL.match(nome)
    if m is not None:
        return "PARCIAL", {
            "prefixo": m.group("prefixo"),
            "cod_doc": m.group("cod_doc"),
            "cod_enc": None,
            "opcional": None,
            "data": m.group("data"),
        }

    m = RX_LEGADO.match(nome)
    if m is not None:
        return "LEGADO", {
            "prefixo": m.group("prefixo"),
            "cod_doc": None,
            "cod_enc": None,
            "opcional": None,
            "data": m.group("data"),
        }

    return None

# Mapeamento de nome de pasta (case-insensitive) para tipo_dado.
# As pastas de ANA e QualiAgua dentro de Fluviometria são tratadas como tipos
# distintos (mesmo mapeamento usado pelo cliente).
MAPA_PASTAS: dict[str, str] = {
    "fluviometria": "Fluviometria",
    "pluviometria": "Pluviometria",
    "piezometria": "Piezometria",
    "qualiagua": "QualiAgua",
    # subpastas de Fluviometria:
    "ana": "FluviometriaANA",
    # QualiAgua DENTRO de Fluviometria vira FluviometriaQualiAgua.
    # resolvido no detector_tipo_dado com contexto do pai.
}


def _detectar_tipo_dado(caminho: Path, raiz: Path) -> str | None:
    """Determina o tipo_dado pela posição do arquivo na hierarquia de pastas.

    Regras:
      - Procura nos ancestrais (relativo à raiz) a primeira pasta conhecida.
      - QualiAgua aninhada em Fluviometria vira FluviometriaQualiAgua.
      - Pasta ANA só é reconhecida quando aninhada em Fluviometria.
    """
    try:
        relativo = caminho.relative_to(raiz)
    except ValueError:
        return None

    partes = [p.lower() for p in relativo.parts[:-1]]  # exclui o nome do arquivo
    if not partes:
        return None

    # Caso aninhado: Fluviometria/ANA ou Fluviometria/QualiAgua
    for i, parte in enumerate(partes):
        if parte == "fluviometria":
            if i + 1 < len(partes):
                sub = partes[i + 1]
                if sub == "ana":
                    return "FluviometriaANA"
                if sub == "qualiagua":
                    return "FluviometriaQualiAgua"
            return "Fluviometria"
        if parte in ("pluviometria", "piezometria"):
            return MAPA_PASTAS[parte]
        if parte == "qualiagua":
            # QualiAgua raiz (não aninhada em Fluviometria)
            return "QualiAgua"
    return None


def _carregar_tipos_dado(conn: psycopg.Connection) -> dict[str, dict]:
    """Carrega as 5 categorias oficiais da tabela tipos_dado."""
    with conn.cursor() as cur:
        cur.execute("SELECT codigo, regex_prefixo, usa_prefixo_ana FROM tipos_dado")
        return {
            row[0]: {"regex": re.compile(row[1]), "usa_prefixo_ana": row[2]}
            for row in cur.fetchall()
        }


def _carregar_prefixos_por_prefixo(conn: psycopg.Connection) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT prefixo FROM postos")
        return {row[0] for row in cur.fetchall()}


def _carregar_prefixos_por_ana(conn: psycopg.Connection) -> dict[str, str]:
    """Mapa de prefixo_ana (paddado a 8 dígitos) -> prefixo do posto."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT prefixo, prefixo_ana FROM postos "
            "WHERE prefixo_ana IS NOT NULL AND prefixo_ana <> ''"
        )
        mapa: dict[str, str] = {}
        for prefixo, prefixo_ana in cur.fetchall():
            chave = prefixo_ana.zfill(8) if prefixo_ana.isdigit() else prefixo_ana
            mapa[chave] = prefixo
        return mapa


def _parse_data(texto: str) -> date | None:
    """Parse 'AAAA MM DD' para date, com tolerância a separadores."""
    partes = texto.split()
    if len(partes) != 3:
        return None
    try:
        ano, mes, dia = int(partes[0]), int(partes[1]), int(partes[2])
        return date(ano, mes, dia)
    except ValueError:
        return None


def _varrer(raiz: Path) -> Iterable[Path]:
    for caminho in raiz.rglob("*"):
        if not caminho.is_file():
            continue
        if caminho.suffix.lower() not in EXTENSOES_ACEITAS:
            continue
        yield caminho


def executar(raiz: Path, conn_str: str) -> int:
    if not raiz.exists() or not raiz.is_dir():
        log.error("raiz_invalida", raiz=str(raiz))
        return 3

    lote = str(uuid4())
    log.info("lote_iniciado", lote=lote, raiz=str(raiz))

    with psycopg.connect(conn_str) as conn:
        tipos_dado = _carregar_tipos_dado(conn)
        prefixos_conhecidos = _carregar_prefixos_por_prefixo(conn)
        prefixos_ana = _carregar_prefixos_por_ana(conn)
        log.info(
            "catalogos_carregados",
            tipos_dado=len(tipos_dado),
            prefixos=len(prefixos_conhecidos),
            prefixos_ana=len(prefixos_ana),
        )

        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO indexacao_log (lote_indexacao, raiz_varredura, status) "
                "VALUES (%s, %s, 'em_andamento')",
                (lote, str(raiz)),
            )
            conn.commit()

            indexados = 0
            orfaos_prefixo = 0
            orfaos_malformados = 0
            erros: list[dict] = []
            total = 0

            for arquivo in _varrer(raiz):
                total += 1
                try:
                    stat = arquivo.stat()
                    nome = arquivo.name
                    mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)

                    tipo_dado = _detectar_tipo_dado(arquivo, raiz)

                    nome_norm = _normalizar_nome(nome)
                    parsed = _parse_nome(nome_norm)
                    if parsed is None:
                        _insert_orfao(
                            cur, nome, arquivo, stat.st_size, mtime, lote,
                            categoria="NOME_FORA_DO_PADRAO",
                            tipo_dado=tipo_dado,
                        )
                        orfaos_malformados += 1
                        continue

                    formato_nome, grupos = parsed
                    prefixo_capturado = grupos["prefixo"]
                    cod_doc_raw = grupos["cod_doc"]
                    cod_enc = grupos["cod_enc"]
                    opcional = grupos["opcional"]
                    data_documento = _parse_data(grupos["data"])

                    # Valida prefixo contra a regex do tipo_dado.
                    if tipo_dado is None or tipo_dado not in tipos_dado:
                        _insert_orfao(
                            cur, nome, arquivo, stat.st_size, mtime, lote,
                            categoria="NOME_FORA_DO_PADRAO",
                            tipo_dado=tipo_dado,
                        )
                        orfaos_malformados += 1
                        continue

                    cfg_tipo = tipos_dado[tipo_dado]
                    if not cfg_tipo["regex"].match(prefixo_capturado):
                        _insert_orfao(
                            cur, nome, arquivo, stat.st_size, mtime, lote,
                            categoria="NOME_FORA_DO_PADRAO",
                            tipo_dado=tipo_dado,
                        )
                        orfaos_malformados += 1
                        continue

                    # Valida cod_doc (01..07) apenas quando capturado (COMPLETO/PARCIAL).
                    # LEGADO não tem cod_doc -> cod_doc = None.
                    if cod_doc_raw is not None:
                        try:
                            cod_doc_int = int(cod_doc_raw)
                        except ValueError:
                            cod_doc_int = 0
                        if cod_doc_int < 1 or cod_doc_int > 7:
                            _insert_orfao(
                                cur, nome, arquivo, stat.st_size, mtime, lote,
                                categoria="NOME_FORA_DO_PADRAO",
                                tipo_dado=tipo_dado,
                            )
                            orfaos_malformados += 1
                            continue
                        cod_doc: int | None = cod_doc_int
                    else:
                        cod_doc = None

                    # Lookup do prefixo.
                    if cfg_tipo["usa_prefixo_ana"]:
                        chave = prefixo_capturado.zfill(8) if prefixo_capturado.isdigit() else prefixo_capturado
                        prefixo_final = prefixos_ana.get(chave)
                    else:
                        prefixo_final = (
                            prefixo_capturado
                            if prefixo_capturado in prefixos_conhecidos
                            else None
                        )

                    if prefixo_final is None:
                        _insert_orfao(
                            cur, nome, arquivo, stat.st_size, mtime, lote,
                            categoria="PREFIXO_DESCONHECIDO",
                            tipo_dado=tipo_dado,
                        )
                        orfaos_prefixo += 1
                        continue

                    cur.execute(
                        """
                        INSERT INTO arquivos_indexados
                          (prefixo, nome_arquivo, caminho_absoluto, tamanho_bytes,
                           data_modificacao, lote_indexacao,
                           tipo_dado, cod_tipo_documento, cod_encarregado,
                           data_documento, parte_opcional, nome_valido, formato_nome)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, true, %s)
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
                          indexado_em          = NOW()
                        """,
                        (
                            prefixo_final,
                            nome,
                            str(arquivo),
                            stat.st_size,
                            mtime,
                            lote,
                            tipo_dado,
                            cod_doc,
                            cod_enc,
                            data_documento,
                            opcional,
                            formato_nome,
                        ),
                    )
                    indexados += 1
                except (OSError, psycopg.Error) as e:
                    erros.append({"caminho": str(arquivo), "erro": str(e)})
                    conn.rollback()

            conn.commit()

            # Reconstrução: remove registros não vistos neste lote dentro da raiz.
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

            cur.execute(
                "UPDATE indexacao_log SET finalizado_em = NOW(), arquivos_encontrados = %s, "
                "arquivos_indexados_qtd = %s, arquivos_orfaos_qtd = %s, "
                "arquivos_removidos_qtd = %s, erros_amostra = %s::jsonb, status = 'ok' "
                "WHERE lote_indexacao = %s",
                (
                    total,
                    indexados,
                    orfaos_prefixo + orfaos_malformados,
                    removidos_indexados + removidos_orfaos,
                    json.dumps(erros[:20], ensure_ascii=False),
                    lote,
                ),
            )
            conn.commit()

    log.info(
        "lote_concluido",
        lote=lote,
        total=total,
        indexados=indexados,
        orfaos_prefixo=orfaos_prefixo,
        orfaos_malformados=orfaos_malformados,
        erros=len(erros),
    )
    return 0


def _insert_orfao(
    cur,
    nome: str,
    arquivo: Path,
    tamanho: int,
    mtime: datetime,
    lote: str,
    *,
    categoria: str,
    tipo_dado: str | None,
) -> None:
    cur.execute(
        """
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
        """,
        (
            nome,
            str(arquivo),
            tamanho,
            mtime,
            lote,
            categoria,
            tipo_dado,
            "nome_fora_do_padrao" if categoria == "NOME_FORA_DO_PADRAO" else "prefixo_nao_identificado",
        ),
    )


def main() -> int:
    load_dotenv(".env.local")
    load_dotenv(".env")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=os.environ.get("INDEXER_ROOT_PATH"))
    args = parser.parse_args()

    raiz = args.root
    if not raiz:
        print("erro: informe --root ou defina INDEXER_ROOT_PATH no .env.local", file=sys.stderr)
        return 1

    conn_str = os.environ.get("DATABASE_URL_INDEXER") or os.environ.get("DATABASE_URL")
    if not conn_str:
        print("erro: defina DATABASE_URL_INDEXER (ou DATABASE_URL) no .env.local", file=sys.stderr)
        return 1

    return executar(Path(raiz), conn_str)


if __name__ == "__main__":
    raise SystemExit(main())
