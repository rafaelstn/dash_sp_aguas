@echo off
REM Wrapper para o Task Scheduler rodar o backup diario do banco.
REM Agendado por scripts/backup/backup_banco.py (ver README). Loga em data/backups/backup.log.
cd /d "f:\Projetos\Clientes\GOV\SPAGUAS - Ficha Tecnica"
"ops\indexer\.venv\Scripts\python.exe" "scripts\backup\backup_banco.py" >> "data\backups\backup.log" 2>&1
