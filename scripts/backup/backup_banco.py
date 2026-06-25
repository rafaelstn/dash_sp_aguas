"""Backup logico do banco (dump dos dados do schema public) sem depender de
pg_dump/Docker. Cada tabela vira um CSV gzipado E CIFRADO em
data/backups/<timestamp>/<tabela>.csv.gz.enc.

LGPD: o dump contem dados pessoais de agentes (nome, GPS, IP). Por isso o
artefato e cifrado em repouso com Fernet (AES-128-CBC + HMAC-SHA256), chave
simetrica lida de BACKUP_ENCRYPTION_KEY. Sem a chave o backup NAO roda (fail-safe:
melhor falhar do que gravar dado pessoal em claro no disco).

Gerar a chave uma vez e guardar no .env.local (e no cofre do orgao):
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Restauracao: aplicar as migrations (scripts/db/apply_migrations.py) num banco limpo
e depois, para cada arquivo, decifrar e descomprimir antes do COPY FROM:
    python -c "import sys,gzip;from cryptography.fernet import Fernet;import os;\
print(gzip.decompress(Fernet(os.environ['BACKUP_ENCRYPTION_KEY'].encode()).decrypt(open(sys.argv[1],'rb').read())).decode())" tabela.csv.gz.enc

Uso:
    ops/indexer/.venv/Scripts/python.exe scripts/backup/backup_banco.py
    (agendavel no Task Scheduler do Windows para rodar diario)

Le DATABASE_URL e BACKUP_ENCRYPTION_KEY do .env.local. Idempotente: cria uma
pasta nova por execucao.
"""
from __future__ import annotations

import gzip
import io
import os
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from cryptography.fernet import Fernet
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
RETENCAO = 14  # mantem os 14 backups mais recentes


def _carregar_cifra() -> Fernet:
    """Carrega a chave de cifra. Falha se ausente ou invalida (fail-safe)."""
    chave = os.environ.get("BACKUP_ENCRYPTION_KEY", "").strip()
    if not chave:
        raise SystemExit(
            "erro: BACKUP_ENCRYPTION_KEY ausente no .env.local. O backup contem "
            "dados pessoais e nao pode ser gravado em claro (LGPD). Gere a chave com:\n"
            "  python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(chave.encode())
    except (ValueError, TypeError) as e:
        raise SystemExit(f"erro: BACKUP_ENCRYPTION_KEY invalida ({e}).")


def main() -> int:
    load_dotenv(ROOT / ".env.local")
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("erro: DATABASE_URL ausente no .env.local", file=sys.stderr)
        return 1

    cifra = _carregar_cifra()

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = ROOT / "data" / "backups"
    outdir = base / stamp
    outdir.mkdir(parents=True, exist_ok=True)
    # ACL best-effort: restringe a pasta ao dono (efetivo em POSIX; no Windows
    # o controle real e via ACL do NTFS, documentado no runbook de backup).
    try:
        os.chmod(base, stat.S_IRWXU)
        os.chmod(outdir, stat.S_IRWXU)
    except OSError:
        pass

    total = 0
    with psycopg.connect(url) as con, con.cursor() as cur:
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='public' AND table_type='BASE TABLE' "
            "ORDER BY table_name"
        )
        tabelas = [r[0] for r in cur.fetchall()]
        print(f"backup de {len(tabelas)} tabelas (cifrado) -> {outdir}")
        for t in tabelas:
            destino = outdir / f"{t}.csv.gz.enc"
            # Comprime em memoria, depois cifra o blob inteiro. Tabelas deste
            # sistema sao modestas (MBs); para volumes muito maiores, migrar
            # para cifra em streaming (AES-GCM por blocos).
            buf = io.BytesIO()
            with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
                with cur.copy(
                    f'COPY public."{t}" TO STDOUT WITH (FORMAT csv, HEADER true)'
                ) as copy:
                    for bloco in copy:
                        gz.write(bloco)
            destino.write_bytes(cifra.encrypt(buf.getvalue()))
            cur.execute(f'SELECT count(*) FROM public."{t}"')
            n = cur.fetchone()[0]
            total += n
            print(f"  {t}: {n}")

    # Retencao: remove backups antigos alem do limite.
    pastas = sorted([p for p in base.iterdir() if p.is_dir()], reverse=True)
    for antiga in pastas[RETENCAO:]:
        for f in antiga.iterdir():
            f.unlink()
        antiga.rmdir()

    print(f"\nOK backup concluido: {total} linhas, {len(tabelas)} tabelas em {stamp}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
