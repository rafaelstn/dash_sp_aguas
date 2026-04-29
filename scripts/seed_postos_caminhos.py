"""
Seed da tabela `postos_caminhos` — lazy indexing (ADR-0006).

Para cada um dos 2.483 postos em `postos`, tenta achar a pasta raiz no HD em:

    Y:\\000 Documentos de Campo\\{tipo_dado}\\{prefixo}[ sufixo]\\

O `tipo_dado` é inferido pelo regex de `tipos_dado` aplicado ao prefixo.
Sufixos tolerados: qualquer coisa após o prefixo (ex.: "1D-008 paralisado",
"1D-008 - Rio Tietê"). Regex amigável, case-insensitive.

Uso:

    python scripts/seed_postos_caminhos.py --root "Y:\\000 Documentos de Campo"
    python scripts/seed_postos_caminhos.py --root ... --dry-run

Idempotente: ON CONFLICT (prefixo) DO UPDATE. Rode à vontade.

Variáveis de ambiente:
  DATABASE_URL_INDEXER  conn string com permissão nas tabelas alvo
  INDEXER_ROOT_PATH     raiz se --root não for passado

Sumário final reportado em stdout (JSON):
  {"achados": X, "nao_encontrados": Y, "ambiguos": Z, "duracao_s": N}
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import psycopg
import structlog
from dotenv import load_dotenv
from unidecode import unidecode

log = structlog.get_logger(__name__)

# Mapeia codigo de tipos_dado -> nome da subpasta no HD. Extraído de
# docs/repositorio-cliente.md §3. Matching é case/acento-insensitive, mas
# gravamos o nome canônico em postos_caminhos.tipo_dado.
PASTA_POR_TIPO = {
    "Fluviometria": "Fluviometria",
    "FluviometriaANA": "Fluviometria/ANA",
    "FluviometriaQualiAgua": "Fluviometria/QualiAgua",
    "Piezometria": "Piezometria",
    "Pluviometria": "Pluviometria",
    "QualiAgua": "QualiAgua",
}


def _norm(texto: str) -> str:
    return re.sub(r"\s+", " ", unidecode(texto).strip().lower())


def _carregar_tipos_dado(conn: psycopg.Connection) -> list[tuple[str, re.Pattern, bool]]:
    """Retorna [(codigo, regex_compilada, usa_prefixo_ana)]."""
    with conn.cursor() as cur:
        cur.execute("SELECT codigo, regex_prefixo, usa_prefixo_ana FROM tipos_dado")
        return [(codigo, re.compile(rx), usa_ana) for codigo, rx, usa_ana in cur.fetchall()]


def _inferir_tipo_dado(
    prefixo: str, prefixo_ana: str | None,
    tipos: list[tuple[str, re.Pattern, bool]],
) -> str | None:
    """Bate o prefixo contra cada regex de tipos_dado.

    Ambiguidade: Fluviometria e FluviometriaQualiAgua compartilham regex
    (^[0-9][A-Z]-[0-9]{3}$). Quando o prefixo bate nos 2, marcamos como
    Fluviometria (default — QualiAgua é exceção, não regra).
    """
    candidatos: list[str] = []
    for codigo, rx, usa_ana in tipos:
        alvo = prefixo_ana if usa_ana else prefixo
        if alvo and rx.match(alvo):
            candidatos.append(codigo)

    if not candidatos:
        return None
    if "Fluviometria" in candidatos and "FluviometriaQualiAgua" in candidatos:
        return "Fluviometria"
    return candidatos[0]


def _localizar_pasta(
    raiz: Path, subpasta_tipo: str, prefixo: str,
) -> tuple[Path | None, str | None]:
    """Procura {raiz}/{subpasta_tipo}/{prefixo}[ sufixo] case-insensitive.

    Retorna (path, observacao). observacao=None em hit claro, ou
    descreve ambiguidade / sufixo detectado.
    """
    base = raiz / subpasta_tipo
    try:
        if not base.exists():
            return None, f"subpasta_ausente:{subpasta_tipo}"
    except OSError as e:
        return None, f"os_error:{e}"

    prefixo_norm = _norm(prefixo)
    candidatos: list[Path] = []

    try:
        with os.scandir(base) as it:
            for entry in it:
                if not entry.is_dir(follow_symlinks=False):
                    continue
                nome_norm = _norm(entry.name)
                if nome_norm == prefixo_norm:
                    return Path(entry.path), None
                if nome_norm.startswith(prefixo_norm + " "):
                    candidatos.append(Path(entry.path))
    except PermissionError:
        return None, "sem_permissao"
    except OSError as e:
        return None, f"os_error:{e}"

    if not candidatos:
        return None, "nao_encontrado"
    if len(candidatos) == 1:
        return candidatos[0], f"sufixo:{candidatos[0].name}"

    # Múltiplos hits — escolhe o sem "paralisado" primeiro se houver.
    nao_paralisados = [c for c in candidatos if "paralisa" not in _norm(c.name)]
    if len(nao_paralisados) == 1:
        escolha = nao_paralisados[0]
        return escolha, f"ambiguo_mas_unico_ativo:{escolha.name}"
    return candidatos[0], f"ambiguo:{[c.name for c in candidatos]}"


def _upsert_caminho(
    conn: psycopg.Connection,
    *,
    prefixo: str,
    caminho: str,
    tipo_dado: str,
    ativo: bool,
    observacao: str | None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO postos_caminhos
              (prefixo, caminho_unc, tipo_dado, ativo, observacao, verificado_em)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT (prefixo) DO UPDATE SET
              caminho_unc   = EXCLUDED.caminho_unc,
              tipo_dado     = EXCLUDED.tipo_dado,
              ativo         = EXCLUDED.ativo,
              observacao    = EXCLUDED.observacao,
              verificado_em = NOW(),
              updated_at    = NOW()
            """,
            (prefixo, caminho, tipo_dado, ativo, observacao),
        )


def executar(raiz: Path, conn_str: str, *, dry_run: bool) -> int:
    if not raiz.exists() or not raiz.is_dir():
        log.error("raiz_invalida", raiz=str(raiz))
        return 3

    inicio = time.monotonic()
    sumario = {
        "total_postos": 0,
        "achados": 0,
        "nao_encontrados": 0,
        "sem_tipo_dado": 0,
        "ambiguos": 0,
    }
    amostras_nao_encontrados: list[str] = []
    amostras_ambiguos: list[str] = []

    with psycopg.connect(conn_str) as conn:
        tipos = _carregar_tipos_dado(conn)
        log.info("tipos_dado_carregados", qtd=len(tipos))

        with conn.cursor() as cur:
            cur.execute(
                "SELECT prefixo, prefixo_ana FROM postos ORDER BY prefixo",
            )
            postos = cur.fetchall()

        log.info("postos_carregados", qtd=len(postos))
        sumario["total_postos"] = len(postos)

        for prefixo, prefixo_ana in postos:
            tipo = _inferir_tipo_dado(prefixo, prefixo_ana, tipos)
            if tipo is None:
                sumario["sem_tipo_dado"] += 1
                if not dry_run:
                    _upsert_caminho(
                        conn,
                        prefixo=prefixo,
                        caminho="",
                        tipo_dado="Desconhecido",
                        ativo=False,
                        observacao="tipo_dado_nao_inferivel_do_prefixo",
                    )
                continue

            subpasta = PASTA_POR_TIPO.get(tipo, tipo)
            chave_busca = prefixo_ana.zfill(8) if (
                tipo == "FluviometriaANA" and prefixo_ana and prefixo_ana.isdigit()
            ) else prefixo

            caminho, obs = _localizar_pasta(raiz, subpasta, chave_busca)

            if caminho is None:
                sumario["nao_encontrados"] += 1
                if len(amostras_nao_encontrados) < 15:
                    amostras_nao_encontrados.append(f"{prefixo} ({tipo}): {obs}")
                if not dry_run:
                    _upsert_caminho(
                        conn,
                        prefixo=prefixo,
                        caminho=str(raiz / subpasta / chave_busca),
                        tipo_dado=tipo,
                        ativo=False,
                        observacao=obs or "nao_encontrado",
                    )
                continue

            sumario["achados"] += 1
            if obs and obs.startswith("ambiguo"):
                sumario["ambiguos"] += 1
                if len(amostras_ambiguos) < 15:
                    amostras_ambiguos.append(f"{prefixo}: {obs}")

            if not dry_run:
                _upsert_caminho(
                    conn,
                    prefixo=prefixo,
                    caminho=str(caminho),
                    tipo_dado=tipo,
                    ativo=True,
                    observacao=obs,
                )

        if not dry_run:
            conn.commit()

    duracao = time.monotonic() - inicio
    relatorio = {
        **sumario,
        "duracao_s": round(duracao, 2),
        "modo": "dry_run" if dry_run else "persistencia",
        "amostras_nao_encontrados": amostras_nao_encontrados,
        "amostras_ambiguos": amostras_ambiguos,
    }
    print(json.dumps(relatorio, ensure_ascii=False, indent=2))
    log.info("seed_concluido", **sumario, duracao_s=round(duracao, 2))
    return 0


def main() -> int:
    load_dotenv(".env.local")
    load_dotenv(".env")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=os.environ.get("INDEXER_ROOT_PATH"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.root:
        print("erro: informe --root ou INDEXER_ROOT_PATH", file=sys.stderr)
        return 1

    conn_str = os.environ.get("DATABASE_URL_INDEXER") or os.environ.get("DATABASE_URL")
    if not conn_str:
        print("erro: defina DATABASE_URL_INDEXER (ou DATABASE_URL)", file=sys.stderr)
        return 1

    return executar(Path(args.root), conn_str, dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
