# Runbook — Backup cifrado do banco

Procedimento operacional do backup lógico do banco (dados do schema `public`).
O artefato contém dados pessoais de agentes (nome, GPS, IP), portanto é cifrado
em repouso (LGPD, art. 46). Script: `scripts/backup/backup_banco.py`.

## Mecanismo

- Cada tabela vira `data/backups/<timestamp>/<tabela>.csv.gz.enc`.
- Compressão gzip seguida de cifra simétrica **Fernet** (AES-128-CBC + HMAC-SHA256).
- Chave em `BACKUP_ENCRYPTION_KEY` (env, lida do `.env.local`).
- Retenção: 14 execuções mais recentes.
- `data/backups/` está fora do versionamento (`.gitignore`).

## Ativação (uma vez)

1. Gerar a chave:
   ```
   ops/indexer/.venv/Scripts/python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
2. Adicionar ao `.env.local` (e ao cofre de segredos do órgão, fora do repo):
   ```
   BACKUP_ENCRYPTION_KEY=<chave gerada>
   ```
3. Guardar a chave em local seguro e separado dos backups. **Sem a chave os
   backups são irrecuperáveis** e, sem ela configurada, o script não roda
   (fail-safe: não grava dado pessoal em claro).

## Execução

```
ops/indexer/.venv/Scripts/python.exe scripts/backup/backup_banco.py
```

Agendável no Agendador de Tarefas do Windows via `scripts/backup/backup_banco.bat`.

## Controle de acesso da pasta (ACL)

O script aplica permissão restrita ao dono (`chmod 700`), efetiva em ambientes
POSIX. No Windows, restringir a pasta `data\backups` pela ACL do NTFS:

```
icacls "data\backups" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"
```

## Restauração

1. Aplicar as migrations num banco limpo: `scripts/db/apply_migrations.py`.
2. Para cada arquivo, decifrar e descomprimir antes do `COPY FROM`:
   ```
   ops/indexer/.venv/Scripts/python.exe -c "import sys,gzip,os;from cryptography.fernet import Fernet;sys.stdout.buffer.write(gzip.decompress(Fernet(os.environ['BACKUP_ENCRYPTION_KEY'].encode()).decrypt(open(sys.argv[1],'rb').read())))" tabela.csv.gz.enc > tabela.csv
   ```
3. `COPY public."tabela" FROM 'tabela.csv' WITH (FORMAT csv, HEADER true);`

## Rotação da chave

Trocar a chave invalida os backups antigos cifrados com a anterior. Ao rotacionar,
manter a chave antiga arquivada enquanto houver backups dependentes dela dentro da
janela de retenção.
