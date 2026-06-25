"""
Importa malha de municipios SP do IBGE para a tabela `ibge_municipios_sp`.

Fonte: API publica IBGE
  https://servicodados.ibge.gov.br/api/v3/malhas/estados/35?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=intermediaria

  - estados/35 = Sao Paulo (codigo UF)
  - intrarregiao=municipio devolve um Feature por municipio
  - qualidade=intermediaria balanceia precisao vs tamanho do arquivo
  - SRID 4674 (SIRGAS 2000), padrao IBGE

Tambem complementa nome do municipio chamando
  https://servicodados.ibge.gov.br/api/v1/localidades/estados/35/municipios
(a malha vem com codigo_ibge mas sem nome).

Idempotente: usa INSERT ... ON CONFLICT no codigo_ibge.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/seed/importar_ibge_municipios.py
"""

import gzip
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

import psycopg


URL_MALHA = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/estados/35"
    "?formato=application/vnd.geo+json"
    "&intrarregiao=municipio"
    "&qualidade=intermediaria"
)
URL_NOMES = (
    "https://servicodados.ibge.gov.br/api/v1/localidades/estados/35/municipios"
)


def carregar_database_url() -> str:
    env = Path(".env.local").read_text(encoding="utf-8")
    match = re.search(r"^DATABASE_URL\s*=\s*(.+)$", env, re.MULTILINE)
    if not match:
        raise SystemExit("DATABASE_URL ausente em .env.local")
    return match.group(1).strip().strip('"').strip("'")


def baixar_json(url: str) -> dict:
    print(f"  baixando {url[:80]}...")
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "SPAguas-Importer/1.0",
            "Accept-Encoding": "gzip, deflate, identity",
            "Accept": "application/json, application/vnd.geo+json",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        raw = resp.read()
        encoding = resp.headers.get("Content-Encoding", "").lower()
        if encoding == "gzip" or (len(raw) >= 2 and raw[:2] == b"\x1f\x8b"):
            raw = gzip.decompress(raw)
        elif encoding == "deflate":
            import zlib
            raw = zlib.decompress(raw)
        return json.loads(raw.decode("utf-8"))


def main() -> None:
    print("=== Importando malha municipal IBGE SP ===")
    print()

    nomes_raw = baixar_json(URL_NOMES)
    nomes = {str(m["id"]): m["nome"] for m in nomes_raw}
    print(f"  {len(nomes)} municipios catalogados (nomes)")

    malha = baixar_json(URL_MALHA)
    features = malha.get("features", [])
    print(f"  {len(features)} features na malha")
    print()

    url = carregar_database_url()
    inseridos = 0
    atualizados = 0
    sem_nome = 0

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        for feat in features:
            props = feat.get("properties") or {}
            geom = feat.get("geometry")
            if not geom:
                continue

            # API pode devolver codigo em codarea, ID, CD_MUN ou no proprio properties
            codigo = (
                props.get("codarea")
                or props.get("CD_MUN")
                or props.get("id")
                or feat.get("id")
            )
            if not codigo:
                continue
            codigo = str(codigo).strip()
            if len(codigo) == 6:
                # Codigo curto, completar com prefixo da UF
                codigo = "35" + codigo
            codigo = codigo[:7]

            nome = nomes.get(codigo) or props.get("nome") or props.get("NM_MUN")
            if not nome:
                sem_nome += 1
                nome = f"MUNICIPIO {codigo}"

            geom_json = json.dumps(geom)

            cur.execute(
                """
                INSERT INTO ibge_municipios_sp (codigo_ibge, nome, uf, geom)
                VALUES (
                    %s, %s, 'SP',
                    ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4674))
                )
                ON CONFLICT (codigo_ibge) DO UPDATE
                  SET nome = EXCLUDED.nome,
                      geom = EXCLUDED.geom
                RETURNING (xmax = 0) AS inserido
                """,
                (codigo, nome, geom_json),
            )
            inserido = cur.fetchone()[0]
            if inserido:
                inseridos += 1
            else:
                atualizados += 1

        # Atualiza area_km2 a partir da geometria (geography, m^2 -> km^2)
        cur.execute(
            """
            UPDATE ibge_municipios_sp
               SET area_km2 = ROUND((ST_Area(geom::geography) / 1000000.0)::numeric, 4)
             WHERE area_km2 IS NULL
            """
        )

        cur.execute("SELECT COUNT(*) FROM ibge_municipios_sp")
        total = cur.fetchone()[0]
        cur.execute(
            "SELECT codigo_ibge, nome, ROUND(area_km2, 1) FROM ibge_municipios_sp "
            "ORDER BY area_km2 DESC LIMIT 3"
        )
        maiores = cur.fetchall()

        conn.commit()

    print(f"OK. Inseridos: {inseridos}. Atualizados: {atualizados}. Sem nome: {sem_nome}.")
    print(f"Total na tabela: {total} municipios SP.")
    print(f"Maiores por area (km2): {maiores}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAbortado pelo usuario.")
        sys.exit(130)
