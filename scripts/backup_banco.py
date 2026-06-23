"""Backup logico do banco (dump dos dados do schema public) sem depender de
pg_dump/Docker. Cada tabela vira um CSV gzipado em data/backups/<timestamp>/.

Restauracao: aplicar as migrations (scripts/apply_migrations.py) num banco limpo
e depois COPY FROM de cada CSV (ver restore_banco.py, ou COPY manual). O schema
vem das migrations versionadas no git; este backup guarda apenas os DADOS.

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/backup_banco.py
    (agendavel no Task Scheduler do Windows para rodar diario)

Le DATABASE_URL do .env.local. Idempotente: cria uma pasta nova por execucao.
"""
from __future__ import annotations

import gzip
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
RETENCAO = 14  # mantem os 14 backups mais recentes


def main() -> int:
    load_dotenv(ROOT / ".env.local")
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("erro: DATABASE_URL ausente no .env.local", file=sys.stderr)
        return 1

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    outdir = ROOT / "data" / "backups" / stamp
    outdir.mkdir(parents=True, exist_ok=True)

    total = 0
    with psycopg.connect(url) as con, con.cursor() as cur:
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public' AND table_type='BASE TABLE' "
            "ORDER BY table_name"
        )
        tabelas = [r[0] for r in cur.fetchall()]
        print(f"backup de {len(tabelas)} tabelas -> {outdir}")
        for t in tabelas:
            destino = outdir / f"{t}.csv.gz"
            with gzip.open(destino, "wb") as gz:
                with cur.copy(
                    f'COPY public."{t}" TO STDOUT WITH (FORMAT csv, HEADER true)'
                ) as copy:
                    for bloco in copy:
                        gz.write(bloco)
            cur.execute(f'SELECT count(*) FROM public."{t}"')
            n = cur.fetchone()[0]
            total += n
            print(f"  {t}: {n}")

    # Retencao: remove backups antigos alem do limite.
    base = ROOT / "data" / "backups"
    pastas = sorted([p for p in base.iterdir() if p.is_dir()], reverse=True)
    for antiga in pastas[RETENCAO:]:
        for f in antiga.iterdir():
            f.unlink()
        antiga.rmdir()

    print(f"\nOK backup concluido: {total} linhas, {len(tabelas)} tabelas em {stamp}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
