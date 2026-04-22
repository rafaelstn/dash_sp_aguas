# Importer — CSV oficial SPÁguas

Script one-shot que carrega o CSV `Postos_PLU_FLU_PIEZO_CIAS_BAT_MUNIC_UGRHI_SUB_OTTO-*-csv.csv` na tabela `postos` do PostgreSQL.

## Pré-requisitos

1. Python 3.12+ (usar `uv` é recomendado).
2. Migrations aplicadas no banco-alvo (`supabase/migrations/*.sql`).
3. `.env.local` configurado com `DATABASE_URL_IMPORTER` (role com permissão de INSERT/UPDATE em `postos` e `import_log`).

## Instalação

```bash
cd ops/importer
uv venv
uv pip install -e .
```

Ou com pip tradicional:

```bash
cd ops/importer
python -m venv .venv
.venv\\Scripts\\activate          # Windows
pip install -e .
```

## Execução

A partir da raiz do projeto:

```bash
python ops/importer/import_csv.py --csv "./Postos_PLU_FLU_PIEZO_CIAS_BAT_MUNIC_UGRHI_SUB_OTTO-18-03-26a-csv.csv"
```

Ou com o caminho vindo do `.env.local` (`IMPORTER_CSV_PATH`):

```bash
python ops/importer/import_csv.py
```

## Comportamento

1. Calcula `sha256` do CSV e abre registro em `import_log` com status `em_andamento`.
2. Detecta prefixos duplicados **na fonte** (RN-05.1). Se houver:
   - Grava `erros_amostra` em `import_log` com status `erro`.
   - Aborta com código de saída `2` sem gravar nenhum posto.
3. Sem duplicados: aplica `INSERT ... ON CONFLICT (prefixo) DO UPDATE` linha a linha.
4. Fecha `import_log` com totais (lidas, inseridas, atualizadas, rejeitadas) e status `ok`.

## Códigos de saída

| Código | Significado |
|--------|-------------|
| `0` | Importação concluída com sucesso |
| `1` | Argumentos/ambiente inválidos |
| `2` | Prefixos duplicados na fonte — revisar CSV antes de reexecutar |
| `3` | CSV inexistente |
| `4` | Falha de banco |
