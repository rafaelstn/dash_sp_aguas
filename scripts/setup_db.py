"""Orquestra setup idempotente do banco (chamado pelo start.ps1).

Responsabilidades:
  1. Verificar conectividade com DATABASE_URL (com retry exponencial).
  2. Aplicar migrations se schema ausente.
  3. Executar importer se tabela postos vazia.
  4. Gravar sentinel `.run/db-ready` ao final pra próximas execuções pularem
     verificação desnecessária quando nada mudou.

Resiliência:
  - Pooler Supabase pode cancelar queries triviais com `statement_timeout`
    quando o pool está saturado. Retry exponencial (2s → 5s → 10s) cobre
    essas intermitências sem falhar o start.
  - Se a verificação falhar mas o sentinel for recente (< SENTINEL_TTL_HORAS),
    continuamos com warning — o banco já foi validado há pouco e a falha é
    quase certamente transitória do pooler.

Exit codes:
  0 — banco pronto (ou sentinel recente + falha transitória).
  2 — falha real (migrations/importer quebraram, ou sem sentinel + falha).

Uso:
  python scripts/setup_db.py [--force]
    --force  ignora sentinel e reverifica do zero.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env.local"
MIGRATIONS_SCRIPT = ROOT / "scripts" / "apply_migrations.py"
IMPORTER_SCRIPT = ROOT / "ops" / "importer" / "import_csv.py"
SENTINEL_DIR = ROOT / ".run"
SENTINEL_FILE = SENTINEL_DIR / "db-ready"

# Sentinel válido por 24h — depois disso reverifica do zero pra detectar
# mudanças que alguém possa ter feito fora do start.ps1 (reset manual, etc.).
SENTINEL_TTL_HORAS = 24

# Backoff: 0 (imediato), 2s, 5s, 10s — cobre picos típicos de saturação do pooler.
BACKOFF_SEGUNDOS = [0, 2, 5, 10]


def log(msg: str) -> None:
    print(msg, flush=True)


def hash_url(url: str) -> str:
    """Hash curto da connection string pra detectar mudança de banco."""
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def ler_sentinel() -> dict[str, str] | None:
    if not SENTINEL_FILE.exists():
        return None
    try:
        linhas = SENTINEL_FILE.read_text(encoding="utf-8").splitlines()
        dados: dict[str, str] = {}
        for linha in linhas:
            if "=" in linha:
                k, v = linha.split("=", 1)
                dados[k.strip()] = v.strip()
        return dados or None
    except OSError:
        return None


def sentinel_valido(url: str) -> tuple[bool, str]:
    """Retorna (usar_sentinel, motivo_caso_nao_valido)."""
    dados = ler_sentinel()
    if not dados:
        return False, "sentinel ausente"
    if dados.get("URL_HASH") != hash_url(url):
        return False, "DATABASE_URL mudou desde a última verificação"
    ready_at = dados.get("READY_AT", "")
    try:
        dt = datetime.fromisoformat(ready_at)
    except ValueError:
        return False, "sentinel com timestamp inválido"
    idade_horas = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
    if idade_horas > SENTINEL_TTL_HORAS:
        return False, f"sentinel expirado ({idade_horas:.1f}h > {SENTINEL_TTL_HORAS}h)"
    return True, ""


def gravar_sentinel(url: str, total_postos: int) -> None:
    SENTINEL_DIR.mkdir(parents=True, exist_ok=True)
    conteudo = (
        f"URL_HASH={hash_url(url)}\n"
        f"READY_AT={datetime.now(timezone.utc).isoformat()}\n"
        f"POSTOS={total_postos}\n"
    )
    SENTINEL_FILE.write_text(conteudo, encoding="utf-8")


def conectar_com_retry(url: str) -> psycopg.Connection:
    """Abre conexão com retry exponencial em falhas transitórias."""
    ultima_erro: Exception | None = None
    for tentativa, delay in enumerate(BACKOFF_SEGUNDOS, start=1):
        if delay:
            log(f"[setup] Aguardando {delay}s antes da tentativa {tentativa}...")
            time.sleep(delay)
        try:
            return psycopg.connect(url, connect_timeout=10)
        except (psycopg.OperationalError, psycopg.errors.QueryCanceled) as e:
            ultima_erro = e
            log(f"[setup] Tentativa {tentativa} falhou: {e}")
    assert ultima_erro is not None
    raise ultima_erro


def tabela_postos_existe(conn: psycopg.Connection) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'postos'
            """
        )
        return cur.fetchone() is not None


def contar_postos(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM postos")
        return int(cur.fetchone()[0])


def rodar(script: Path, *args: str) -> int:
    cmd = [sys.executable, str(script), *args]
    log(f"  $ {' '.join(cmd)}")
    resultado = subprocess.run(cmd, cwd=ROOT)
    return resultado.returncode


def main() -> int:
    load_dotenv(ENV_PATH)
    url = os.environ.get("DATABASE_URL")
    if not url:
        log("[setup] DATABASE_URL ausente — pulando setup de banco (modo demo).")
        return 0

    force = "--force" in sys.argv[1:]

    if not force:
        usar, motivo = sentinel_valido(url)
        if usar:
            dados = ler_sentinel() or {}
            log(
                f"[setup] Sentinel válido ({dados.get('POSTOS', '?')} postos, "
                f"ready_at={dados.get('READY_AT', '?')}). Pulando verificação."
            )
            return 0
        log(f"[setup] Sentinel não aplicável: {motivo}. Verificando do zero.")

    try:
        with conectar_com_retry(url) as conn:
            if not tabela_postos_existe(conn):
                log("[setup] Schema não encontrado. Aplicando 19 migrations...")
                rc = rodar(MIGRATIONS_SCRIPT)
                if rc != 0:
                    log("[setup] Falha ao aplicar migrations.")
                    return 2
                log("[setup] Migrations aplicadas.")
            else:
                log("[setup] Schema já existe. Pulando migrations.")

        with conectar_com_retry(url) as conn:
            total = contar_postos(conn)
            if total == 0:
                log("[setup] Tabela postos vazia. Executando importer do CSV...")
                rc = rodar(IMPORTER_SCRIPT)
                if rc == 2:
                    log(
                        "[setup] Importer abortou por prefixo duplicado. "
                        "Corrija o CSV (ver import_log) e rode novamente."
                    )
                    return 2
                if rc != 0:
                    log(f"[setup] Importer falhou (exit {rc}).")
                    return 2
                with conectar_com_retry(url) as c2:
                    total = contar_postos(c2)
                log(f"[setup] Importer carregou {total} postos.")
            else:
                log(f"[setup] Postos já carregados ({total}). Pulando importer.")

        gravar_sentinel(url, total)
        log("[setup] Banco pronto. Sentinel gravado.")
        return 0

    except psycopg.Error as e:
        log(f"[setup] Falha após {len(BACKOFF_SEGUNDOS)} tentativas: {e}")
        # Fallback: se o sentinel é recente, seguimos em frente. Banco estava OK
        # há pouco; provável intermitência do pooler, não problema real.
        usar, _ = sentinel_valido(url)
        if usar and not force:
            log(
                "[setup] Sentinel recente disponível — continuando apesar da falha. "
                "Se o dashboard não responder, rode: python scripts/setup_db.py --force"
            )
            return 0
        return 2


if __name__ == "__main__":
    sys.exit(main())
