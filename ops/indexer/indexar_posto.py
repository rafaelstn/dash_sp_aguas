"""
Worker de indexação on-demand por posto — lazy indexing (ADR-0006).

Varre apenas a pasta raiz de UM posto (resolvida via `postos_caminhos`),
classifica cada PDF com `classificador.py` e persiste em lote em
`arquivos_indexados` / `arquivos_orfaos`. Atualiza `posto_indexacao_cache`
com TTL de 24 h.

É chamado pelo handler Next.js (`src/app/api/postos/[prefixo]/route.ts`) via
subprocesso ou, no futuro, via job queue. Precisa ser:

  - RÁPIDO: pasta típica tem 50–500 arquivos. Meta: <8 s para a varredura
    inteira (dentro do budget do endpoint síncrono).
  - IDEMPOTENTE: retry seguro. UPSERT em tudo. Locks via
    pg_try_advisory_xact_lock(hashtext(prefixo)) no caller.
  - BLINDADO contra HD de rede: timeouts curtos em `scandir`, categorização
    explícita de pasta_inexistente / sem_permissao / timeout.

Uso programático:

    from ops.indexer.indexar_posto import indexar_posto, IndexacaoResultado
    resultado = indexar_posto("1D-008", forcar=False)
    if resultado.status == "ok":
        print(resultado.arquivos_indexados)

Uso CLI:

    python -m ops.indexer.indexar_posto --prefixo 1D-008 [--forcar]
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
import structlog
from dotenv import load_dotenv

# Logs vão para stderr — o stdout é reservado ao JSON de resultado que o caller
# (Next.js `dispararWorkerSync`) faz `JSON.parse`. Misturar logs e JSON no mesmo
# stream quebra o parse do caller com 500.
structlog.configure(
    logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
)

from .classificador import (
    EXTENSOES_ACEITAS,
    XLSX_CTHDOC_NOME,
    carregar_mapa_cthdoc,
    carregar_prefixos,
    carregar_prefixos_ana,
    carregar_tipos_dado,
    carregar_tipos_documento,
    classificar_arquivo,
    localizar_xlsx,
)
from .index_fs import (
    MOTIVO_POR_CATEGORIA,
    SQL_UPSERT_INDEXADO,
    SQL_UPSERT_ORFAO,
)

log = structlog.get_logger(__name__)

TTL_CACHE_HORAS = 24
BATCH_SIZE = 100


# ---------------------------------------------------------------------------
# Resultado tipado
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class IndexacaoResultado:
    """Contrato de saída do worker on-demand.

    `status` sempre preenchido. Valores possíveis:
      - ok                    : varredura concluída, cache fresh.
      - pasta_inexistente     : postos_caminhos.ativo=false ou pasta sumiu.
      - sem_permissao         : HD montado mas sem ACL.
      - timeout               : estourou deadline_s.
      - cache_hit             : TTL fresh, nada foi varrido.
      - prefixo_desconhecido  : prefixo não existe em `postos`.
    """

    prefixo: str
    status: str
    arquivos_encontrados: int = 0
    arquivos_indexados: int = 0
    arquivos_orfaos: int = 0
    duracao_s: float = 0.0
    lote: UUID | None = None
    caminho: str | None = None
    erros: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_conn_str() -> str:
    conn_str = os.environ.get("DATABASE_URL_INDEXER") or os.environ.get("DATABASE_URL")
    if not conn_str:
        raise RuntimeError(
            "defina DATABASE_URL_INDEXER (ou DATABASE_URL) no ambiente",
        )
    return conn_str


def _resolver_caminho(
    conn: psycopg.Connection, prefixo: str
) -> tuple[Path | None, str | None]:
    """Retorna (caminho, tipo_dado). caminho=None se sem mapeamento ativo."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT caminho_unc, tipo_dado FROM postos_caminhos "
            "WHERE prefixo = %s AND ativo = true",
            (prefixo,),
        )
        row = cur.fetchone()
    if row is None:
        return None, None
    return Path(row[0]), row[1]


def _cache_fresh(conn: psycopg.Connection, prefixo: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM posto_indexacao_cache "
            "WHERE prefixo = %s AND expira_em > NOW() AND status = 'ok'",
            (prefixo,),
        )
        return cur.fetchone() is not None


def _varrer_posto(raiz: Path, deadline: float) -> tuple[list[Path], str | None]:
    """scandir recursivo apenas sob `raiz`. Aborta se passar do deadline.

    Retorna (lista_de_pdfs, status_erro_ou_None).
    """
    arquivos: list[Path] = []
    try:
        if not raiz.exists():
            return [], "pasta_inexistente"
        if not raiz.is_dir():
            return [], "pasta_inexistente"
    except PermissionError:
        return [], "sem_permissao"
    except OSError as e:
        log.warning("raiz_os_error", raiz=str(raiz), erro=str(e))
        return [], "pasta_inexistente"

    pilha: list[Path] = [raiz]
    while pilha:
        if time.monotonic() > deadline:
            return arquivos, "timeout"
        atual = pilha.pop()
        try:
            with os.scandir(atual) as it:
                for entry in it:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            pilha.append(Path(entry.path))
                        elif entry.is_file(follow_symlinks=False):
                            p = Path(entry.path)
                            if p.suffix.lower() in EXTENSOES_ACEITAS:
                                arquivos.append(p)
                    except OSError:
                        continue
        except PermissionError:
            return arquivos, "sem_permissao"
        except OSError as e:
            log.warning("scandir_erro", pasta=str(atual), erro=str(e))
            continue

    return arquivos, None


def _upsert_cache(
    conn: psycopg.Connection,
    *,
    prefixo: str,
    status: str,
    arquivos_indexados: int,
    arquivos_orfaos: int,
    mtime_hd: datetime | None,
    lote: UUID,
) -> None:
    agora = datetime.now(tz=timezone.utc)
    expira = agora + timedelta(hours=TTL_CACHE_HORAS) if status == "ok" else agora
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO posto_indexacao_cache
              (prefixo, indexado_em, expira_em, mtime_hd,
               arquivos_indexados, arquivos_orfaos, status, ultimo_lote)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (prefixo) DO UPDATE SET
              indexado_em        = EXCLUDED.indexado_em,
              expira_em          = EXCLUDED.expira_em,
              mtime_hd           = EXCLUDED.mtime_hd,
              arquivos_indexados = EXCLUDED.arquivos_indexados,
              arquivos_orfaos    = EXCLUDED.arquivos_orfaos,
              status             = EXCLUDED.status,
              ultimo_lote        = EXCLUDED.ultimo_lote,
              updated_at         = NOW()
            """,
            (
                prefixo,
                agora,
                expira,
                mtime_hd,
                arquivos_indexados,
                arquivos_orfaos,
                status,
                str(lote),
            ),
        )


def _insert_log_posto(
    conn: psycopg.Connection,
    *,
    lote: UUID,
    prefixo: str,
    raiz: Path,
    status: str,
    encontrados: int,
    indexados: int,
    orfaos: int,
    duracao_s: float,
) -> None:
    """Escreve uma linha em indexacao_log com escopo='posto'.

    Pequeno trade-off: 1 insert por reindex on-demand. Com TTL 24h e ~200
    postos ativos/dia, isso dá ~200 linhas/dia. Tranquilo.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO indexacao_log
              (lote_indexacao, raiz_varredura, iniciado_em, finalizado_em,
               arquivos_encontrados, arquivos_indexados_qtd, arquivos_orfaos_qtd,
               status, escopo, prefixo_alvo)
            VALUES (%s, %s, NOW() - make_interval(secs => %s), NOW(),
                    %s, %s, %s, %s, 'posto', %s)
            """,
            (
                str(lote),
                str(raiz),
                duracao_s,
                encontrados,
                indexados,
                orfaos,
                "ok" if status == "ok" else "erro",
                prefixo,
            ),
        )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def indexar_posto(
    prefixo: str,
    *,
    forcar: bool = False,
    caminho_override: Path | None = None,
    deadline_s: float = 60.0,
    conn_str: str | None = None,
) -> IndexacaoResultado:
    """Indexa on-demand a pasta de um posto.

    Args:
      prefixo: chave em `postos.prefixo`.
      forcar: ignora cache fresh e sempre reindex.
      caminho_override: se fornecido, usa no lugar de `postos_caminhos`.
      deadline_s: budget para a varredura. API síncrona passa 8.0; job em
        background passa 60.0+.
      conn_str: override de DATABASE_URL (útil pra testes).

    O caller é responsável por tomar o advisory lock — este worker assume
    que já está protegido contra corrida.
    """
    inicio = time.monotonic()
    deadline = inicio + deadline_s
    lote = uuid4()
    conn_str = conn_str or _get_conn_str()

    log.info("indexar_posto_iniciado", prefixo=prefixo, forcar=forcar, lote=str(lote))

    with psycopg.connect(conn_str) as conn:
        # 1) Prefixo existe?
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM postos WHERE prefixo = %s", (prefixo,))
            if cur.fetchone() is None:
                return IndexacaoResultado(
                    prefixo=prefixo, status="prefixo_desconhecido",
                )

        # 2) Cache fresh? (curto-circuito, só se não forçar)
        if not forcar and _cache_fresh(conn, prefixo):
            log.info("cache_hit", prefixo=prefixo)
            return IndexacaoResultado(
                prefixo=prefixo,
                status="cache_hit",
                duracao_s=time.monotonic() - inicio,
            )

        # 3) Resolver caminho (override > postos_caminhos)
        if caminho_override is not None:
            caminho = caminho_override
        else:
            caminho, _tipo_dado_cadastrado = _resolver_caminho(conn, prefixo)
            if caminho is None:
                _upsert_cache(
                    conn,
                    prefixo=prefixo,
                    status="pasta_inexistente",
                    arquivos_indexados=0,
                    arquivos_orfaos=0,
                    mtime_hd=None,
                    lote=lote,
                )
                conn.commit()
                return IndexacaoResultado(
                    prefixo=prefixo,
                    status="pasta_inexistente",
                    lote=lote,
                    duracao_s=time.monotonic() - inicio,
                )

        # 4) Varredura (budget deadline_s)
        arquivos, erro_scan = _varrer_posto(caminho, deadline)
        if erro_scan is not None and not arquivos:
            _upsert_cache(
                conn,
                prefixo=prefixo,
                status=erro_scan,
                arquivos_indexados=0,
                arquivos_orfaos=0,
                mtime_hd=None,
                lote=lote,
            )
            _insert_log_posto(
                conn, lote=lote, prefixo=prefixo, raiz=caminho,
                status=erro_scan, encontrados=0, indexados=0, orfaos=0,
                duracao_s=time.monotonic() - inicio,
            )
            conn.commit()
            return IndexacaoResultado(
                prefixo=prefixo, status=erro_scan, caminho=str(caminho),
                lote=lote, duracao_s=time.monotonic() - inicio,
            )

        # 5) Catálogos (uma vez por reindex)
        tipos_dado = carregar_tipos_dado(conn)
        rotulos_tipo_doc = carregar_tipos_documento(conn)
        prefixos_conhecidos = carregar_prefixos(conn)
        prefixos_ana = carregar_prefixos_ana(conn)

        # Planilha CTHDOC: só carrega se a pasta do posto estiver sob
        # DOCUMENTOS-CTHDOC-RECUPER*. Para a maioria dos postos o caminho é
        # Y:\000 Documentos de Campo\{tipo}\{prefixo}\, então mapa=None.
        mapa_cthdoc: dict[str, dict] | None = None
        xlsx = localizar_xlsx(caminho, None)
        if xlsx is not None:
            mapa_cthdoc = carregar_mapa_cthdoc(
                xlsx, set(tipos_dado.keys()), rotulos_tipo_doc,
            )

        # 6) Classifica + persiste em batch
        indexados = 0
        orfaos = 0
        mtime_mais_recente: datetime | None = None
        erros: list[dict] = []

        batch_indexados: list[tuple] = []
        batch_orfaos: list[tuple] = []

        def _flush(cur: psycopg.Cursor) -> None:
            nonlocal batch_indexados, batch_orfaos
            if batch_indexados:
                cur.executemany(SQL_UPSERT_INDEXADO, batch_indexados)
                batch_indexados = []
            if batch_orfaos:
                cur.executemany(SQL_UPSERT_ORFAO, batch_orfaos)
                batch_orfaos = []

        with conn.cursor() as cur:
            for arquivo in arquivos:
                if time.monotonic() > deadline:
                    erro_scan = "timeout"
                    break
                try:
                    stat = arquivo.stat()
                except OSError as e:
                    erros.append({"caminho": str(arquivo), "erro": f"OSError: {e}"})
                    continue

                mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                if mtime_mais_recente is None or mtime > mtime_mais_recente:
                    mtime_mais_recente = mtime

                try:
                    resultado = classificar_arquivo(
                        arquivo, caminho,
                        tipos_dado=tipos_dado,
                        prefixos_conhecidos=prefixos_conhecidos,
                        prefixos_ana=prefixos_ana,
                        mapa_cthdoc=mapa_cthdoc,
                    )
                except Exception as e:  # noqa: BLE001 — sanidade; logs estruturados
                    erros.append({"caminho": str(arquivo), "erro": f"classif: {e}"})
                    continue

                if resultado["bucket"] == "indexado":
                    batch_indexados.append((
                        resultado["prefixo"], arquivo.name, str(arquivo),
                        stat.st_size, mtime, str(lote),
                        resultado["tipo_dado"], resultado["cod_tipo_documento"],
                        resultado["cod_encarregado"], resultado["data_documento"],
                        resultado["parte_opcional"], resultado["formato_nome"],
                        resultado["numero_arquivo"], resultado["origem_mapeamento"],
                    ))
                    indexados += 1
                else:
                    categoria = resultado["categoria"]
                    batch_orfaos.append((
                        arquivo.name, str(arquivo), stat.st_size, mtime, str(lote),
                        categoria, resultado["tipo_dado"],
                        MOTIVO_POR_CATEGORIA[categoria],
                    ))
                    orfaos += 1

                if len(batch_indexados) >= BATCH_SIZE or len(batch_orfaos) >= BATCH_SIZE:
                    try:
                        _flush(cur)
                    except psycopg.Error as e:
                        erros.append({"caminho": "batch", "erro": f"psycopg: {e}"})
                        try:
                            conn.rollback()
                        except psycopg.Error:
                            pass

            try:
                _flush(cur)
            except psycopg.Error as e:
                erros.append({"caminho": "final_flush", "erro": f"psycopg: {e}"})
                try:
                    conn.rollback()
                except psycopg.Error:
                    pass

            # 7) Remove arquivos órfãos de lotes anteriores dessa pasta
            #    (arquivo foi deletado no HD, some do banco).
            cur.execute(
                "DELETE FROM arquivos_indexados "
                "WHERE lote_indexacao <> %s AND caminho_absoluto LIKE %s",
                (str(lote), f"{caminho}%"),
            )
            cur.execute(
                "DELETE FROM arquivos_orfaos "
                "WHERE lote_indexacao <> %s AND caminho_absoluto LIKE %s",
                (str(lote), f"{caminho}%"),
            )

        # 8) Cache + log
        status_final = "ok" if erro_scan is None else erro_scan
        _upsert_cache(
            conn,
            prefixo=prefixo,
            status=status_final,
            arquivos_indexados=indexados,
            arquivos_orfaos=orfaos,
            mtime_hd=mtime_mais_recente,
            lote=lote,
        )
        _insert_log_posto(
            conn, lote=lote, prefixo=prefixo, raiz=caminho,
            status=status_final, encontrados=len(arquivos),
            indexados=indexados, orfaos=orfaos,
            duracao_s=time.monotonic() - inicio,
        )
        conn.commit()

    duracao = time.monotonic() - inicio
    log.info(
        "indexar_posto_concluido",
        prefixo=prefixo, status=status_final, indexados=indexados,
        orfaos=orfaos, duracao_s=round(duracao, 2),
    )

    return IndexacaoResultado(
        prefixo=prefixo,
        status=status_final,
        arquivos_encontrados=len(arquivos),
        arquivos_indexados=indexados,
        arquivos_orfaos=orfaos,
        duracao_s=duracao,
        lote=lote,
        caminho=str(caminho),
        erros=erros,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    load_dotenv(".env.local")
    load_dotenv(".env")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefixo", required=True)
    parser.add_argument("--forcar", action="store_true")
    parser.add_argument("--caminho", default=None,
                        help="Override do postos_caminhos (útil pra teste local).")
    parser.add_argument("--deadline", type=float, default=60.0)
    args = parser.parse_args()

    try:
        resultado = indexar_posto(
            args.prefixo,
            forcar=args.forcar,
            caminho_override=Path(args.caminho) if args.caminho else None,
            deadline_s=args.deadline,
        )
    except RuntimeError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1

    import json as _json
    print(_json.dumps({
        "prefixo": resultado.prefixo,
        "status": resultado.status,
        "arquivos_encontrados": resultado.arquivos_encontrados,
        "arquivos_indexados": resultado.arquivos_indexados,
        "arquivos_orfaos": resultado.arquivos_orfaos,
        "duracao_s": round(resultado.duracao_s, 3),
        "lote": str(resultado.lote) if resultado.lote else None,
        "caminho": resultado.caminho,
        "erros_qtd": len(resultado.erros),
    }, ensure_ascii=False, indent=2))

    return 0 if resultado.status in ("ok", "cache_hit") else 2


if __name__ == "__main__":
    raise SystemExit(main())
